"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Inline dropdown that turns the active category in the page heading into a
// quick-switcher: click the yellow word to pick another category from the
// site-content category list without opening the search.
//
// Shared between /videos and /images so the two galleries stay in lockstep.
export default function CategoryQuickPicker({ active, categories, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="font-semibold text-accent-400 underline-offset-4 transition hover:underline focus:outline-none focus:underline"
      >
        {active}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
            className="absolute left-0 top-full z-30 mt-2 max-h-72 min-w-[12rem] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
          >
            {categories.map((cat) => {
              const isActive = cat === active;
              return (
                <li key={cat}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(cat);
                      setOpen(false);
                    }}
                    className={`block w-full border-b border-gray-100 px-4 py-2 text-left text-sm transition-colors last:border-b-0 ${
                      isActive
                        ? "bg-gray-100 font-semibold text-black"
                        : "text-gray-700 hover:bg-gray-50 hover:text-black"
                    }`}
                  >
                    {cat}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
