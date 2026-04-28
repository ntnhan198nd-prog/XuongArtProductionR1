"use client";

import { useEffect } from "react";

// Lock background scroll while a modal is open. Single source of truth so
// the three previous implementations (one per modal) can't drift apart.
//
// Why overflow:hidden on <html>, not position:fixed on <body>:
//   - position:fixed approach saves scrollY to state then restores it on
//     unmount. If the component unmounts during a route transition or
//     re-render, the restore can land on the wrong scroll position.
//   - overflow:hidden simply freezes scroll where it already is. The only
//     side-effect is the scrollbar disappearing, which we offset with
//     paddingRight so the page does not shift horizontally.
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    if (typeof document === "undefined") return undefined;

    const docEl = document.documentElement;
    const previous = {
      overflow: docEl.style.overflow,
      paddingRight: docEl.style.paddingRight,
    };
    const scrollbarWidth = window.innerWidth - docEl.clientWidth;
    docEl.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      docEl.style.paddingRight = `${scrollbarWidth}px`;
    }
    docEl.classList.add("modal-open");

    return () => {
      docEl.style.overflow = previous.overflow;
      docEl.style.paddingRight = previous.paddingRight;
      docEl.classList.remove("modal-open");
    };
  }, [active]);
}
