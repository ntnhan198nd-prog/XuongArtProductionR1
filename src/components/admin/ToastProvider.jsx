"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// Admin notifications ("toasts"): a small stack pinned bottom-right on
// desktop and across the bottom on phones. success / info close by
// themselves; errors stay until the owner closes them (or runs their action).
//
//   const toast = useToast();
//   toast.success("Đã lưu", { href: "/videos/abc" });
//   toast.error(message, { hint, actionLabel: "Thử lại", onAction: retry });
//
// opts: { hint, href, hrefLabel, actionLabel, onAction, duration (ms), key }.
// Every call returns the toast id (null when nothing was shown), which
// toast.dismiss(id) accepts.
//
// `key` (optional) names the source, e.g. "site-content-save": a new toast
// with the same key replaces the previous one (a retry that failed again).
// Without a key, only an identical plain toast (same type + message, no
// action button) is replaced, so two panels' errors never hide each other.
//
// useToastAvoid(ref) — call it from a panel with a bar pinned to the bottom
// of the screen (e.g. a sticky Save bar): while that bar is near the bottom
// of the viewport the toast stack moves up above it.

export const MAX_VISIBLE_TOASTS = 3;
export const TOAST_AUTO_DISMISS_MS = 3500;
export const DEFAULT_HREF_LABEL = "Xem trên trang ↗";
// After the pointer / focus leaves a paused toast, give the owner at least
// this long to finish reading before it closes.
const MIN_AFTER_PAUSE_MS = 1500;

const noop = () => null;
// What useToast() returns without a provider (a panel rendered on its own,
// tests): every call is a harmless no-op.
const NOOP_TOAST_API = Object.freeze({ success: noop, error: noop, info: noop, dismiss: noop });

const ToastContext = createContext(null);
// Setter for the bottom offsets reported by useToastAvoid (null = no provider).
const ToastAvoidContext = createContext(null);

export function useToast() {
  return useContext(ToastContext) || NOOP_TOAST_API;
}

