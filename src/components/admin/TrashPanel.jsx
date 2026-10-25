"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/apiClient";
import { formatVnShort } from "@/lib/contentHistory";
import { formatBytes } from "@/lib/uploadClient";
import { useToast } from "@/components/admin/ToastProvider";

// Admin "Thùng rác" tab. Deleted videos / image projects and replaced files
// (old video, photos, logos…) wait here for 30 days before they are deleted
// from R2 for good (see the Trash section of lib/contentStore.js).
//   - "Khôi phục" puts a deleted record back where it was.
//   - "Xoá vĩnh viễn" deletes one entry now (in-row confirm, armed after a
//     short delay so a double click cannot confirm by accident).
// Replaced files cannot be restored on their own: their content comes back
// through the "Lịch sử" tab, which still finds the files while they are here.
// Self-contained: reads /api/admin/trash itself and re-reads it every time
// the tab is shown (`active` turns true), since deletes happen in other tabs.

const CONFIRM_ARM_MS = 1500;

// Fired (on window) by the other admin panels after they put something into
// or take something out of the trash, so an open "Thùng rác" tab re-reads.
export const TRASH_CHANGED_EVENT = "admin:trash-changed";

export function notifyTrashChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(TRASH_CHANGED_EVENT));
  } catch {
    // Very old browsers without the Event constructor: the tab still
    // re-reads when it is shown again.
  }
}

// Name of an entry inside a sentence: record titles get quotes, file
// labels already carry their own (e.g. Video cũ của “Alpha”).
function quotedName(entry) {
  return entry?.type === "asset" ? entry.label : `“${entry?.label}”`;
}

// 400 (file entries), 404 (already restored / gone) and 409 (its files are
// gone from R2) give the same answer every time: no "Thử lại".
function isFinalRestoreError(error) {
  return error?.status === 400 || error?.status === 404 || error?.status === 409;
}

const SOURCE_LABELS = {
  showreel: "Showreel",
  "site-image": "Ảnh trên trang",
  "project-media": "File của video",
  "image-project-media": "Ảnh của dự án ảnh",
  "history-restore": "File trước lần khôi phục Lịch sử",
};

function typeLabel(entry) {
  if (entry.type === "project") return entry.featured ? "Video nổi bật" : "Video";
  if (entry.type === "imageProject") return "Dự án ảnh";
  return SOURCE_LABELS[entry.source] || "File";
}

function daysLeftText(daysLeft) {
  const days = Number(daysLeft);
  if (!Number.isFinite(days) || days <= 0) return "Sắp xoá hẳn";
  return `Còn ${days} ngày`;
}

// "3 file · 120 MB" for a record, "45 MB" for a file ("" when unknown).
function sizeText(entry) {
  const size = Number(entry.size) > 0 ? formatBytes(entry.size) : "";
  if (entry.type === "asset") return size;
  const count = Number(entry.fileCount) || 0;
  const files = count > 0 ? `${count} file` : "Không có file";
  return size ? `${files} · ${size}` : files;
}

// Public page of a restored record, for the success toast.
function publicLinkFor(type, record) {
  if (type === "imageProject") return { href: "/images", label: "Xem trang Ảnh ↗" };
  if (record?.featured) return { href: "/", label: "Xem trang chủ ↗" };
  const slug = String(record?.slug || "").trim();
  return slug ? { href: `/videos/${encodeURIComponent(slug)}`, label: "Xem trên trang ↗" } : null;
}

function ErrorBox({ message, hint, children }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p className="break-words">{message}</p>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-red-800">💡 {hint}</p> : null}
      {children}
    </div>
  );
}

