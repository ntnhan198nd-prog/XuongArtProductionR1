"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiSearch } from "react-icons/fi";

export default function SearchWithCategoryDropdown({
  query,
  onQueryChange,
  categories = [],
  onCategorySelect,
  placeholder = "Tìm dự án, khách hàng...",
  closedWidth = 260,
  openWidth = 600,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (cat) => {
    onCategorySelect?.(cat);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div
      ref={containerRef}
      className="search-container relative h-[58px] max-w-full"
      style={{ width: closedWidth }}
    >
      <motion.div
        initial={false}
        animate={{
          width: isOpen ? openWidth : closedWidth,
        }}
        transition={{
          width: { duration: 0.38, ease: [0.32, 0.72, 0, 1] },
        }}
        style={{ borderRadius: 18 }}
        className={`absolute top-0 left-0 sm:left-auto sm:right-0 z-30 overflow-hidden border-2 bg-white transition-shadow duration-300 ${
          isOpen
            ? "border-gray-200 shadow-lg"
            : "border-transparent shadow-sm"
        }`}
      >
        <div className="relative flex h-[54px] items-center">
          <FiSearch className="pointer-events-none absolute left-5 text-lg text-gray-500" />
          <input
            ref={inputRef}
            className="h-full w-full border-none bg-transparent pl-12 pr-4 text-sm text-black placeholder:text-gray-500 focus:outline-none"
            placeholder={placeholder}
            value={query}
            onChange={(e) => onQueryChange?.(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onClick={() => setIsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setIsOpen(false);
                e.currentTarget.blur();
              }
            }}
          />
        </div>

        <AnimatePresence initial={false}>
          {isOpen && categories.length > 0 && (
            <motion.div
              key="suggestions"
              initial={{ height: 0, opacity: 0 }}
              animate={{
                height: "auto",
                opacity: 1,
                transition: {
                  height: { duration: 0.32, ease: [0.32, 0.72, 0, 1] },
                  opacity: { duration: 0.22, ease: "easeOut", delay: 0.05 },
                },
              }}
              exit={{
                height: 0,
                opacity: 0,
                transition: {
                  height: { duration: 0.24, ease: [0.32, 0.72, 0, 1] },
                  opacity: { duration: 0.15, ease: "easeIn" },
                },
              }}
              className="overflow-hidden"
            >
              <div className="max-h-60 overflow-y-auto border-t border-gray-100">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(cat)}
                    className="block w-full border-b border-gray-100 px-5 py-3 text-left text-sm text-black transition-colors last:border-b-0 hover:bg-gray-50"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
