"use client";

import { useEffect, useRef, useState } from "react";
import {
  PREVIEW_DRAFT_TYPE,
  PREVIEW_PATH,
  PREVIEW_READY_TYPE,
  PREVIEW_SAVE_TYPE,
  previewFrameMessageType,
} from "@/app/admin/preview/previewShared";

// Debounce for drafts sent while typing; a change of entry is sent at once.
export const PREVIEW_DEBOUNCE_MS = 300;

// The docked column is narrower than Tailwind's `sm` (640px) at every window
// size, so on its own it always shows the site's phone layout. "Máy tính"
// renders the page at this width and scales it down to fit the column.
export const DESKTOP_PREVIEW_WIDTH = 1280;
const LAYOUT_STORAGE_KEY = "xuongart.admin.siteContentPreviewLayout";

function readLayoutPreference() {
  try {
    return window.localStorage.getItem(LAYOUT_STORAGE_KEY) === "desktop" ? "desktop" : "phone";
  } catch {
    return "phone";
  }
}

function writeLayoutPreference(layout) {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  } catch {
    // Blocked storage: the choice still holds for this visit.
  }
}

// Size and scale of the iframe for the desktop layout inside a box of
// `box` = { width, height } px. Pure, for tests.
export function desktopFrameGeometry(box, pageWidth = DESKTOP_PREVIEW_WIDTH) {
  const width = Number(box?.width) || 0;
  const height = Number(box?.height) || 0;
  if (width <= 0 || height <= 0) return null;
  const scale = Math.min(1, width / pageWidth);
  return { scale, width: width / scale, height: height / scale };
}

// Badge text for the preview header: the open entry has unsaved edits, or
// only other entries do (some previews also show those, e.g. the whole
// /whoweare page or the shared contact details).
export function previewDraftBadge(dirty, otherDirty) {
  if (dirty) return "Bản nháp — chưa lưu";
  if (otherDirty) return "Có thay đổi chưa lưu ở mục khác";
  return null;
}

// Decide how the next draft goes out: "now" when the preview has not seen
// this entry since it (re)loaded, otherwise "debounce". Pure, for tests.
export function draftSendMode(lastSent, entryId, readyCount) {
  if (!lastSent) return "now";
  return lastSent.entry !== entryId || lastSent.readyCount !== readyCount ? "now" : "debounce";
}

