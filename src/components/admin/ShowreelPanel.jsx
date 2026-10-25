"use client";
import { useEffect, useRef, useState } from "react";
import {
  ACCEPT,
  cleanupUploadedKeys,
  formatBytes,
  formatDuration,
  formatUploadProgress,
  getFileMetadata,
  uploadFile,
  validateUploadFile,
} from "@/lib/uploadClient";
import { fetchJson } from "@/lib/apiClient";

// Above this size the upload can take many minutes on a typical connection.
const LARGE_VIDEO_BYTES = 500 * 1024 * 1024;

// Above these the homepage banner video gets slow to start (it loads before
// anything else on the page). Advice only — the upload is still allowed.
const BANNER_MAX_SECONDS = 45;
const BANNER_MAX_HEIGHT = 1080;
const BANNER_MAX_BYTES = 150 * 1024 * 1024;

// Plain-Vietnamese warnings for a picked showreel ([] when it looks fine).
function showreelWarnings({ size, duration, width, height } = {}) {
  const warnings = [];
  const seconds = Number(duration);
  if (duration !== null && duration !== undefined && Number.isFinite(seconds) && seconds > BANNER_MAX_SECONDS) {
    warnings.push(`Video dài ${formatDuration(seconds)} — nên dưới ${BANNER_MAX_SECONDS} giây.`);
  }
  const h = Number(height);
  if (Number.isFinite(h) && h > BANNER_MAX_HEIGHT) {
    const w = Number(width);
    const dims = Number.isFinite(w) && w > 0 ? `${w}×${h}` : `cao ${h} px`;
    warnings.push(`Độ phân giải ${dims} — nên tối đa 1080p (cao 1080 px).`);
  }
  const bytes = Number(size);
  if (Number.isFinite(bytes) && bytes > BANNER_MAX_BYTES) {
    warnings.push(`File nặng ${formatBytes(bytes)} — nên dưới 150 MB.`);
  }
  return warnings;
}

