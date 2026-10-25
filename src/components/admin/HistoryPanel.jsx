"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, describeHttpError, fetchJson, readJsonSafe } from "@/lib/apiClient";
import { useToast } from "@/components/admin/ToastProvider";
import {
  HISTORY_KEEP_DAYS,
  HISTORY_KEEP_RECENT,
  describeHistoryEntry,
  formatRelativeVi,
  formatVnDateTime,
  formatVnShort,
} from "@/lib/contentHistory";

// Admin "Lịch sử" tab: every save keeps a copy of the content as it was
// right before that save (see lib/contentStore.js updateStore). Restoring
// one puts the whole site content back to that moment; the current content
// is snapshotted first, so a restore can itself be undone from here.

const PAGE_SIZE = 30;
const RELOAD_DELAY_MS = 1200;
// If the page is still alive this long after asking for a reload, another
// tab's "leave site?" prompt was answered with Stay (see admin/page.jsx).
const RELOAD_FALLBACK_MS = 3000;

// filename="xuongart-….json" from a Content-Disposition header.
function filenameFromDisposition(header) {
  const match = /filename="?([^";]+)"?/i.exec(String(header || ""));
  return match ? match[1].trim() : "";
}

// Media check result → one plain sentence (null when there is nothing to say).
function mediaStatusText(detail) {
  if (!detail?.data) return null;
  const { missingMedia = 0, checked = 0, totalMedia = 0, failedChecks = 0 } = detail;
  if (missingMedia > 0) return null; // shown as a warning instead
  if (totalMedia === 0) return "Bản này không dùng file video, ảnh nào trên R2.";
  if (checked === totalMedia && failedChecks === 0) {
    return "Các file video, ảnh của bản này vẫn còn đủ.";
  }
  if (checked > 0) {
    return `Chưa thấy file nào bị mất trong ${checked}/${totalMedia} file đã kiểm tra.`;
  }
  return null;
}

function formatBytes(size) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summaryParts(summary) {
  if (!summary) return [];
  return [
    `${summary.projects} video (${summary.featured} nổi bật, ${summary.otherVideos} video khác)`,
    `${summary.imageProjects} dự án ảnh`,
    summary.showreel ? `Showreel: ${summary.showreel}` : "Chưa có showreel",
    summary.siteCustomized ? "Nội dung trang: đã chỉnh sửa" : "Nội dung trang: mặc định",
  ];
}

function SummaryLine({ summary }) {
  const parts = summaryParts(summary);
  if (parts.length === 0) return null;
  return <p className="break-words text-sm text-gray-700">{parts.join(" · ")}</p>;
}