// The /admin/preview iframe plus its header. `variant`:
//   "dock"  — desktop right column, sticky under the Save bar
//   "sheet" — phones, bottom sheet over 60% of the screen
// `site` is the raw draft (the preview page normalizes it).
export default function SitePreviewFrame({
  site,
  entryId,
  entryLabel,
  href,
  // Unsaved edits in this entry / anywhere else in the draft.
  dirty = false,
  otherDirty = false,
  variant = "dock",
  onClose,
  // ⌘/Ctrl+S pressed while the preview has focus.
  onSaveShortcut,
}) {
  const frameRef = useRef(null);
  // Bumped on every "preview-ready" (first load, or a reload of the frame),
  // so the current draft is re-sent immediately.
  const [readyCount, setReadyCount] = useState(0);
  const lastSentRef = useRef(null);
  const onSaveRef = useRef(onSaveShortcut);
  useEffect(() => {
    onSaveRef.current = onSaveShortcut;
  });

  useEffect(() => {
    const origin = window.location.origin;
    const handler = (event) => {
      const type = previewFrameMessageType(event, {
        origin,
        frameWindow: frameRef.current?.contentWindow,
      });
      if (type === PREVIEW_READY_TYPE) setReadyCount((n) => n + 1);
      else if (type === PREVIEW_SAVE_TYPE) onSaveRef.current?.();
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (!readyCount || !site) return undefined;
    const send = () => {
      const target = frameRef.current?.contentWindow;
      if (!target) return;
      try {
        target.postMessage(
          { type: PREVIEW_DRAFT_TYPE, site, entry: entryId },
          window.location.origin
        );
        lastSentRef.current = { entry: entryId, readyCount };
      } catch {
        // A draft that cannot be cloned is skipped; the next edit retries.
      }
    };
    if (draftSendMode(lastSentRef.current, entryId, readyCount) === "now") {
      send();
      return undefined;
    }
    const timer = setTimeout(send, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [site, entryId, readyCount]);

  const sheet = variant === "sheet";

  // Phones show the phone layout anyway; the switch is for the docked column.
  const [layout, setLayoutState] = useState("phone");
  useEffect(() => {
    setLayoutState(readLayoutPreference());
  }, []);
  const setLayout = (next) => {
    setLayoutState(next);
    writeLayoutPreference(next);
  };
  const desktop = !sheet && layout === "desktop";
  const boxRef = useRef(null);
  const [box, setBox] = useState(null);
  useEffect(() => {
    const node = boxRef.current;
    if (!desktop || !node) return undefined;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setBox((prev) =>
        prev && prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height }
      );
    };
    measure();
    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [desktop]);
  const geometry = desktop ? desktopFrameGeometry(box) : null;

  // The sheet covers the bottom 60% of the screen: keep focused fields
  // (Tab / the keyboard's next arrow) above it, and close it on Escape.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!sheet || typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const previous = root.style.scrollPaddingBottom;
    root.style.scrollPaddingBottom = "60vh";
    const onKey = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented && typeof onCloseRef.current === "function") {
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.scrollPaddingBottom = previous;
    };
  }, [sheet]);

  const badge = previewDraftBadge(dirty, otherDirty);
  const layoutButton = (value, label) => (
    <button
      type="button"
      onClick={() => setLayout(value)}
      aria-pressed={layout === value}
      className={`px-2 py-0.5 text-[11px] font-medium transition ${
        layout === value ? "bg-black text-white" : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );

  const header = (
    <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Xem trước</span>
          {badge ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              {badge}
            </span>
          ) : null}
        </div>
        {entryLabel ? <p className="truncate text-xs text-gray-500">{entryLabel}</p> : null}
      </div>
      {sheet ? null : (
        <div
          role="group"
          aria-label="Giao diện xem trước"
          className="flex shrink-0 overflow-hidden rounded-md border border-gray-300"
          title="Trang thật đổi bố cục theo độ rộng màn hình"
        >
          {layoutButton("phone", "Điện thoại")}
          {layoutButton("desktop", "Máy tính")}
        </div>
      )}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs font-medium text-gray-700 hover:underline"
          title="Mở trang thật (bản đã lưu) trong tab mới"
        >
          Trang thật ↗
        </a>
      ) : null}
      {typeof onClose === "function" ? (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
          aria-label="Đóng xem trước"
        >
          {sheet ? "Đóng" : "✕"}
        </button>
      ) : null}
    </div>
  );

  const frame = (
    <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden bg-white">
      {/* allow-same-origin keeps the admin cookie; no top navigation,
          popups or forms from inside the preview. */}
      <iframe
        ref={frameRef}
        src={PREVIEW_PATH}
        title="Xem trước nội dung trang"
        sandbox="allow-scripts allow-same-origin"
        className={
          geometry
            ? "absolute left-0 top-0 origin-top-left border-0 bg-white"
            : "absolute inset-0 h-full w-full border-0 bg-white"
        }
        style={
          geometry
            ? {
                width: `${geometry.width}px`,
                height: `${geometry.height}px`,
                transform: `scale(${geometry.scale})`,
              }
            : undefined
        }
      />
      {readyCount ? null : (
        <p className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-center text-xs text-gray-500">
          Đang mở bản xem trước…
        </p>
      )}
    </div>
  );

  if (sheet) {
    return (
      <div
        role="dialog"
        aria-label="Xem trước"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[60vh] flex-col overflow-hidden rounded-t-2xl border-t border-gray-200 bg-white shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.35)]"
      >
        {header}
        {frame}
      </div>
    );
  }

  return (
    <aside className="sticky top-16 flex h-[calc(100vh-5rem)] flex-col self-start overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {header}
      {frame}
    </aside>
  );
}
