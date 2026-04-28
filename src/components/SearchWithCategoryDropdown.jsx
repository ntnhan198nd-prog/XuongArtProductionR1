"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiSearch, FiX } from "react-icons/fi";

const PROJECT_SUGGESTION_LIMIT = 8;

// Diacritic-insensitive comparison so a Vietnamese user typing "tim" matches
// titles containing "Tìm". Force NFC first so the strip-combining-marks
// pass below produces a one-codepoint-per-character output that maps 1:1
// back onto the original string for highlight slicing.
function normalizeForSearch(value) {
  return String(value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Highlight occurrences of `match` inside `text`, ignoring diacritics and
// case. Position mapping works because both `original` and `normText` are
// derived from the same NFC string with a 1:1 codepoint correspondence.
function highlight(text, match) {
  if (!text) return "";
  if (!match) return text;
  const original = String(text).normalize("NFC");
  const normText = normalizeForSearch(original);
  const normMatch = normalizeForSearch(match);
  if (!normMatch) return original;
  const idx = normText.indexOf(normMatch);
  if (idx === -1) return original;
  return (
    <>
      {original.slice(0, idx)}
      <span className="font-semibold text-black">
        {original.slice(idx, idx + normMatch.length)}
      </span>
      {original.slice(idx + normMatch.length)}
    </>
  );
}

export default function SearchWithCategoryDropdown({
  query,
  onQueryChange,
  categories = [],
  onCategorySelect,
  projects = [],
  onProjectSelect,
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

  const handleSelectCategory = (cat) => {
    onCategorySelect?.(cat);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleSelectProject = (project) => {
    onProjectSelect?.(project);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const trimmedQuery = (query || "").trim();
  const isSearching = trimmedQuery.length > 0;
  const normQuery = normalizeForSearch(trimmedQuery);

  // While typing, surface up to N matching projects so the user can jump
  // directly into a project from the dropdown instead of scanning the grid.
  // Match against the diacritic-stripped form of each field so users typing
  // "cellphones" find a project tagged "Cellphones" *and* one tagged
  // "Cellphónes" (or any accented variant) without thinking about it.
  const matchedProjects = useMemo(() => {
    if (!isSearching || !Array.isArray(projects) || projects.length === 0) {
      return [];
    }
    return projects
      .filter((p) =>
        [p.title, p.client, p.tagline].some((field) =>
          normalizeForSearch(field).includes(normQuery)
        )
      )
      .slice(0, PROJECT_SUGGESTION_LIMIT);
  }, [projects, normQuery, isSearching]);

  // Filter category list by query too — keeps everything searchable from the
  // same input. Always keep "Tất cả" available so the user can reset.
  const filteredCategories = useMemo(() => {
    if (!isSearching) return categories;
    return categories.filter(
      (cat) => cat === "Tất cả" || normalizeForSearch(cat).includes(normQuery)
    );
  }, [categories, normQuery, isSearching]);

  const hasResults =
    matchedProjects.length > 0 || filteredCategories.length > 0;

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
            className={`h-full w-full border-none bg-transparent pl-12 text-sm text-black placeholder:text-gray-500 focus:outline-none ${
              query ? "pr-12" : "pr-4"
            }`}
            placeholder={placeholder}
            value={query}
            onChange={(e) => onQueryChange?.(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onClick={() => setIsOpen(true)}
            onKeyDown={(e) => {
              // IME composition guard — Vietnamese Telex/VNI (and similar
              // input methods) commit the composing buffer on Enter, which
              // re-emits the same text into the input. Without this guard the
              // value ends up doubled (e.g. "cell" + commit → "cellcell").
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;

              if (e.key === "Escape") {
                setIsOpen(false);
                e.currentTarget.blur();
              } else if (e.key === "Enter") {
                // Commit the current query: close the dropdown so the user
                // sees the live-filtered grid behind it. The grid is already
                // matching against title/client/tagline, so the query state
                // is enough — no extra submit step needed.
                e.preventDefault();
                setIsOpen(false);
                e.currentTarget.blur();
              }
            }}
          />
          {query ? (
            <button
              type="button"
              // onMouseDown.preventDefault keeps the input focused so the
              // dropdown doesn't flicker shut from a click-outside detection
              // before the click handler runs.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onQueryChange?.("");
                inputRef.current?.focus();
              }}
              aria-label="Xoá tìm kiếm"
              className="absolute right-3 flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <FiX className="text-base" />
            </button>
          ) : null}
        </div>

        <AnimatePresence initial={false}>
          {isOpen && (categories.length > 0 || isSearching) && (
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
              <div className="max-h-80 overflow-y-auto border-t border-gray-100">
                {isSearching && matchedProjects.length > 0 ? (
                  <div>
                    <div className="bg-gray-50 px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Dự án ({matchedProjects.length})
                    </div>
                    {matchedProjects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectProject(project)}
                        className="block w-full border-b border-gray-100 px-5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-gray-50"
                      >
                        <div className="text-sm text-black">
                          {highlight(project.title || "(Không tên)", trimmedQuery)}
                        </div>
                        {project.client ? (
                          <div className="mt-0.5 text-xs text-gray-500">
                            {highlight(project.client, trimmedQuery)}
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}

                {filteredCategories.length > 0 ? (
                  <div>
                    {isSearching && matchedProjects.length > 0 ? (
                      <div className="bg-gray-50 px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Danh mục
                      </div>
                    ) : null}
                    {filteredCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectCategory(cat)}
                        className="block w-full border-b border-gray-100 px-5 py-3 text-left text-sm text-black transition-colors last:border-b-0 hover:bg-gray-50"
                      >
                        {isSearching ? highlight(cat, trimmedQuery) : cat}
                      </button>
                    ))}
                  </div>
                ) : null}

                {isSearching && !hasResults ? (
                  <div className="px-5 py-6 text-center text-sm text-gray-500">
                    Không tìm thấy kết quả cho &quot;{trimmedQuery}&quot;
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
