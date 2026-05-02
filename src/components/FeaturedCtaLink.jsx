"use client";

import Link from "next/link";

// "Xem tất cả dự án" CTA on the homepage. Lives in its own client
// component because page.jsx is an async server component and needs
// the mouse-enter / focus handlers below to be a client boundary.
//
// While the user is hovering / focusing this CTA, we dispatch a
// `nav-hint` custom event with the target href. The header listens
// for that event and lights up + scales its matching nav link in
// unison, so the user sees that this button leads to the same page
// as the "-động" header link.
const HINT_HREF = "/videos";

export default function FeaturedCtaLink() {
  const dispatch = (target) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("nav-hint", { detail: target }));
  };

  return (
    <Link
      href={HINT_HREF}
      className="group inline-flex shrink-0 items-center gap-3 self-start text-sm font-medium text-neutral-950 transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-95 hover:text-accent-400 focus:outline-none focus-visible:text-accent-400 sm:self-end"
      onMouseEnter={() => dispatch(HINT_HREF)}
      onMouseLeave={() => dispatch(null)}
      onFocus={() => dispatch(HINT_HREF)}
      onBlur={() => dispatch(null)}
    >
      Xem tất cả dự án
      <span
        aria-hidden
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-current transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-focus-visible:translate-x-1"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  );
}