// 0 = stays until closed.
function resolveDuration(type, duration) {
  if (duration === undefined || duration === null) {
    return type === "error" ? 0 : TOAST_AUTO_DISMISS_MS;
  }
  const ms = Number(duration);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

// Newest last. Over the limit, drop the oldest toast that would close by
// itself anyway (never the one just added); only when every older toast is
// sticky does the oldest of them go.
export function capToasts(list, max = MAX_VISIBLE_TOASTS) {
  const next = [...list];
  while (next.length > Math.max(1, max)) {
    const idx = next.slice(0, -1).findIndex((item) => item.duration > 0);
    next.splice(idx === -1 ? 0 : idx, 1);
  }
  return next;
}

function buildToast(id, type, message, opts) {
  const raw = message instanceof Error ? message.message : message;
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const options = opts && typeof opts === "object" ? opts : {};
  const onAction = typeof options.onAction === "function" ? options.onAction : null;
  const actionLabel =
    onAction && typeof options.actionLabel === "string" ? options.actionLabel.trim() : "";
  return {
    id,
    type,
    message: text,
    hint: typeof options.hint === "string" ? options.hint.trim() : "",
    href: typeof options.href === "string" ? options.href.trim() : "",
    hrefLabel:
      typeof options.hrefLabel === "string" && options.hrefLabel.trim()
        ? options.hrefLabel.trim()
        : DEFAULT_HREF_LABEL,
    actionLabel,
    onAction: actionLabel ? onAction : null,
    duration: resolveDuration(type, options.duration),
    key: typeof options.key === "string" ? options.key.trim() : "",
  };
}

// Does `next` replace the already-visible `item`? Same source key, or the
// very same plain message (no key, no action on either side).
export function replacesToast(item, next) {
  if (next.key) return item.key === next.key;
  return (
    !item.key &&
    !item.onAction &&
    !next.onAction &&
    item.type === next.type &&
    item.message === next.message
  );
}

// Largest bottom bar we ever dodge: never push the stack past mid-screen.
const MAX_AVOID_FRACTION = 0.5;
// A bar reaching into this many px above the viewport bottom counts as
// "at the bottom" (the stack would cover it).
const AVOID_ZONE_PX = 240;

let avoidSeq = 0;

export function useToastAvoid(ref, enabled = true) {
  const setOffset = useContext(ToastAvoidContext);
  useEffect(() => {
    if (!setOffset || !enabled || typeof window === "undefined") return undefined;
    const node = ref?.current;
    if (!node) return undefined;
    avoidSeq += 1;
    const id = `avoid-${avoidSeq}`;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const viewport = window.innerHeight || document.documentElement.clientHeight || 0;
      // Hidden panel (display:none) → zero box → nothing to dodge.
      const onScreen = rect.height > 0 && rect.top < viewport && rect.bottom > 0;
      const nearBottom = onScreen && rect.bottom > viewport - AVOID_ZONE_PX;
      const px = nearBottom
        ? Math.min(Math.ceil(viewport - rect.top), Math.floor(viewport * MAX_AVOID_FRACTION))
        : 0;
      setOffset(id, Math.max(0, px));
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame ? window.requestAnimationFrame(measure) : setTimeout(measure, 16);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(node);
    return () => {
      if (frame) {
        if (window.cancelAnimationFrame) window.cancelAnimationFrame(frame);
        else clearTimeout(frame);
      }
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      setOffset(id, null);
    };
  }, [setOffset, enabled, ref]);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  // id → px reported by useToastAvoid; the stack sits above the tallest.
  const [avoidOffsets, setAvoidOffsets] = useState({});
  const idRef = useRef(0);
  const reduceMotion = Boolean(useReducedMotion());

  const dismiss = useCallback((id) => {
    setToasts((prev) => (prev.some((item) => item.id === id) ? prev.filter((item) => item.id !== id) : prev));
  }, []);

  const push = useCallback((type, message, opts) => {
    const toast = buildToast(idRef.current + 1, type, message, opts);
    if (!toast) return null;
    idRef.current = toast.id;
    setToasts((prev) =>
      capToasts([
        // A retry that failed again replaces its old toast instead of
        // stacking a copy (see replacesToast).
        ...prev.filter((item) => !replacesToast(item, toast)),
        toast,
      ])
    );
    return toast.id;
  }, []);

  // Stable object: panels can list it in effect deps without re-running.
  const api = useMemo(
    () => ({
      success: (message, opts) => push("success", message, opts),
      error: (message, opts) => push("error", message, opts),
      info: (message, opts) => push("info", message, opts),
      dismiss,
    }),
    [push, dismiss]
  );

  const setAvoidOffset = useCallback((id, px) => {
    setAvoidOffsets((prev) => {
      if (px === null || px === undefined) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return prev[id] === px ? prev : { ...prev, [id]: px };
    });
  }, []);
  const bottomOffset = Math.max(0, ...Object.values(avoidOffsets));

  return (
    <ToastContext.Provider value={api}>
      <ToastAvoidContext.Provider value={setAvoidOffset}>{children}</ToastAvoidContext.Provider>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[300] flex flex-col gap-2 px-3 sm:left-auto sm:right-4 sm:w-[24rem] sm:px-0"
        style={{
          // Above a bottom Save bar when one is on screen (useToastAvoid);
          // that bar already clears the home indicator.
          paddingBottom:
            bottomOffset > 0
              ? `${bottomOffset + 8}px`
              : "max(0.75rem, env(safe-area-inset-bottom))",
        }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} reduceMotion={reduceMotion} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

const TONES = {
  success: { icon: "✓", badge: "bg-green-600 text-white", border: "border-green-200" },
  error: { icon: "!", badge: "bg-red-600 text-white", border: "border-red-300" },
  info: { icon: "i", badge: "bg-gray-800 text-white", border: "border-gray-200" },
};

function ToastItem({ toast, onDismiss, reduceMotion }) {
  // Hovering (mouse only — a tap on a phone would leave it "hovered") or
  // focusing a toast pauses its countdown.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remainingRef = useRef(toast.duration);
  const paused = hovered || focused;

  useEffect(() => {
    if (!(toast.duration > 0) || paused) return undefined;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), Math.max(0, remainingRef.current));
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(
        MIN_AFTER_PAUSE_MS,
        remainingRef.current - (Date.now() - startedAt)
      );
    };
  }, [paused, toast.duration, toast.id, onDismiss]);

  const tone = TONES[toast.type] || TONES.info;
  const isError = toast.type === "error";
  const hasAction = Boolean(toast.actionLabel && toast.onAction);

  const runAction = () => {
    onDismiss(toast.id);
    toast.onAction();
  };

  const motionProps = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      }
    : {
        layout: "position",
        initial: { opacity: 0, y: 16, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } },
        transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] },
      };

  return (
    <motion.div
      {...motionProps}
      role={isError ? "alert" : "status"}
      aria-atomic="true"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(false);
      }}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm text-gray-900 shadow-lg ${tone.border}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${tone.badge}`}
      >
        {tone.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium leading-snug">{toast.message}</p>
        {toast.hint ? (
          <p className="mt-1 break-words text-xs leading-relaxed text-gray-600">💡 {toast.hint}</p>
        ) : null}
        {hasAction || toast.href ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {hasAction ? (
              <button
                type="button"
                onClick={runAction}
                className="inline-flex items-center rounded-lg bg-black px-3 py-1 text-xs font-medium text-white hover:bg-gray-800"
              >
                {toast.actionLabel}
              </button>
            ) : null}
            {toast.href ? (
              <a
                href={toast.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-xs font-medium text-black underline underline-offset-2 hover:text-gray-700"
              >
                {toast.hrefLabel}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-mr-2 -mt-2 inline-flex min-h-[40px] min-w-[44px] shrink-0 items-center justify-center rounded-md px-2 text-xs text-gray-500 hover:bg-gray-100 hover:text-black sm:-mr-1 sm:-mt-0.5 sm:min-h-0 sm:min-w-0 sm:px-1.5 sm:py-0.5"
      >
        Đóng
      </button>
    </motion.div>
  );
}

export default ToastProvider;
