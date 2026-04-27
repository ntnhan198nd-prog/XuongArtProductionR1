"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const baseInputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-black focus:outline-none";

function normalize(str) {
  return String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export default function AutocompleteInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  multiline = false,
  rows = 3,
  className,
  splitDelimiter = null,
  required = false,
  type = "text",
  emptyHint = "Chưa có giá trị nào được lưu trước đó.",
  maxItems = 8,
  inputProps = {},
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listboxId = useId();

  const uniqueSuggestions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const item of suggestions) {
      if (item === undefined || item === null) continue;
      const text = String(item).trim();
      if (!text) continue;
      const key = normalize(text);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  }, [suggestions]);

  const activeToken = useMemo(() => {
    if (!splitDelimiter) return value ?? "";
    const text = String(value ?? "");
    const segments = text.split(splitDelimiter);
    return segments[segments.length - 1] ?? "";
  }, [value, splitDelimiter]);

  const filtered = useMemo(() => {
    const query = normalize(activeToken);
    if (!query) return uniqueSuggestions.slice(0, maxItems);
    const matches = uniqueSuggestions
      .map((item) => {
        const norm = normalize(item);
        if (norm === query) return { item, score: 0 };
        if (norm.startsWith(query)) return { item, score: 1 };
        if (norm.includes(query)) return { item, score: 2 };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .slice(0, maxItems)
      .map((entry) => entry.item);
    return matches;
  }, [activeToken, uniqueSuggestions, maxItems]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    setHighlight(-1);
  }, [activeToken, open]);

  const commit = (picked) => {
    if (splitDelimiter) {
      const text = String(value ?? "");
      const segments = text.split(splitDelimiter);
      segments[segments.length - 1] = ` ${picked}`.replace(/^\s+/, "");
      const merged = segments
        .map((seg, idx) => (idx === segments.length - 1 ? seg : seg.trim()))
        .join(splitDelimiter === ", " ? ", " : `${splitDelimiter} `)
        .replace(/\s+,/g, ",");
      onChange(`${merged}${splitDelimiter === ", " ? ", " : ""}`);
    } else {
      onChange(picked);
      setOpen(false);
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => (filtered.length === 0 ? -1 : (h + 1) % filtered.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) =>
        filtered.length === 0 ? -1 : (h - 1 + filtered.length) % filtered.length
      );
    } else if (event.key === "Enter" && highlight >= 0) {
      event.preventDefault();
      commit(filtered[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const sharedProps = {
    ref: inputRef,
    value: value ?? "",
    onChange: (event) => onChange(event.target.value),
    onFocus: () => setOpen(true),
    onClick: () => setOpen(true),
    onKeyDown: handleKeyDown,
    placeholder,
    required,
    role: "combobox",
    "aria-expanded": open,
    "aria-controls": listboxId,
    "aria-autocomplete": "list",
    className: className || baseInputCls,
    ...inputProps,
  };

  return (
    <div ref={wrapperRef} className="relative">
      {multiline ? (
        <textarea {...sharedProps} rows={rows} />
      ) : (
        <input {...sharedProps} type={type} />
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={listboxId}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">{emptyHint}</div>
            ) : (
              filtered.map((item, idx) => (
                <button
                  type="button"
                  key={`${item}-${idx}`}
                  role="option"
                  aria-selected={highlight === idx}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => commit(item)}
                  className={`block w-full truncate px-3 py-2 text-left text-sm transition-colors ${
                    highlight === idx
                      ? "bg-gray-100 text-black"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {item}
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