// “A”, “B” và “C” — admin tab names for the restore warning.
function joinTabNames(labels) {
  const quoted = labels.map((label) => `“${label}”`);
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} và ${quoted[quoted.length - 1]}`;
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

// pendingTabLabels (optional): names of the other admin tabs with uploads
// or unsaved changes, so the restore warning can say where that work is.
export default function HistoryPanel({
  active = true,
  contentDirty = false,
  otherWorkPending = false,
  pendingTabLabels = [],
  onRestored,
}) {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [current, setCurrent] = useState(null);
  const [currentError, setCurrentError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // key → { open, loading, error, hint, data, missingMedia, checked, totalMedia, failedChecks }
  const [details, setDetails] = useState({});
  const [confirmKey, setConfirmKey] = useState(null);
  const [restoringKey, setRestoringKey] = useState(null);
  const [restoreError, setRestoreError] = useState(null);
  const [restoredKey, setRestoredKey] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  // Restore saved but the reload was cancelled (another tab's leave prompt).
  const [reloadStalled, setReloadStalled] = useState(false);
  // key → { loading } for "Tải về (.json)" (errors are shown as a toast).
  const [downloads, setDownloads] = useState({});
  // Corrupt store with no history: explicit "start over empty" flow.
  const [startEmptyConfirm, setStartEmptyConfirm] = useState(false);
  const [startEmptyBusy, setStartEmptyBusy] = useState(false);
  const [startEmptyError, setStartEmptyError] = useState(null);
  const [startEmptyDone, setStartEmptyDone] = useState(false);
  const requestIdRef = useRef(0);
  // Per-key token so a slow, older snapshot check never overwrites a newer one.
  const detailRequestRef = useRef({});
  const timersRef = useRef([]);
  const cancelButtonRef = useRef(null);
  // The download error toast's "Thử lại" runs the current downloadSnapshot.
  const downloadLatestRef = useRef(null);

  const busy = Boolean(restoringKey || restoredKey || startEmptyBusy || startEmptyDone);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    },
    []
  );

  const later = (fn, ms) => {
    timersRef.current.push(setTimeout(fn, ms));
  };

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setLoadError(null);
    try {
      const payload = await fetchJson(
        "/api/admin/history",
        { cache: "no-store" },
        { fallbackError: "Không tải được lịch sử" }
      );
      if (requestIdRef.current !== requestId) return;
      setEntries(Array.isArray(payload?.data) ? payload.data : []);
      setCurrent(payload?.current || null);
      setCurrentError(payload?.currentError || null);
      // Media may have been deleted since the last check (e.g. a video was
      // replaced in another tab): drop cached checks so they are redone.
      detailRequestRef.current = {};
      setDetails({});
      setLoaded(true);
      setNow(Date.now());
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setLoadError({ message: error.message, hint: error.hint || "" });
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  // Refresh every time the tab is opened: saves made in other tabs add
  // new entries while this panel stays mounted in the background.
  useEffect(() => {
    if (active && !busy) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, load]);

  // Keep "5 phút trước" labels fresh while the tab is visible.
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, [active]);

  // Always a fresh check (media can disappear at any time). `open`
  // undefined keeps the details box as it is (used by the restore confirm).
  const fetchDetails = async (entry, { open } = {}) => {
    const token = (detailRequestRef.current[entry.key] || 0) + 1;
    detailRequestRef.current[entry.key] = token;
    const isLatest = () => detailRequestRef.current[entry.key] === token;
    setDetails((prev) => ({
      ...prev,
      [entry.key]: { open: open ?? Boolean(prev[entry.key]?.open), loading: true },
    }));
    try {
      const payload = await fetchJson(
        `/api/admin/history/snapshot?key=${encodeURIComponent(entry.key)}`,
        { cache: "no-store" },
        { fallbackError: "Không xem được bản lưu" }
      );
      if (!isLatest()) return;
      setDetails((prev) => ({
        ...prev,
        [entry.key]: {
          open: Boolean(prev[entry.key]?.open),
          loading: false,
          data: payload?.data || null,
          missingMedia: Number(payload?.missingMedia) || 0,
          checked: Number(payload?.checked) || 0,
          totalMedia: Number(payload?.totalMedia) || 0,
          failedChecks: Number(payload?.failedChecks) || 0,
        },
      }));
    } catch (error) {
      if (!isLatest()) return;
      setDetails((prev) => ({
        ...prev,
        [entry.key]: {
          open: Boolean(prev[entry.key]?.open),
          loading: false,
          error: error.message,
          hint: error.hint || "",
        },
      }));
    }
  };

  const toggleDetails = (entry) => {
    if (details[entry.key]?.open) {
      setDetails((prev) => ({ ...prev, [entry.key]: { ...prev[entry.key], open: false } }));
      return;
    }
    fetchDetails(entry, { open: true });
  };

  // The confirm row needs the missing-media check too, even when the admin
  // never opened "Xem chi tiết".
  const askRestore = (entry) => {
    if (busy || confirmKey === entry.key) return;
    setRestoreError(null);
    setConfirmKey(entry.key);
    fetchDetails(entry);
  };

  // Keyboard users land on the confirm row's Huỷ button.
  useEffect(() => {
    if (confirmKey) cancelButtonRef.current?.focus();
  }, [confirmKey]);

  // Full reload so every admin tab refetches the restored content. If the
  // page is still here afterwards, say so instead of spinning forever.
  const reloadPage = () => {
    setReloadStalled(false);
    if (typeof onRestored === "function") onRestored();
    else window.location.reload();
    later(() => {
      setRestoredKey(null);
      setStartEmptyDone(false);
      setReloadStalled(true);
    }, RELOAD_FALLBACK_MS);
  };

  // Fetch (not a plain link) so an expired session or a pruned snapshot
  // shows an error here instead of saving the error text as a .json file.
  const downloadSnapshot = async (entry) => {
    if (downloads[entry.key]?.loading) return;
    setDownloads((prev) => ({ ...prev, [entry.key]: { loading: true } }));
    const fallbackError = "Không tải về được bản lưu";
    try {
      let response;
      try {
        response = await fetch(
          `/api/admin/history/download?key=${encodeURIComponent(entry.key)}`,
          { cache: "no-store" }
        );
      } catch (networkError) {
        throw new ApiError(
          `${fallbackError}: không kết nối được tới server (${
            networkError?.message || "lỗi mạng"
          }).`,
          { status: 0 }
        );
      }
      if (!response.ok) {
        const payload = await readJsonSafe(response);
        throw new ApiError(describeHttpError(response, payload, fallbackError), {
          status: response.status,
          payload,
        });
      }
      const blob = await response.blob();
      const name =
        filenameFromDisposition(response.headers.get("content-disposition")) ||
        "xuongart-backup.json";
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      later(() => URL.revokeObjectURL(href), 60 * 1000);
      setDownloads((prev) => ({ ...prev, [entry.key]: { loading: false } }));
    } catch (error) {
      setDownloads((prev) => ({ ...prev, [entry.key]: { loading: false } }));
      toast.error(error.message || fallbackError, {
        hint: error.hint || "",
        actionLabel: "Thử lại",
        onAction: () => downloadLatestRef.current?.(entry),
      });
    }
  };
  useEffect(() => {
    downloadLatestRef.current = downloadSnapshot;
  });

  const handleStartEmpty = async () => {
    if (busy) return;
    setStartEmptyBusy(true);
    setStartEmptyError(null);
    try {
      await fetchJson(
        "/api/admin/history/start-empty",
        { method: "POST" },
        { fallbackError: "Không bắt đầu lại được" }
      );
      setStartEmptyDone(true);
      setStartEmptyBusy(false);
      toast.success("Đã bắt đầu lại với nội dung trống — đang tải lại trang…");
      later(reloadPage, RELOAD_DELAY_MS);
    } catch (error) {
      setStartEmptyBusy(false);
      setStartEmptyError({ message: error.message, hint: error.hint || "" });
      toast.error(error.message, { hint: error.hint || "" });
    }
  };

  const handleRestore = async (entry) => {
    if (busy) return;
    setRestoringKey(entry.key);
    setRestoreError(null);
    try {
      await fetchJson(
        "/api/admin/history/restore",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: entry.key }),
        },
        { fallbackError: "Khôi phục thất bại" }
      );
      setRestoredKey(entry.key);
      setRestoringKey(null);
      setConfirmKey(null);
      toast.success("Đã khôi phục xong — đang tải lại trang…");
      later(reloadPage, RELOAD_DELAY_MS);
    } catch (error) {
      setRestoringKey(null);
      // Kept inline too: the confirm box stays open, so the owner can retry
      // right there.
      setRestoreError({ key: entry.key, message: error.message, hint: error.hint || "" });
      toast.error(error.message, { hint: error.hint || "" });
    }
  };

  const visibleEntries = entries.slice(0, visibleCount);
  const hiddenCount = Math.max(0, entries.length - visibleEntries.length);
  const corruptCopyName = currentError?.corruptCopyKey || "_admin/content.corrupt-….json";
  const corruptKeptText = currentError?.corruptPreserved
    ? `Bản hỏng vẫn được giữ lại trên R2 (${corruptCopyName}), không bị xoá.`
    : "Chưa giữ được bản sao của bản hỏng — hãy báo người kỹ thuật trước khi làm gì thêm.";
  const noHistoryToRestore = Boolean(currentError) && loaded && entries.length === 0;

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Lịch sử thay đổi</h2>
          <p className="mt-1 text-sm text-gray-600">
            Mỗi lần bạn lưu, bản trước đó được giữ lại ở đây. Nếu lỡ tay sửa
            sai hay xoá nhầm, bấm <strong>Khôi phục</strong> để đưa toàn bộ
            nội dung về lúc đó.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Giữ {HISTORY_KEEP_RECENT} lần lưu gần nhất và 1 bản mỗi ngày trong{" "}
            {HISTORY_KEEP_DAYS} ngày.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || busy}
          className="shrink-0 self-start rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>

      {reloadStalled ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p>
            Đã lưu xong, nhưng trang chưa tải lại. Bấm <strong>Tải lại trang</strong> (hoặc F5)
            để xem nội dung mới. Các thẻ khác trong trang quản trị (và tab trình duyệt khác
            đang mở trang này) đang hiện nội dung cũ — đừng lưu ở đó trước khi tải lại.
          </p>
          <button
            type="button"
            onClick={reloadPage}
            className="mt-2 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
          >
            Tải lại trang
          </button>
        </div>
      ) : null}

      {/* Current content */}
      {noHistoryToRestore ? (
        <ErrorBox
          message="File nội dung hiện tại bị hỏng nên website đang tạm hiện nội dung mặc định."
          hint={`Chưa có bản lưu nào để khôi phục. Hãy báo người kỹ thuật. ${corruptKeptText}`}
        >
          {startEmptyConfirm ? (
            <div
              role="alertdialog"
              aria-label="Bắt đầu lại với nội dung trống"
              className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-3 text-sm text-red-800"
            >
              <p>
                Bắt đầu lại với nội dung trống? Video, dự án ảnh, showreel và nội dung trang sẽ
                trống để bạn nhập lại. Bản hỏng vẫn được giữ trên R2 để người kỹ thuật lấy lại
                nếu cần; file video, ảnh trên R2 không bị xoá.
              </p>
              {startEmptyError ? (
                <div className="mt-2 text-xs text-red-700">
                  <p className="break-words">{startEmptyError.message}</p>
                  {startEmptyError.hint ? (
                    <p className="mt-1 text-red-800">💡 {startEmptyError.hint}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStartEmptyConfirm(false);
                    setStartEmptyError(null);
                  }}
                  disabled={busy}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  onClick={handleStartEmpty}
                  disabled={busy}
                  className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
                >
                  {startEmptyBusy ? "Đang làm..." : "Bắt đầu lại"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setStartEmptyConfirm(true)}
              disabled={busy}
              className="mt-2 rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Bắt đầu lại với nội dung trống
            </button>
          )}
        </ErrorBox>
      ) : currentError ? (
        <ErrorBox
          message="File nội dung hiện tại bị hỏng nên website đang tạm hiện nội dung mặc định."
          hint={`Chọn bản gần nhất bên dưới và bấm Khôi phục. ${corruptKeptText}`}
        />
      ) : current ? (
        <div className="rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold">Nội dung hiện tại</h3>
          <p className="mt-1 text-xs text-gray-600">
            Lưu lần cuối:{" "}
            {current.updatedAt ? (
              <>
                <span className="font-medium text-gray-800">
                  {formatRelativeVi(current.updatedAt, now)}
                </span>{" "}
                ({formatVnDateTime(current.updatedAt)})
              </>
            ) : (
              "chưa rõ"
            )}
          </p>
          <div className="mt-2">
            <SummaryLine summary={current} />
          </div>
        </div>
      ) : null}

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

      {!loaded && loading ? (
        <p className="text-sm text-gray-500">Đang tải lịch sử...</p>
      ) : null}

      {loaded && entries.length === 0 && !loadError && !currentError ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Chưa có lịch sử — mỗi lần bạn lưu, bản trước đó sẽ được giữ ở đây.
        </div>
      ) : null}

      {visibleEntries.length > 0 ? (
        <ul className="space-y-3">
          {visibleEntries.map((entry, index) => {
            const detail = details[entry.key];
            const confirming = confirmKey === entry.key;
            const restoring = restoringKey === entry.key;
            const shortTime = formatVnShort(entry.createdAt, now);
            const size = formatBytes(entry.size);
            const download = downloads[entry.key];
            const mediaText = mediaStatusText(detail);
            const confirmTitleId = `history-confirm-${index}`;
            return (
              <li key={entry.key} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-gray-900">
                      {describeHistoryEntry(entry, now)}
                      {index === 0 ? (
                        <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 align-middle text-[11px] font-normal text-gray-600">
                          Gần nhất
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {formatVnDateTime(entry.createdAt)} · {formatRelativeVi(entry.createdAt, now)}
                      {size ? ` · ${size}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleDetails(entry)}
                      disabled={busy}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                    >
                      {detail?.open ? "Ẩn chi tiết" : "Xem chi tiết"}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadSnapshot(entry)}
                      disabled={download?.loading}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                    >
                      {download?.loading ? "Đang tải về..." : "Tải về (.json)"}
                    </button>
                    {/* Not disabled while its confirm row is open: disabling
                        the focused button would drop keyboard focus. */}
                    <button
                      type="button"
                      onClick={() => askRestore(entry)}
                      disabled={busy}
                      aria-expanded={confirming}
                      className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      Khôi phục
                    </button>
                  </div>
                </div>

                {detail?.open ? (
                  <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2.5">
                    {detail.loading ? (
                      <p className="text-xs text-gray-500">Đang xem bản lưu...</p>
                    ) : detail.error ? (
                      <div className="text-xs text-red-700">
                        <p className="break-words">{detail.error}</p>
                        {detail.hint ? (
                          <p className="mt-1 text-red-800">💡 {detail.hint}</p>
                        ) : null}
                      </div>
                    ) : detail.data ? (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-gray-600">Bản này có:</p>
                        <SummaryLine summary={detail.data} />
                        {detail.missingMedia > 0 ? (
                          <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                            {detail.missingMedia} file media đã bị xoá khỏi R2 — khôi phục
                            sẽ không lấy lại được các file này.
                          </p>
                        ) : mediaText ? (
                          <p className="text-xs text-gray-500">{mediaText}</p>
                        ) : null}
                        {detail.missingMedia > 0 && detail.totalMedia > detail.checked ? (
                          <p className="text-xs text-gray-500">
                            Đã kiểm tra {detail.checked}/{detail.totalMedia} file — có thể còn
                            file khác bị mất.
                          </p>
                        ) : null}
                        {detail.failedChecks > 0 ? (
                          <p className="text-xs text-gray-500">
                            Không kiểm tra được {detail.failedChecks} file (lỗi kết nối).
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {confirming ? (
                  <div
                    role="alertdialog"
                    aria-labelledby={confirmTitleId}
                    className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900"
                  >
                    <p id={confirmTitleId}>
                      {currentError
                        ? `Khôi phục toàn bộ nội dung về lúc ${shortTime}? Nội dung hiện tại đang bị hỏng nên không lưu vào lịch sử được (không hoàn tác về nó được); bản hỏng đã được giữ riêng trên R2.`
                        : `Khôi phục toàn bộ nội dung về lúc ${shortTime}? Nội dung hiện tại sẽ được lưu vào lịch sử trước, nên vẫn hoàn tác được.`}
                    </p>
                    {contentDirty ? (
                      <p className="mt-1.5 font-medium">
                        Bạn đang có thay đổi chưa lưu ở thẻ “Nội dung trang” — các thay đổi
                        đó sẽ bị mất.
                      </p>
                    ) : null}
                    {otherWorkPending ? (
                      <p className="mt-1.5 font-medium">
                        {pendingTabLabels.length > 0
                          ? `Đang có video/ảnh tải lên hoặc thay đổi chưa lưu ở thẻ ${joinTabNames(
                              pendingTabLabels
                            )} — sẽ bị huỷ khi trang tải lại.`
                          : "Đang có video/ảnh tải lên hoặc thay đổi chưa lưu ở thẻ khác — sẽ bị huỷ khi trang tải lại."}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs">
                        Nếu đang tải video/ảnh lên ở cửa sổ khác, hãy đợi xong rồi mới khôi phục.
                      </p>
                    )}
                    {detail?.loading ? (
                      <p className="mt-1.5 text-xs">Đang kiểm tra file media...</p>
                    ) : detail?.missingMedia > 0 ? (
                      <p className="mt-1.5">
                        {detail.missingMedia} file media của bản này đã bị xoá khỏi R2 và
                        sẽ không hiện lại.
                      </p>
                    ) : detail?.error ? (
                      <p className="mt-1.5 text-xs">
                        Chưa kiểm tra được file media của bản này.
                      </p>
                    ) : null}
                    {restoreError?.key === entry.key ? (
                      <div className="mt-2 text-xs text-red-700">
                        <p className="break-words">{restoreError.message}</p>
                        {restoreError.hint ? (
                          <p className="mt-1 text-red-800">💡 {restoreError.hint}</p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        ref={cancelButtonRef}
                        type="button"
                        onClick={() => {
                          setConfirmKey(null);
                          setRestoreError(null);
                        }}
                        disabled={busy}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Huỷ
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRestore(entry)}
                        disabled={busy}
                        className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        {restoring
                          ? "Đang khôi phục..."
                          : restoredKey === entry.key
                          ? "Đã khôi phục"
                          : "Khôi phục"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
        >
          Xem thêm ({hiddenCount} bản cũ hơn)
        </button>
      ) : null}
    </div>
  );
}