function TrashThumb({ entry }) {
  const box = "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100";
  if (entry.previewUrl && entry.previewKind === "image") {
    return (
      <div className={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={entry.previewUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  if (entry.previewUrl && entry.previewKind === "video") {
    return (
      <div className={box}>
        <video
          src={`${entry.previewUrl}#t=0.5`}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="pointer-events-none h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className={`${box} flex items-center justify-center text-center text-[10px] text-gray-400`}>
      {entry.type === "asset" ? "File" : "Chưa có ảnh"}
    </div>
  );
}

export default function TrashPanel({ active = true } = {}) {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [entries, setEntries] = useState([]);
  const [keepDays, setKeepDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  // In-row "Xoá vĩnh viễn" confirmation; its confirm button stays disabled
  // until `confirmArmed` (CONFIRM_ARM_MS after it opened).
  const [confirmId, setConfirmId] = useState(null);
  const [confirmArmed, setConfirmArmed] = useState(false);
  // Entry being restored / purged: { id, action: "restore" | "purge" }.
  const [working, setWorking] = useState(null);
  const requestIdRef = useRef(0);
  const armTimerRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const refreshButtonRef = useRef(null);
  const purgeButtonRefs = useRef(new Map());
  const restoreButtonRefs = useRef(new Map());
  const workingRef = useRef(false);

  useEffect(
    () => () => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    },
    []
  );

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setLoadError(null);
    try {
      const payload = await fetchJson(
        "/api/admin/trash",
        { cache: "no-store" },
        { fallbackError: "Không tải được Thùng rác" }
      );
      if (requestIdRef.current !== requestId) return;
      setEntries(Array.isArray(payload?.data) ? payload.data : []);
      if (Number(payload?.keepDays) > 0) setKeepDays(Number(payload.keepDays));
      setLoaded(true);
      setNow(Date.now());
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setLoadError({ message: error.message, hint: error.hint || "" });
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  // Re-read every time the tab is shown: deletes / replacements happen in
  // the other tabs while this panel stays mounted in the background.
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  // …and when another panel changed the trash while this tab is shown
  // (e.g. "Hoàn tác" on a delete toast).
  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    const onChanged = () => load();
    window.addEventListener(TRASH_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(TRASH_CHANGED_EVENT, onChanged);
  }, [active, load]);

  const closeConfirm = (id) => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = null;
    setConfirmId(null);
    setConfirmArmed(false);
    const button = id ? purgeButtonRefs.current.get(id) : null;
    if (button) setTimeout(() => button.focus?.(), 0);
  };

  const openConfirm = (id) => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    setConfirmId(id);
    setConfirmArmed(false);
    armTimerRef.current = setTimeout(() => {
      armTimerRef.current = null;
      setConfirmArmed(true);
    }, CONFIRM_ARM_MS);
  };

  // Focus "Huỷ" when a confirmation opens.
  useEffect(() => {
    if (confirmId !== null) cancelButtonRef.current?.focus?.();
  }, [confirmId]);

  const removeLocally = (id) => setEntries((prev) => prev.filter((item) => item.id !== id));

  // Keyboard focus after a row disappears: the neighbouring row (next, else
  // previous, in the order shown) or "Làm mới" when the list is now empty —
  // never <body>, so the owner keeps their place in the list.
  const focusAfterRemoving = (id) => {
    const shown = [
      ...entries.filter((item) => item.restorable),
      ...entries.filter((item) => !item.restorable),
    ];
    const index = shown.findIndex((item) => item.id === id);
    const neighbour = index === -1 ? null : shown[index + 1] || shown[index - 1] || null;
    setTimeout(() => {
      const target = neighbour
        ? restoreButtonRefs.current.get(neighbour.id) || purgeButtonRefs.current.get(neighbour.id)
        : null;
      (target || refreshButtonRef.current)?.focus?.();
    }, 0);
  };

  const restoreEntry = async (entry) => {
    if (workingRef.current || !entry?.restorable) return;
    workingRef.current = true;
    setWorking({ id: entry.id, action: "restore" });
    try {
      const payload = await fetchJson(
        "/api/admin/trash/restore",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id }),
        },
        { fallbackError: "Khôi phục thất bại" }
      );
      focusAfterRemoving(entry.id);
      removeLocally(entry.id);
      if (confirmId === entry.id) closeConfirm(null);
      const record = payload?.data || null;
      const title = record?.title || entry.title || entry.label;
      const link = publicLinkFor(entry.type, record);
      const isVideo = entry.type === "project";
      toastRef.current?.success?.(`Đã khôi phục “${title}”`, {
        hint: payload?.slugChanged
          ? `Đường dẫn cũ đã có mục khác dùng nên đổi thành “${record?.slug}”.`
          : `Mục đã về lại tab ${isVideo ? (record?.featured ? "Trang chủ: Showreel & Nổi bật" : "Thư viện video") : "Dự án ảnh"}.`,
        ...(link ? { href: link.href, hrefLabel: link.label } : {}),
        duration: 6000,
      });
      load();
    } catch (error) {
      toastRef.current?.error?.(error?.message || "Khôi phục thất bại.", {
        hint: error?.hint || "",
        ...(isFinalRestoreError(error)
          ? {}
          : { actionLabel: "Thử lại", onAction: () => restoreLatestRef.current?.(entry) }),
      });
      // Already restored / deleted in another tab: show the list as it is.
      if (error?.status === 404) load();
    } finally {
      workingRef.current = false;
      setWorking(null);
    }
  };

  const purgeEntry = async (entry) => {
    if (workingRef.current || !confirmArmed) return;
    workingRef.current = true;
    setWorking({ id: entry.id, action: "purge" });
    try {
      await fetchJson(
        "/api/admin/trash/purge",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id }),
        },
        { fallbackError: "Xoá vĩnh viễn thất bại" }
      );
      focusAfterRemoving(entry.id);
      removeLocally(entry.id);
      closeConfirm(null);
      toastRef.current?.success?.(`Đã xoá vĩnh viễn ${quotedName(entry)}`);
      load();
    } catch (error) {
      toastRef.current?.error?.(error?.message || "Xoá vĩnh viễn thất bại.", {
        hint: error?.hint || "",
      });
      if (error?.status === 404) {
        closeConfirm(null);
        load();
      }
    } finally {
      workingRef.current = false;
      setWorking(null);
    }
  };

  // Latest restoreEntry for the error toast's "Thử lại".
  const restoreLatestRef = useRef(null);
  useEffect(() => {
    restoreLatestRef.current = restoreEntry;
  });

  const records = entries.filter((entry) => entry.restorable);
  const files = entries.filter((entry) => !entry.restorable);

  const renderRow = (entry) => {
    const confirming = confirmId === entry.id;
    const busyHere = working?.id === entry.id;
    const locked = working !== null;
    const meta = [
      typeLabel(entry),
      entry.type !== "asset" && entry.client ? entry.client : "",
      sizeText(entry),
    ].filter(Boolean);
    const deletedWhen = formatVnShort(entry.deletedAt, now);
    const textId = `trash-confirm-${entry.id}`;
    return (
      <li key={entry.id} className="rounded-xl border border-gray-200 p-3 text-sm text-gray-800">
        <div className="flex gap-3">
          <TrashThumb entry={entry} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-semibold">
                  {entry.label}
                  {entry.recordId ? (
                    <span className="ml-1 font-normal text-gray-500">#{entry.recordId}</span>
                  ) : null}
                </p>
                <p className="mt-0.5 break-words text-xs text-gray-600">{meta.join(" · ")}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${
                      Number(entry.daysLeft) <= 3
                        ? "bg-amber-100 text-amber-800"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {daysLeftText(entry.daysLeft)}
                  </span>
                  {deletedWhen ? (
                    <span className="text-gray-500">
                      {entry.type === "asset" ? "Thay/xoá lúc" : "Xoá lúc"} {deletedWhen}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {entry.restorable ? (
                  <button
                    type="button"
                    ref={(node) => {
                      if (node) restoreButtonRefs.current.set(entry.id, node);
                      else restoreButtonRefs.current.delete(entry.id);
                    }}
                    disabled={locked || confirming}
                    onClick={() => restoreEntry(entry)}
                    className="min-h-[36px] rounded-md bg-black px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyHere && working?.action === "restore" ? "Đang khôi phục…" : "Khôi phục"}
                  </button>
                ) : null}
                <button
                  type="button"
                  ref={(node) => {
                    if (node) purgeButtonRefs.current.set(entry.id, node);
                    else purgeButtonRefs.current.delete(entry.id);
                  }}
                  disabled={locked || confirming}
                  onClick={() => openConfirm(entry.id)}
                  className="min-h-[36px] rounded-md border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Xoá vĩnh viễn
                </button>
              </div>
            </div>
          </div>
        </div>
        {confirming ? (
          <div
            className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            role="alertdialog"
            aria-label="Xác nhận xoá vĩnh viễn"
            aria-describedby={textId}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || busyHere) return;
              event.preventDefault();
              event.stopPropagation();
              closeConfirm(entry.id);
            }}
          >
            <p id={textId} className="break-words">
              Xoá vĩnh viễn {quotedName(entry)}? Không hoàn tác được —{" "}
              {entry.type === "asset"
                ? "file sẽ bị xoá khỏi R2, bản nào trong Lịch sử còn dùng file này sẽ thiếu file khi khôi phục."
                : "video/ảnh của mục này sẽ bị xoá khỏi R2 (trừ file còn được mục khác dùng)."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                ref={cancelButtonRef}
                disabled={busyHere}
                onClick={() => closeConfirm(entry.id)}
                className="min-h-[36px] rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={!confirmArmed || locked}
                onClick={() => purgeEntry(entry)}
                className="min-h-[36px] rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyHere && working?.action === "purge"
                  ? "Đang xoá…"
                  : confirmArmed
                  ? "Xoá vĩnh viễn"
                  : "Xoá vĩnh viễn (đợi chút…)"}
              </button>
            </div>
          </div>
        ) : null}
      </li>
    );
  };

  const section = (title, hint, list) =>
    list.length > 0 ? (
      <section className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {title} <span className="font-normal text-gray-500">({list.length})</span>
          </h3>
          {hint ? <p className="mt-0.5 text-xs text-gray-500">{hint}</p> : null}
        </div>
        <ul className="space-y-3">{list.map(renderRow)}</ul>
      </section>
    ) : null;

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Thùng rác</h2>
          <p className="mt-1 text-sm text-gray-600">
            Mục đã xoá được giữ {keepDays} ngày rồi tự xoá hẳn. File đã thay thế (video, ảnh,
            logo cũ) cũng được giữ để bạn khôi phục nội dung cũ từ tab Lịch sử.
          </p>
        </div>
        <button
          type="button"
          ref={refreshButtonRef}
          onClick={load}
          disabled={loading || working !== null}
          className="shrink-0 self-start rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>

      {loadError ? (
        <ErrorBox message={loadError.message} hint={loadError.hint}>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="mt-2 rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Thử lại
          </button>
        </ErrorBox>
      ) : null}

      {!loaded && loading ? <p className="text-sm text-gray-500">Đang tải Thùng rác...</p> : null}

      {loaded && entries.length === 0 && !loadError ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Thùng rác trống.
        </div>
      ) : null}

      {section(
        "Video & dự án ảnh đã xoá",
        "Bấm Khôi phục để đưa mục về lại chỗ cũ trong danh sách.",
        records
      )}
      {section(
        "File đã thay thế",
        "Video, ảnh, logo cũ sau khi bạn thay hoặc gỡ. Muốn dùng lại: vào tab Lịch sử và khôi phục bản trước khi thay.",
        files
      )}
    </div>
  );
}