// `onBusyChange(busy)` (optional) reports while an upload is running.
export default function ShowreelPanel({ onBusyChange } = {}) {
  const [showreel, setShowreel] = useState(null);
  const [loading, setLoading] = useState(true);
  // True when the initial GET failed: we then don't know whether a showreel
  // exists, so the "Chưa có showreel" empty state must not be shown.
  const [loadFailed, setLoadFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Live upload state: { name, size, pct, loaded, total, etaSec, retry } | null.
  const [progress, setProgress] = useState(null);
  // "uploading" (Huỷ allowed) → "saving" (record write, cannot be cancelled).
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [errorHint, setErrorHint] = useState("");
  const [notice, setNotice] = useState("");
  // Reading the picked file's size / duration before uploading.
  const [checking, setChecking] = useState(false);
  // Picked file with warnings, waiting for "Vẫn tải lên": { file, warnings }.
  const [pending, setPending] = useState(null);
  const abortRef = useRef(null);
  // Bumped on every pick / unmount so a slow metadata read of an older pick
  // cannot start an upload.
  const pickTokenRef = useRef(0);

  // Leaving the admin tab mid-upload: stop the transfer (nothing was stored).
  useEffect(() => {
    const tokenHolder = pickTokenRef;
    return () => {
      tokenHolder.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  const onBusyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  }, [onBusyChange]);
  useEffect(() => {
    if (typeof onBusyChangeRef.current === "function") onBusyChangeRef.current(uploading);
  }, [uploading]);

  // Closing the browser tab would kill the upload — ask first.
  useEffect(() => {
    if (!uploading) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [uploading]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const payload = await fetchJson(
          "/api/admin/showreel",
          { cache: "no-store" },
          { fallbackError: "Không tải được showreel" }
        );
        if (alive) {
          setShowreel(payload?.data || null);
          setLoadFailed(false);
        }
      } catch (loadError) {
        // Surface the load failure (previously swallowed) so a broken R2
        // config is visible here too instead of looking like "no showreel".
        if (alive) {
          setLoadFailed(true);
          setError(loadError.message);
          setErrorHint(loadError.hint || "");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Pick → check length / resolution / size → upload straight away when it
  // looks fine, otherwise show the warnings and wait for "Vẫn tải lên".
  const handleChoose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setNotice("");
    setPending(null);
    const problem = validateUploadFile(file, { kind: "video" });
    if (problem) {
      setError(problem);
      setErrorHint("");
      return;
    }
    setError("");
    setErrorHint("");

    const token = pickTokenRef.current + 1;
    pickTokenRef.current = token;
    setChecking(true);
    let meta = null;
    try {
      meta = await getFileMetadata(file);
    } catch {
      meta = null;
    }
    if (pickTokenRef.current !== token) return;
    setChecking(false);

    const warnings = showreelWarnings({
      size: file.size,
      duration: meta?.duration,
      width: meta?.width,
      height: meta?.height,
    });
    if (warnings.length > 0) {
      setPending({ file, warnings });
      return;
    }
    await startUpload(file);
  };

  const handleUploadAnyway = async () => {
    const file = pending?.file;
    setPending(null);
    if (file) await startUpload(file);
  };

  const handleDismissPending = () => {
    pickTokenRef.current += 1;
    setPending(null);
    setNotice("Chưa tải video mới — showreel cũ vẫn giữ nguyên.");
  };

  const startUpload = async (file) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    setPhase("uploading");
    setProgress({
      name: file.name,
      size: file.size,
      pct: 0,
      loaded: 0,
      total: file.size,
      etaSec: null,
      retry: false,
    });
    setError("");
    setErrorHint("");
    try {
      const asset = await uploadFile(file, "showreel", {
        signal: controller.signal,
        // Keep the old behaviour for extension-less files picked as video.
        fallbackContentType: "video/mp4",
        onProgress: (info) => setProgress((prev) => ({ ...prev, ...info })),
      });
      // From here on the record is being written — no more cancelling.
      abortRef.current = null;
      setPhase("saving");
      let payload;
      try {
        payload = await fetchJson(
          "/api/admin/showreel",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(asset),
          },
          { fallbackError: "Lưu showreel thất bại" }
        );
      } catch (saveError) {
        // Upload succeeded but the save didn't persist — delete the orphaned
        // object so it doesn't linger in the bucket.
        await cleanupUploadedKeys(asset?.key ? [asset.key] : []);
        throw saveError;
      }
      setShowreel(payload?.data || null);
      setLoadFailed(false);
    } catch (err) {
      if (err?.code === "aborted") {
        setNotice("Đã huỷ tải lên showreel. Video cũ vẫn được giữ nguyên.");
      } else {
        setError(err?.message || "Tải showreel thất bại.");
        setErrorHint(err?.hint || "");
      }
    } finally {
      abortRef.current = null;
      setUploading(false);
      setPhase("");
      setProgress(null);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleClear = async () => {
    if (!window.confirm("Xoá showreel hiện tại? Trang chủ sẽ rơi về video mặc định.")) return;
    setError("");
    setErrorHint("");
    setNotice("");
    try {
      await fetchJson(
        "/api/admin/showreel",
        { method: "DELETE" },
        { fallbackError: "Xoá thất bại" }
      );
      setShowreel(null);
    } catch (err) {
      setError(err.message);
      setErrorHint(err.hint || "");
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Showreel trang chủ</h2>
          <p className="mt-1 text-xs text-gray-600">
            Video chạy lặp lại ở khung lớn đầu trang chủ. Nên dùng MP4 hoặc
            WebM, dài khoảng 30 giây, tối đa 1080p.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* The input stays focusable (sr-only, not display:none) so the
              picker can be opened with the keyboard. */}
          <label
            className={`relative cursor-pointer rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white focus-within:ring-2 focus-within:ring-black/40 focus-within:ring-offset-2 hover:bg-gray-800 ${
              uploading || checking ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {uploading
              ? phase === "saving"
                ? "Đang lưu..."
                : `Đang tải... ${Math.round(progress?.pct || 0)}%`
              : checking
              ? "Đang kiểm tra video..."
              : showreel
              ? "Thay video"
              : "Tải video lên"}
            <input
              type="file"
              accept={ACCEPT.video}
              className="sr-only"
              onChange={handleChoose}
              disabled={uploading || checking}
            />
          </label>
          {showreel && !uploading ? (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
            >
              Xoá
            </button>
          ) : null}
        </div>
      </div>

      {pending && !uploading ? (
        <div
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
          aria-live="polite"
        >
          <p className="break-words font-medium">
            “{pending.file.name}” có thể làm khung video đầu trang chủ tải chậm hơn:
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {pending.warnings.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-amber-800">
            Video càng dài và nặng thì khách càng phải chờ lâu, nhất là trên điện
            thoại. Bạn vẫn có thể tải lên, hoặc chọn bản nhẹ hơn.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleUploadAnyway}
              className="rounded-md bg-black px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-800"
            >
              Vẫn tải lên
            </button>
            <label className="relative cursor-pointer rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-900 focus-within:ring-2 focus-within:ring-amber-500 hover:bg-amber-100">
              Chọn video khác
              <input
                type="file"
                accept={ACCEPT.video}
                className="sr-only"
                onChange={handleChoose}
              />
            </label>
            <button
              type="button"
              onClick={handleDismissPending}
              className="rounded-md px-2.5 py-1 text-xs text-amber-900 underline hover:text-amber-700"
            >
              Huỷ, không tải lên
            </button>
          </div>
        </div>
      ) : null}

      {uploading && progress ? (
        <div
          className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words text-gray-800">
              <span className="font-medium">
                {phase === "saving" ? "Đã tải xong — đang lưu showreel…" : "Đang tải showreel"}
              </span>{" "}
              · {progress.name}
              {phase === "saving" ? null : <> — {formatUploadProgress(progress)}</>}
            </p>
            {phase === "uploading" ? (
              <button
                type="button"
                onClick={handleCancel}
                className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100"
              >
                Huỷ
              </button>
            ) : null}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-black transition-[width] duration-300"
              style={{ width: `${phase === "saving" ? 100 : Math.round(progress.pct || 0)}%` }}
            />
          </div>
          {progress.retry && phase === "uploading" ? (
            <p className="mt-1.5 text-amber-700">
              Mạng chập chờn — đang tự tải lại từ đầu (lần 2)…
            </p>
          ) : null}
          {progress.size > LARGE_VIDEO_BYTES ? (
            <p className="mt-1.5 text-amber-800">
              File lớn, upload có thể mất nhiều phút — giữ tab này mở.
            </p>
          ) : (
            <p className="mt-1.5 text-gray-500">Giữ tab này mở cho đến khi tải xong.</p>
          )}
        </div>
      ) : null}

      {notice && !uploading ? (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          <p className="break-words">{error}</p>
          {errorHint ? (
            <p className="mt-1 leading-relaxed text-red-800">💡 {errorHint}</p>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Đang tải...</p>
      ) : showreel ? (
        <div className="mt-4">
          <video
            src={showreel.url}
            className="max-h-72 w-full rounded-lg bg-black object-contain"
            controls
            playsInline
            preload="metadata"
          />
          <div className="mt-2 break-all text-xs text-gray-600">
            {showreel.name ? <span className="font-medium">{showreel.name}</span> : null}
            {showreel.duration ? <span> · {showreel.duration}s</span> : null}
            {showreel.width && showreel.height ? (
              <span>
                {" "}
                · {showreel.width}×{showreel.height}
              </span>
            ) : null}
          </div>
        </div>
      ) : loadFailed ? (
        <div className="mt-4 rounded-lg border border-dashed border-red-200 p-6 text-center text-sm text-gray-500">
          Không kiểm tra được showreel hiện tại (xem lỗi ở trên). Upload vẫn
          có thể thử lại sau khi sửa kết nối R2.
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Chưa có showreel — trang chủ đang dùng video mặc định có sẵn của trang web.
        </div>
      )}
    </div>
  );
}
