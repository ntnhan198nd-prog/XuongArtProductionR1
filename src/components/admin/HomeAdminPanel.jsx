"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FeaturedLayoutPanel from "@/components/admin/FeaturedLayoutPanel";
import ShowreelPanel from "@/components/admin/ShowreelPanel";
import { fetchJson } from "@/lib/apiClient";

// Admin "Trang chủ" tab: the homepage showreel on top, then the featured
// video grid (FeaturedLayoutPanel, with its strip of not-yet-featured
// videos). Every video is edited in the "Video" tab; this tab only decides
// what the homepage shows.
//
// Props (all optional), same contract as the other admin panels:
//   active        — this tab is the visible one. The video list is read on
//                   first show and re-read every time the tab is shown
//                   again (the "Video" tab may have changed it), unless the
//                   grid has an unsaved arrangement: then a banner offers
//                   the re-read instead.
//   onDirtyChange — true while the grid has an unsaved arrangement.
//   onBusyChange  — true while a showreel upload / delete runs.
export default function HomeAdminPanel({ active, onDirtyChange, onBusyChange } = {}) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [staleNotice, setStaleNotice] = useState(false);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [showreelBusy, setShowreelBusy] = useState(false);

  // Only the most recent read updates the list.
  const loadSeqRef = useRef(0);
  const load = useCallback(async () => {
    loadSeqRef.current += 1;
    const seq = loadSeqRef.current;
    setLoading(true);
    try {
      const payload = await fetchJson(
        "/api/admin/projects",
        { cache: "no-store" },
        { fallbackError: "Không tải được danh sách video" }
      );
      if (loadSeqRef.current !== seq) return;
      setItems(Array.isArray(payload?.data) ? payload.data : []);
      setError(null);
      setStaleNotice(false);
      setLoaded(true);
    } catch (loadError) {
      if (loadSeqRef.current !== seq) return;
      // A failed re-read keeps the list (and any arrangement) on screen.
      setError({
        message: loadError?.message || "Không tải được danh sách video.",
        hint: loadError?.hint || "",
        status: loadError?.status ?? null,
      });
      setLoaded(true);
    } finally {
      if (loadSeqRef.current === seq) setLoading(false);
    }
  }, []);

  // First show, then every time the tab is shown again. `active` undefined
  // (panel used on its own) counts as shown.
  const layoutDirtyRef = useRef(false);
  useEffect(() => {
    layoutDirtyRef.current = layoutDirty;
  }, [layoutDirty]);
  const wasActiveRef = useRef(null);
  useEffect(() => {
    const shown = active !== false;
    const wasShown = wasActiveRef.current;
    wasActiveRef.current = shown;
    if (!shown || wasShown === true) return;
    if (wasShown === false && layoutDirtyRef.current) {
      setStaleNotice(true);
      return;
    }
    load();
  }, [active, load]);

  // Report to the admin shell (false again on unmount).
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onBusyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
    onBusyChangeRef.current = onBusyChange;
  }, [onDirtyChange, onBusyChange]);
  useEffect(() => {
    if (typeof onDirtyChangeRef.current === "function") onDirtyChangeRef.current(layoutDirty);
  }, [layoutDirty]);
  useEffect(() => {
    if (typeof onBusyChangeRef.current === "function") onBusyChangeRef.current(showreelBusy);
  }, [showreelBusy]);
  useEffect(
    () => () => {
      if (typeof onDirtyChangeRef.current === "function") onDirtyChangeRef.current(false);
      if (typeof onBusyChangeRef.current === "function") onBusyChangeRef.current(false);
    },
    []
  );

  // A layout save was refused because the list is out of date.
  const showStaleNotice = useCallback(() => setStaleNotice(true), []);

  // "Tải lại danh sách" (banner and error box): asks first while the grid
  // has an unsaved arrangement, which a re-read may replace.
  const reloadFromBanner = () => {
    if (
      layoutDirty &&
      !window.confirm("Bố cục trang chủ chưa lưu có thể bị thay bằng dữ liệu mới. Vẫn tải lại?")
    ) {
      return;
    }
    setStaleNotice(false);
    load();
  };

  return (
    <div className="space-y-8 pt-6">
      <ShowreelPanel onBusyChange={setShowreelBusy} />

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <p className="break-words">{error.message}</p>
          {error.hint ? (
            <p className="mt-1.5 text-xs leading-relaxed text-red-800">💡 {error.hint}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reloadFromBanner}
              disabled={loading}
              className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {loading ? "Đang tải lại…" : "Tải lại danh sách"}
            </button>
            {error.status === 401 ? (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-xs text-red-700 underline hover:text-red-900"
              >
                Tải lại trang để đăng nhập
              </button>
            ) : (
              <a
                href="/admin?tab=system"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-red-700 underline hover:text-red-900"
              >
                Kiểm tra kết nối R2 ↗
              </a>
            )}
          </div>
        </div>
      ) : null}

      {staleNotice && !error ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
        >
          <p className="min-w-0 flex-1">
            Danh sách video có thể đã đổi ở thẻ khác — tải lại trước khi lưu bố cục.
          </p>
          <button
            type="button"
            onClick={reloadFromBanner}
            disabled={loading}
            className="min-h-[36px] rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Tải lại danh sách
          </button>
        </div>
      ) : null}

      {/* Stays mounted during a re-read once a list is in, so an unsaved
          arrangement survives (the grid only re-syncs when the saved
          layout changed). */}
      {!loaded ? (
        <p role="status" className="text-sm text-gray-500">
          Đang tải lưới video…
        </p>
      ) : error && items.length === 0 ? null : (
        <FeaturedLayoutPanel
          items={items}
          onSaved={load}
          onDirtyChange={setLayoutDirty}
          onListOutdated={showStaleNotice}
        />
      )}
    </div>
  );
}
