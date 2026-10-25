"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import FeaturedLayoutPanel from "@/components/admin/FeaturedLayoutPanel";
import ShowreelPanel from "@/components/admin/ShowreelPanel";
import AutocompleteInput from "@/components/admin/AutocompleteInput";
import {
  ACCEPT,
  UploadError,
  cleanupUploadedKeys,
  cleanupUploadedKeysOnUnload,
  formatBytes,
  formatDuration,
  formatUploadProgress,
  getFileMetadata,
  resolveContentType,
  runUploadQueue,
  uploadFile,
  validateUploadFile,
} from "@/lib/uploadClient";
import { fetchJson } from "@/lib/apiClient";

const TABS = [
  { key: "projects", label: "Video Projects" },
  { key: "image-projects", label: "Image Projects" },
];

const EMPTY_FORM = {
  title: "",
  slug: "",
  client: "",
  tagline: "",
  category: "",
  categoriesText: "",
  description: "",
  fullDescription: "",
  duration: "",
  order: "",
  completionDate: "",
  orientation: "landscape",
  featured: false,
  media: null,
  mediaList: [],
  // `preview` mirrors `media` for featured videos but holds the small
  // WebM (VP9, no audio) used by the homepage gallery. Modal click-to-play
  // still uses `media` (full-quality MP4).
  preview: null,
  // `adminRating` is the 0–5 favourite rating used inside the admin to
  // sort "Video Khác". Never sent to the public site.
  adminRating: 0,
  thumbnail: null,
};

const SORT_OPTIONS = [
  { key: "order", label: "Thứ tự thủ công" },
  { key: "rating-desc", label: "★ cao → thấp" },
  { key: "rating-asc", label: "★ thấp → cao" },
  { key: "date-desc", label: "Ngày mới → cũ" },
  { key: "date-asc", label: "Ngày cũ → mới" },
];

function timestampForItem(item) {
  const candidate =
    item?.completionDate || item?.publishedAt || item?.createdAt || null;
  if (!candidate) return 0;
  const t = new Date(candidate).getTime();
  return Number.isFinite(t) ? t : 0;
}

function StarRatingInput({ value = 0, onChange }) {
  const safeValue = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= safeValue;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange(safeValue === star ? 0 : star)}
            aria-label={`${star} sao`}
            className={`text-xl leading-none transition-colors ${
              filled ? "text-amber-500" : "text-gray-300 hover:text-amber-300"
            }`}
          >
            ★
          </button>
        );
      })}
      <span className="ml-2 text-xs text-gray-500">
        {safeValue > 0 ? `${safeValue} / 5` : "Chưa đánh giá"}
      </span>
      {safeValue > 0 ? (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="ml-1 text-[11px] text-gray-500 underline hover:text-gray-700"
        >
          Xoá
        </button>
      ) : null}
    </div>
  );
}

// Drag-drop multi-upload UI for image projects. Wraps the native
// <input type=file multiple> so users can either click the box to open
// the OS picker or drop a folder of images straight in. Newly dropped
// files are appended to the existing selection (legacy single-input
// replaced the entire array on each pick), and each file gets an
// inline preview thumbnail + remove button so accidental adds are easy
// to undo before save. Files with a format R2 won't accept (HEIC, SVG…)
// are skipped with a note instead of failing later at upload time.
// `uploadedFiles` = photos already uploaded by an earlier (failed) save.
function ImageDropzone({
  files = [],
  onChange,
  existingCount = 0,
  uploadedFiles = [],
  disabled = false,
}) {
  const [dragActive, setDragActive] = useState(false);
  const [rejectedNote, setRejectedNote] = useState("");
  const inputRef = useRef(null);

  // Object URLs for the preview thumbnails. Created on each render of
  // the file list and revoked when the file changes / unmounts to avoid
  // leaking blob URLs over the lifetime of a long admin session.
  const previewUrls = useMemo(
    () => files.map((f) => (f ? URL.createObjectURL(f) : "")),
    [files]
  );
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [previewUrls]);

  const handleFilesAdded = (incoming) => {
    if (disabled) return;
    const accepted = [];
    const rejected = [];
    Array.from(incoming || []).forEach((f) => {
      if (validateUploadFile(f, { kind: "image" })) rejected.push(f.name);
      else accepted.push(f);
    });
    setRejectedNote(
      rejected.length > 0
        ? `Bỏ qua ${rejected.length} file không đúng định dạng: ${rejected
            .slice(0, 3)
            .join(", ")}${rejected.length > 3 ? "…" : ""}. Chỉ nhận ảnh PNG, JPG, WebP, GIF, AVIF.`
        : ""
    );
    if (accepted.length === 0) return;
    onChange([...(files || []), ...accepted]);
  };

  const uploadedCount = files.filter((file) =>
    uploadedFiles.some((done) => isSameFile(done, file))
  ).length;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          handleFilesAdded(event.dataTransfer.files);
        }}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
            : dragActive
            ? "cursor-pointer border-black bg-gray-50"
            : "cursor-pointer border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
        }`}
      >
        <span className="text-2xl">⬆️</span>
        <p className="mt-2 text-sm font-medium text-gray-800">
          Kéo-thả ảnh vào đây
        </p>
        <p className="mt-1 text-xs text-gray-500">
          hoặc bấm để chọn nhiều file. Hỗ trợ PNG, JPG, WebP, GIF, AVIF.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.image}
          multiple
          disabled={disabled}
          className="hidden"
          onChange={(event) => {
            handleFilesAdded(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {rejectedNote ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          {rejectedNote}
        </p>
      ) : null}

      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>
          {files.length > 0
            ? `${files.length} file mới · sẽ thay toàn bộ ${existingCount} ảnh hiện có khi lưu`
            : `Hiện có ${existingCount} ảnh — kéo file mới sẽ thay thế danh sách này.`}
        </span>
        {files.length > 0 ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange([])}
            className="rounded-md border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Xoá hết
          </button>
        ) : null}
      </div>

      {uploadedCount > 0 ? (
        <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
          ✓ {uploadedCount}/{files.length} ảnh đã tải lên — chưa lưu
        </span>
      ) : null}

      {files.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {files.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrls[idx]}
                alt={file.name}
                className="h-full w-full object-cover"
              />
              {uploadedFiles.some((done) => isSameFile(done, file)) ? (
                <span
                  className="absolute left-1 top-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white"
                  title="Đã tải lên — chưa lưu"
                >
                  ✓
                </span>
              ) : null}
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  const next = [...files];
                  next.splice(idx, 1);
                  onChange(next);
                }}
                className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Xoá ${file.name}`}
              >
                ✕
              </button>
              <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                {file.name}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StarRatingDisplay({ value = 0 }) {
  const safeValue = Math.max(0, Math.min(5, Number(value) || 0));
  if (safeValue === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] text-amber-600"
      title={`${safeValue}/5`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= safeValue ? "" : "text-gray-300"}>
          ★
        </span>
      ))}
    </span>
  );
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeCategories(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function baseInputClassName() {
  return "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-black focus:outline-none";
}

// ---------------------------------------------------------------------------
// Upload helpers (all R2 upload logic itself lives in lib/uploadClient.js)
// ---------------------------------------------------------------------------

// Above this size a video upload can take many minutes — warn the admin.
const LARGE_VIDEO_BYTES = 500 * 1024 * 1024;
const PHOTO_CONCURRENCY = 3;
// Max re-render rate of the progress card while bytes are flowing.
const PROGRESS_THROTTLE_MS = 250;

// Assets already PUT to R2 by an earlier save attempt that then failed, kept
// so pressing save again only uploads what is still missing.
//   media / preview / thumbnail: { file, asset } | null
//   images: [{ file, asset }]
const SINGLE_SLOTS = ["media", "preview", "thumbnail"];
const EMPTY_UPLOAD_CACHE = Object.freeze({
  media: null,
  preview: null,
  thumbnail: null,
  images: [],
});

// Same picked file? Identity first; re-picking the very same file from disk
// gives a new File object with identical name/size/type/lastModified.
function isSameFile(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return (
    a.name === b.name &&
    a.size === b.size &&
    a.type === b.type &&
    a.lastModified === b.lastModified
  );
}

function cachedSingle(cache, slot, file) {
  const entry = cache?.[slot];
  return entry && isSameFile(entry.file, file) ? entry.asset : null;
}

function cachedImage(cache, file) {
  const entry = (cache?.images || []).find((item) => isSameFile(item.file, file));
  return entry ? entry.asset : null;
}

function uploadCacheKeys(cache) {
  const keys = [];
  SINGLE_SLOTS.forEach((slot) => {
    if (cache?.[slot]?.asset?.key) keys.push(cache[slot].asset.key);
  });
  (cache?.images || []).forEach((entry) => {
    if (entry?.asset?.key) keys.push(entry.asset.key);
  });
  return keys;
}

function removeKeysFromCache(cache, keys) {
  const drop = new Set(keys);
  const next = {
    ...cache,
    images: (cache?.images || []).filter((entry) => !drop.has(entry?.asset?.key)),
  };
  SINGLE_SLOTS.forEach((slot) => {
    if (next[slot] && drop.has(next[slot].asset?.key)) next[slot] = null;
  });
  return next;
}

// Every R2 key referenced by these records (saved items or a save payload).
function collectAssetKeys(records) {
  const keys = new Set();
  const add = (asset) => {
    if (asset && typeof asset.key === "string" && asset.key) keys.add(asset.key);
  };
  (records || []).forEach((record) => {
    if (!record) return;
    if (Array.isArray(record.media)) record.media.forEach(add);
    else add(record.media);
    add(record.preview);
    add(record.thumbnail);
  });
  return keys;
}

// After a record save "failed" on the client (504, dropped connection,
// empty body) the write may still have been stored. Returns the reloaded
// record that already uses this attempt's freshly uploaded files, or null.
function findStoredRecord(records, payload, cacheKeys) {
  if (!Array.isArray(records) || !payload) return null;
  const payloadKeys = collectAssetKeys([payload]);
  const fresh = (cacheKeys || []).filter((key) => payloadKeys.has(key));
  if (fresh.length === 0) return null;
  return (
    records.find((record) => {
      const keys = collectAssetKeys([record]);
      return fresh.some((key) => keys.has(key));
    }) || null
  );
}

// Short "which photos failed" text: "IMG_1.jpg, IMG_2.jpg và 3 ảnh khác".
function failedPhotoNames(names, max = 3) {
  const list = (names || []).filter(Boolean);
  if (list.length <= max) return list.join(", ");
  return `${list.slice(0, max).join(", ")} và ${list.length - max} ảnh khác`;
}

function isVideoFile(file) {
  return resolveContentType(file, "").startsWith("video/");
}

function isImageFile(file) {
  return resolveContentType(file, "").startsWith("image/");
}

// --- Progress model --------------------------------------------------------
// uploadProgress = { phase: 'uploading' | 'saving' | 'error', current, error,
//   steps: [{ label, name, size, status, pct, loaded, total, etaSec,
//             bytesPerSec, retry, cached, error, errorHint, items? }] }
// A photo batch is ONE step whose `items` are the individual photos.

const PROGRESS_FIELDS = ["pct", "loaded", "total", "etaSec", "bytesPerSec", "retry"];

function progressFields(info) {
  const out = {};
  PROGRESS_FIELDS.forEach((field) => {
    if (info && info[field] !== undefined) out[field] = info[field];
  });
  return out;
}

function makeStep(label, file, cached) {
  const size = Number(file?.size) || 0;
  return {
    label,
    name: file?.name || "",
    size,
    total: size,
    status: cached ? "done" : "pending",
    cached: Boolean(cached),
    pct: cached ? 100 : 0,
    loaded: cached ? size : 0,
    etaSec: null,
    bytesPerSec: null,
    retry: false,
    error: "",
    errorHint: "",
  };
}

function summarizePhotoItems(items) {
  let size = 0;
  let loaded = 0;
  let speed = 0;
  let doneCount = 0;
  let errorCount = 0;
  let active = 0;
  items.forEach((item) => {
    size += item.size;
    if (item.status === "done") {
      loaded += item.size;
      doneCount += 1;
    } else {
      loaded += Math.min(Number(item.loaded) || 0, item.size);
    }
    if (item.status === "error") errorCount += 1;
    if (item.status === "uploading") {
      active += 1;
      speed += Number(item.bytesPerSec) || 0;
    }
  });
  let status = "pending";
  if (active > 0) status = "uploading";
  else if (doneCount === items.length) status = "done";
  else if (errorCount > 0 && doneCount + errorCount === items.length) status = "error";
  const pct =
    size > 0
      ? Math.min(100, Math.floor((loaded / size) * 100))
      : doneCount === items.length
      ? 100
      : 0;
  return {
    size,
    total: size,
    loaded,
    pct,
    status,
    doneCount,
    errorCount,
    bytesPerSec: speed || null,
    etaSec: speed > 0 ? Math.max(0, (size - loaded) / speed) : null,
  };
}

function makePhotoGroup(label, files, cache) {
  const items = files.map((file) => makeStep("", file, cachedImage(cache, file)));
  return {
    label,
    name: `${files.length} ảnh`,
    cached: false,
    retry: false,
    error: "",
    errorHint: "",
    items,
    ...summarizePhotoItems(items),
  };
}

function patchStep(progress, index, patch) {
  const steps = progress.steps.map((step, i) => (i === index ? { ...step, ...patch } : step));
  return { ...progress, steps };
}

function patchPhoto(progress, index, photoIndex, patch) {
  const steps = progress.steps.map((step, i) => {
    if (i !== index || !step.items) return step;
    const items = step.items.map((item, j) => (j === photoIndex ? { ...item, ...patch } : item));
    return { ...step, items, ...summarizePhotoItems(items) };
  });
  return { ...progress, steps };
}

function photoPatchFrom(patch, file) {
  const size = Number(file?.size) || 0;
  if (patch.status === "done") {
    return { status: "done", pct: 100, loaded: size, etaSec: 0, bytesPerSec: null, error: "" };
  }
  if (patch.status === "error") {
    return {
      status: "error",
      bytesPerSec: null,
      error: patch.error?.message || "Tải lên thất bại.",
      errorHint: patch.error?.hint || "",
    };
  }
  return { status: "uploading", ...progressFields(patch) };
}

// Prefix an upload error with the step it belongs to, keeping hint/status.
function withStepContext(error, label, name) {
  const wrapped = new Error(
    `${label}${name ? ` (${name})` : ""}: ${error?.message || "tải lên thất bại."}`
  );
  wrapped.hint = error?.hint || "";
  wrapped.status = error?.status ?? null;
  wrapped.code = error?.code || "";
  wrapped.cause = error;
  return wrapped;
}

const STATUS_ICON = { done: "✓", uploading: "↑", pending: "·", error: "✕" };
const STATUS_ICON_CLASS = {
  done: "text-emerald-600",
  uploading: "text-black",
  pending: "text-gray-400",
  error: "text-red-600",
};

function stepStatusText(step) {
  if (step.items) {
    return `${step.doneCount}/${step.items.length} ảnh xong${
      step.errorCount ? ` · ${step.errorCount} lỗi` : ""
    }`;
  }
  if (step.status === "done") return step.cached ? "đã tải lên trước đó" : "xong";
  if (step.status === "uploading") return `đang tải ${Math.round(step.pct || 0)}%`;
  if (step.status === "error") return "lỗi";
  return "đang chờ";
}

function photoStatusText(item) {
  if (item.status === "done") return item.cached ? "đã tải trước đó" : "xong";
  if (item.status === "uploading") return `đang tải ${Math.round(item.pct || 0)}%`;
  if (item.status === "error") return "lỗi";
  return "đang chờ";
}

// Name · size · duration chip under a picked file, plus the "already
// uploaded" chip and a warning for very large videos.
function PickedFileInfo({ file, uploaded = false }) {
  const video = Boolean(file) && isVideoFile(file);
  const [duration, setDuration] = useState(null);

  useEffect(() => {
    let alive = true;
    setDuration(null);
    if (file && video) {
      getFileMetadata(file)
        .then((meta) => {
          if (alive) setDuration(meta?.duration ?? null);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [file, video]);

  if (!file) return null;
  const parts = [file.name, formatBytes(file.size)];
  const durationText = formatDuration(duration);
  if (durationText) parts.push(durationText);

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="max-w-full break-all rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700">
          {parts.join(" · ")}
        </span>
        {uploaded ? (
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
            ✓ Đã tải lên — chưa lưu
          </span>
        ) : null}
      </div>
      {video && file.size > LARGE_VIDEO_BYTES ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          File lớn, upload có thể mất nhiều phút — giữ tab này mở.
        </p>
      ) : null}
    </div>
  );
}

// Progress card shown right above the save button while a save uploads
// files (and after a failed attempt, to show what succeeded / failed).
function UploadProgressCard({ progress, onCancel, onRetry, keptCount = 0, saveLabel }) {
  if (!progress) return null;
  const { steps, current, phase } = progress;
  const total = steps.length;
  const active = steps[current] || null;
  const showActive = phase === "uploading" && active && active.status !== "done";
  const failedPhotos = steps.reduce((sum, step) => sum + (step.items ? step.errorCount : 0), 0);

  return (
    <div
      className={`rounded-xl border p-3 text-xs ${
        phase === "error" ? "border-red-200 bg-red-50/60" : "border-gray-200 bg-gray-50"
      }`}
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-900">
          {phase === "saving"
            ? "Đã tải file xong — đang lưu thông tin…"
            : phase === "error"
            ? "Chưa lưu được"
            : "Đang tải file lên"}
        </p>
        {phase === "uploading" && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100"
          >
            Huỷ
          </button>
        ) : null}
      </div>

      {showActive ? (
        <>
          <p className="mt-1.5 break-words text-gray-800">
            Bước {current + 1}/{total} · {active.label} · {active.name} —{" "}
            {formatUploadProgress(active)}
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-black transition-[width] duration-300"
              style={{ width: `${Math.round(active.pct || 0)}%` }}
            />
          </div>
          {active.retry ? (
            <p className="mt-1 text-amber-700">
              Mạng chập chờn — đang tự tải lại file này từ đầu (lần 2)…
            </p>
          ) : null}
        </>
      ) : null}

      <ul className="mt-2 space-y-1.5">
        {steps.map((step, index) => (
          <li key={`${step.label}-${index}`}>
            <div className="flex items-start gap-1.5">
              <span className={`w-3 shrink-0 text-center ${STATUS_ICON_CLASS[step.status]}`}>
                {STATUS_ICON[step.status]}
              </span>
              <span className="min-w-0 break-words text-gray-700">
                <span className="font-medium">{step.label}</span> · {step.name}{" "}
                <span className="text-gray-500">— {stepStatusText(step)}</span>
              </span>
            </div>
            {step.error ? (
              <div className="ml-4 mt-0.5 text-red-700">
                <p className="break-words">{step.error}</p>
                {step.errorHint ? (
                  <p className="mt-0.5 leading-relaxed text-red-800">💡 {step.errorHint}</p>
                ) : null}
              </div>
            ) : null}
            {step.items ? (
              <ul className="ml-4 mt-1 max-h-40 space-y-0.5 overflow-y-auto pr-1">
                {/* Failed photos first so they are visible without scrolling. */}
                {step.items
                  .map((item, photoIndex) => ({ item, photoIndex }))
                  .sort(
                    (a, b) =>
                      (a.item.status === "error" ? 0 : 1) - (b.item.status === "error" ? 0 : 1) ||
                      a.photoIndex - b.photoIndex
                  )
                  .map(({ item, photoIndex }) => (
                    <li key={`${item.name}-${photoIndex}`}>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-3 shrink-0 text-center ${STATUS_ICON_CLASS[item.status]}`}
                        >
                          {STATUS_ICON[item.status]}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-gray-700">{item.name}</span>
                        <span
                          className={`shrink-0 ${
                            item.status === "error" ? "text-red-600" : "text-gray-500"
                          }`}
                        >
                          {photoStatusText(item)}
                        </span>
                      </div>
                      {item.status === "error" && item.error ? (
                        <p className="ml-4 break-words text-[11px] text-red-600">{item.error}</p>
                      ) : null}
                    </li>
                  ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      {phase === "error" && progress.error ? (
        <div className="mt-2 text-red-700">
          <p className="break-words">{progress.error.message}</p>
          {progress.error.hint ? (
            <p className="mt-0.5 leading-relaxed text-red-800">💡 {progress.error.hint}</p>
          ) : null}
        </div>
      ) : null}

      {phase === "error" && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          {failedPhotos > 0 ? "Thử lại ảnh lỗi" : "Lưu lại"}
        </button>
      ) : null}

      {phase === "error" && keptCount > 0 ? (
        <p className="mt-2 text-gray-600">
          Các file đã tải lên vẫn được giữ — bấm “
          {failedPhotos > 0 ? "Thử lại ảnh lỗi" : "Lưu lại"}” ngay trên (hoặc nút “{saveLabel}”
          ở cuối form), không phải tải lại từ đầu.
        </p>
      ) : null}

      {phase === "uploading" ? (
        <p className="mt-2 text-gray-500">Giữ tab này mở cho đến khi xong.</p>
      ) : null}
    </div>
  );
}

// One-line status for the sticky save bar while a save is running, so the
// full card (in normal flow above it) never covers a phone screen.
function UploadProgressSummary({ progress, onCancel }) {
  if (!progress) return null;
  const { steps, current, phase } = progress;
  const active = steps[current] || null;
  let text = "Đang tải file lên…";
  if (phase === "saving") text = "Đã tải file xong — đang lưu thông tin…";
  else if (active) {
    text = `Bước ${current + 1}/${steps.length} · ${active.label} — ${Math.round(
      active.pct || 0
    )}%`;
  }
  return (
    <div className="flex w-full items-center justify-between gap-2 text-xs" aria-live="polite">
      <p className="min-w-0 truncate text-gray-700">{text}</p>
      {phase === "uploading" && onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100"
        >
          Huỷ
        </button>
      ) : null}
    </div>
  );
}

function toForm(item, tab) {
  return {
    title: item?.title || "",
    slug: item?.slug || "",
    client: item?.client || "",
    tagline: item?.tagline || "",
    category: item?.category || "",
    categoriesText: Array.isArray(item?.categories) ? item.categories.join(", ") : "",
    description: item?.description || "",
    fullDescription: item?.fullDescription || "",
    duration: item?.duration || "",
    order: item?.order ?? "",
    completionDate: item?.completionDate || "",
    orientation: item?.orientation || "landscape",
    featured: Boolean(item?.featured),
    media: tab === "projects" ? item?.media || null : null,
    mediaList: tab === "image-projects" ? item?.media || [] : [],
    preview: tab === "projects" ? item?.preview || null : null,
    adminRating: Number(item?.adminRating) || 0,
    thumbnail: item?.thumbnail || null,
  };
}

// `mode` prop locks the panel into one of four admin shells:
//   - undefined          → legacy combined panel (kept for backwards compat)
//   - "showreel-featured" → Showreel + FeaturedLayoutPanel + only featured videos
//   - "other-videos"     → only non-featured videos, no showreel/featured layout
//   - "images"           → image projects only
// When mode is set, the inner sub-tabs UI is hidden because the outer
// admin shell drives the section choice.
// `onBusyChange(busy)` (optional) tells the admin shell when an upload is
// running or uploaded files are not saved yet (e.g. to confirm Logout).
export default function ProjectsAdminPanel({ mode, onBusyChange } = {}) {
  // Resolve the current data domain ("projects" or "image-projects") from
  // the mode prop. Without a mode prop, the legacy behaviour kicks in: the
  // user picks the sub-tab.
  const resolvedTabFromMode = mode === "images" ? "image-projects" : "projects";
  const [tab, setTab] = useState(mode ? resolvedTabFromMode : TABS[0].key);
  // Re-sync tab when mode prop changes at runtime (defensive — admin shell
  // remounts panels on tab switch, but this guards against future re-use).
  useEffect(() => {
    if (mode) setTab(resolvedTabFromMode);
  }, [mode, resolvedTabFromMode]);

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Optional actionable hint returned by the API (e.g. which R2 env var to
  // fix). Shown under the error message when present.
  const [errorHint, setErrorHint] = useState("");
  // HTTP status of the last failed request (ApiError.status). Used to hide
  // the R2 diagnostics link when the real problem is an expired login (401).
  const [errorStatus, setErrorStatus] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);

  // --- Upload state (see UploadProgressCard / EMPTY_UPLOAD_CACHE) ---------
  const [uploadProgress, setUploadProgress] = useState(null);
  // Rendered copy of the cache; uploadCacheRef is the synchronous source of
  // truth used inside async save / pagehide / unmount handlers.
  const [uploadCache, setUploadCache] = useState(EMPTY_UPLOAD_CACHE);
  const uploadCacheRef = useRef(EMPTY_UPLOAD_CACHE);
  // AbortController of the running upload phase (null when nothing to cancel).
  const abortRef = useRef(null);
  // True while the final POST/PUT is in flight: cancelling or cleaning up
  // then could delete files a record is being saved with.
  const savingRecordRef = useRef(false);
  const itemsRef = useRef([]);
  const formRef = useRef(null);
  // Per-slot "wrong file type" messages shown under the file inputs.
  const [pickErrors, setPickErrors] = useState({});
  // Bumped to remount (= clear) the native file inputs on form reset.
  const [fileInputsKey, setFileInputsKey] = useState(0);
  const [cancelNotice, setCancelNotice] = useState("");
  // Green "saved" confirmation in the save bar after a successful save.
  const [savedNotice, setSavedNotice] = useState("");
  // Showreel upload running (it lives in its own panel above).
  const [showreelBusy, setShowreelBusy] = useState(false);

  const isEditing = editingId !== null;
  const [listFilter, setListFilter] = useState("");
  const [reordering, setReordering] = useState(false);
  const [dragId, setDragId] = useState(null);
  // Other-videos defaults to rating-desc so the user's favourites float
  // up; everywhere else the canonical manual order is the most useful
  // default. Drag-and-drop is only enabled when sort === "order" because
  // reordering a sort that isn't manual would just be confusing.
  const [listSort, setListSort] = useState(
    mode === "other-videos" ? "rating-desc" : "order"
  );

  const tabLabel = useMemo(() => TABS.find((item) => item.key === tab)?.label || tab, [tab]);

  const suggestions = useMemo(() => {
    const buckets = {
      title: new Set(),
      client: new Set(),
      tagline: new Set(),
      category: new Set(),
      categories: new Set(),
      duration: new Set(),
    };
    for (const item of items) {
      if (!item) continue;
      if (item.title) buckets.title.add(item.title);
      if (item.client) buckets.client.add(item.client);
      if (item.tagline) buckets.tagline.add(item.tagline);
      if (item.category) buckets.category.add(item.category);
      if (item.duration) buckets.duration.add(item.duration);
      if (Array.isArray(item.categories)) {
        for (const cat of item.categories) {
          if (cat) {
            buckets.category.add(cat);
            buckets.categories.add(cat);
          }
        }
      }
    }
    return Object.fromEntries(
      Object.entries(buckets).map(([k, set]) => [k, Array.from(set).sort()])
    );
  }, [items]);

  // Mode-based pre-filter: showreel-featured shows only featured videos,
  // other-videos shows only non-featured. Other modes pass everything
  // through and let the search box do the work.
  const modeFilteredItems = useMemo(() => {
    if (mode === "showreel-featured") {
      return items.filter((item) => Boolean(item?.featured));
    }
    if (mode === "other-videos") {
      return items.filter((item) => !item?.featured);
    }
    return items;
  }, [items, mode]);

  const filteredItems = useMemo(() => {
    const query = listFilter.trim().toLowerCase();
    if (!query) return modeFilteredItems;
    return modeFilteredItems.filter((item) => {
      const haystack = [
        item.title,
        item.client,
        item.slug,
        item.category,
        Array.isArray(item.categories) ? item.categories.join(" ") : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [modeFilteredItems, listFilter]);

  // sortedFilteredItems is what the list actually renders. The canonical
  // `items` array stays in manual order so drag-drop reorder still works
  // when the user flips listSort back to "order".
  const sortedFilteredItems = useMemo(() => {
    if (listSort === "order") return filteredItems;
    const arr = [...filteredItems];
    if (listSort === "rating-desc") {
      arr.sort((a, b) => (Number(b.adminRating) || 0) - (Number(a.adminRating) || 0));
    } else if (listSort === "rating-asc") {
      arr.sort((a, b) => (Number(a.adminRating) || 0) - (Number(b.adminRating) || 0));
    } else if (listSort === "date-desc") {
      arr.sort((a, b) => timestampForItem(b) - timestampForItem(a));
    } else if (listSort === "date-asc") {
      arr.sort((a, b) => timestampForItem(a) - timestampForItem(b));
    }
    return arr;
  }, [filteredItems, listSort]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const writeUploadCache = useCallback((updater) => {
    const next = typeof updater === "function" ? updater(uploadCacheRef.current) : updater;
    uploadCacheRef.current = next;
    setUploadCache(next);
  }, []);

  // Only delete keys no loaded record points at (safety net in case a save
  // reported an error but was actually stored).
  const unsavedKeys = useCallback((keys) => {
    const referenced = collectAssetKeys(itemsRef.current);
    return (keys || []).filter((key) => key && !referenced.has(key));
  }, []);

  // Forget specific cached uploads (their picked file changed) and delete them.
  const forgetCachedKeys = useCallback(
    (keys) => {
      if (!keys || keys.length === 0) return;
      writeUploadCache((prev) => removeKeysFromCache(prev, keys));
      cleanupUploadedKeys(unsavedKeys(keys));
    },
    [writeUploadCache, unsavedKeys]
  );

  // Drop every uploaded-but-unsaved file (form reset / switching record).
  const discardUploadCache = useCallback(() => {
    const keys = uploadCacheKeys(uploadCacheRef.current);
    writeUploadCache(EMPTY_UPLOAD_CACHE);
    if (keys.length > 0) cleanupUploadedKeys(unsavedKeys(keys));
  }, [writeUploadCache, unsavedKeys]);

  // Tab closed / navigated away: delete uploads that were never saved.
  useEffect(() => {
    const onPageHide = () => {
      if (savingRecordRef.current) return;
      const keys = unsavedKeys(uploadCacheKeys(uploadCacheRef.current));
      if (keys.length === 0) return;
      cleanupUploadedKeysOnUnload(keys);
      // If the page is restored from the back/forward cache those objects
      // are gone — forget them so the next save uploads again.
      writeUploadCache(EMPTY_UPLOAD_CACHE);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [unsavedKeys, writeUploadCache]);

  // Panel unmounted (admin shell switched section): stop uploads and delete
  // what was uploaded but never saved.
  useEffect(() => {
    const cacheRef = uploadCacheRef;
    const abortHolder = abortRef;
    const savingHolder = savingRecordRef;
    return () => {
      abortHolder.current?.abort();
      if (savingHolder.current) return;
      const keys = unsavedKeys(uploadCacheKeys(cacheRef.current));
      if (keys.length > 0) cleanupUploadedKeys(keys);
    };
  }, [unsavedKeys]);

  // Ask before closing the tab while uploading or with unsaved uploads.
  const hasUnsavedUploads = uploadCacheKeys(uploadCache).length > 0;
  useEffect(() => {
    if (!saving && !hasUnsavedUploads) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saving, hasUnsavedUploads]);

  const busy = saving || hasUnsavedUploads || showreelBusy;
  const onBusyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  }, [onBusyChange]);
  useEffect(() => {
    if (typeof onBusyChangeRef.current === "function") onBusyChangeRef.current(busy);
  }, [busy]);
  useEffect(
    () => () => {
      if (typeof onBusyChangeRef.current === "function") onBusyChangeRef.current(false);
    },
    []
  );

  const resetUploadUi = () => {
    setUploadProgress(null);
    setPickErrors({});
    setCancelNotice("");
    setSavedNotice("");
    setFileInputsKey((value) => value + 1);
  };

  const resetEditor = () => {
    discardUploadCache();
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMediaFile(null);
    setMediaFiles([]);
    setPreviewFile(null);
    setThumbnailFile(null);
    setError("");
    resetUploadUi();
  };

  // Leaving the form (new / clear / edit another / switch tab) deletes files
  // uploaded by a failed save — ask first.
  const confirmDiscardUploads = () => {
    if (uploadCacheKeys(uploadCacheRef.current).length === 0) return true;
    return window.confirm(
      "Các file đã tải lên (chưa lưu) sẽ bị xoá. Bạn có chắc muốn tiếp tục?"
    );
  };

  const SLOT_SETTERS = {
    media: setMediaFile,
    preview: setPreviewFile,
    thumbnail: setThumbnailFile,
  };

  // Single-file inputs: validate the type, and if the slot's file changes,
  // delete the copy an earlier failed save already uploaded for it.
  const pickFile = (slot, kind, event) => {
    const picked = event.target.files?.[0] || null;
    let next = picked;
    let problem = "";
    if (picked) {
      problem = validateUploadFile(picked, { kind }) || "";
      if (problem) {
        next = null;
        event.target.value = "";
      }
    }
    setPickErrors((prev) => ({ ...prev, [slot]: problem }));
    const cached = uploadCacheRef.current[slot];
    if (cached && !isSameFile(cached.file, next)) forgetCachedKeys([cached.asset.key]);
    SLOT_SETTERS[slot](next);
  };

  // Photo list changed: delete uploaded copies of photos that were removed.
  const changeMediaFiles = (next) => {
    const list = Array.isArray(next) ? next : [];
    const dropped = uploadCacheRef.current.images.filter(
      (entry) => !list.some((file) => isSameFile(file, entry.file))
    );
    if (dropped.length > 0) forgetCachedKeys(dropped.map((entry) => entry.asset.key));
    setMediaFiles(list);
  };

  // Returns the loaded list (null on failure). itemsRef is updated right
  // away so a cleanup decided just after this await sees the fresh records.
  const loadItems = useCallback(async (targetTab) => {
    setLoadingItems(true);
    setError("");
    setErrorHint("");
    setErrorStatus(null);
    try {
      const payload = await fetchJson(
        `/api/admin/${targetTab}`,
        { cache: "no-store" },
        { fallbackError: "Không tải được danh sách" }
      );
      const list = Array.isArray(payload.data) ? payload.data : [];
      itemsRef.current = list;
      setItems(list);
      return list;
    } catch (loadError) {
      setError(loadError.message);
      setErrorHint(loadError.hint || "");
      setErrorStatus(loadError.status ?? null);
      setItems([]);
      return null;
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    loadItems(tab);
  }, [tab, loadItems]);

  // Returns false when the admin chose to keep the unsaved uploads.
  const startCreate = () => {
    if (!confirmDiscardUploads()) return false;
    resetEditor();
    return true;
  };

  const startEdit = (item) => {
    if (!confirmDiscardUploads()) return;
    discardUploadCache();
    setEditingId(item.id);
    setForm(toForm(item, tab));
    setMediaFile(null);
    setMediaFiles([]);
    setPreviewFile(null);
    setThumbnailFile(null);
    setError("");
    resetUploadUi();
  };

  // Persist a new ordering of `items` to the server. Called by both the
  // ↑/↓ buttons and drag-and-drop. Optimistic: updates local state first,
  // then reloads on failure so the UI matches the source of truth.
  const persistOrder = useCallback(
    async (nextItems) => {
      const reordered = nextItems.map((it, i) => ({ ...it, order: i + 1 }));
      setItems(reordered);
      setReordering(true);
      setError("");
      setErrorHint("");
      setErrorStatus(null);
      try {
        const result = await fetchJson(
          `/api/admin/${tab}/reorder`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderedIds: reordered.map((it) => it.id),
            }),
          },
          { fallbackError: "Lưu thứ tự thất bại" }
        );
        // The projects reorder route returns the saved list: a reorder may
        // also re-flow featured grid pins (`featuredSlot`), which the
        // optimistic update above cannot know about. Adopt the server
        // state so FeaturedLayoutPanel's preview stays in sync.
        if (Array.isArray(result?.data)) setItems(result.data);
      } catch (reorderError) {
        // Reload first (it clears the error banner), THEN show the reorder
        // failure — otherwise the message is wiped a moment after it appears.
        await loadItems(tab);
        setError(reorderError.message);
        setErrorHint(reorderError.hint || "");
        setErrorStatus(reorderError.status ?? null);
      } finally {
        setReordering(false);
      }
    },
    [tab, loadItems]
  );

  const handleMove = (item, direction) => {
    if (listFilter || reordering || listSort !== "order") return;
    const idx = items.findIndex((it) => Number(it.id) === Number(item.id));
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target], next[idx]];
    persistOrder(next);
  };

  const handleDropOnto = (targetItem) => {
    if (listFilter || reordering || listSort !== "order") return;
    if (dragId === null) return;
    const fromIdx = items.findIndex((it) => Number(it.id) === Number(dragId));
    const toIdx = items.findIndex((it) => Number(it.id) === Number(targetItem.id));
    setDragId(null);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    persistOrder(next);
  };

  const handleDelete = async (id) => {
    const shouldDelete = window.confirm("Xoa muc nay?");
    if (!shouldDelete) return;

    setError("");
    setErrorHint("");
    setErrorStatus(null);
    try {
      // Bare async click handler: without try/catch an empty/non-JSON error
      // body used to reject silently — no message, list never refreshed,
      // the row appeared to "do nothing".
      await fetchJson(
        `/api/admin/${tab}/${id}`,
        { method: "DELETE" },
        { fallbackError: "Xoá thất bại" }
      );
    } catch (deleteError) {
      setError(deleteError.message);
      setErrorHint(deleteError.hint || "");
      setErrorStatus(deleteError.status ?? null);
      return;
    }

    if (Number(editingId) === Number(id)) {
      resetEditor();
    }

    await loadItems(tab);
  };

  const handleSave = async (event) => {
    event?.preventDefault?.();
    if (saving) return;
    setSaving(true);
    setError("");
    setErrorHint("");
    setErrorStatus(null);
    setCancelNotice("");
    setSavedNotice("");

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    // Keys PUT to R2 during THIS attempt. On Huỷ they are deleted again; on
    // any other failure they stay cached so the next save skips them.
    const attemptKeys = [];
    const isVideoTab = tab === "projects";

    // What has to be uploaded, in order. Image projects: photos, thumbnail.
    const plan = [];
    if (isVideoTab) {
      if (mediaFile) {
        plan.push({
          slot: "media",
          label: isImageFile(mediaFile) ? "Ảnh chính" : "Video chính",
          file: mediaFile,
          folder: "projects",
        });
      }
      if (previewFile) {
        plan.push({ slot: "preview", label: "Preview WebM", file: previewFile, folder: "projects" });
      }
    } else if (mediaFiles.length > 0) {
      plan.push({ slot: "images", label: "Ảnh dự án", files: [...mediaFiles], folder: "image-projects" });
    }
    if (thumbnailFile) {
      plan.push({ slot: "thumbnail", label: "Ảnh thumbnail", file: thumbnailFile, folder: "thumbnails" });
    }

    const cacheAtStart = uploadCacheRef.current;
    const showCard = plan.length > 0;
    let progress = {
      phase: "uploading",
      current: 0,
      error: null,
      steps: plan.map((entry) =>
        entry.slot === "images"
          ? makePhotoGroup(entry.label, entry.files, cacheAtStart)
          : makeStep(entry.label, entry.file, cachedSingle(cacheAtStart, entry.slot, entry.file))
      ),
    };
    // `progress` is the local source of truth (concurrent photo callbacks
    // patch it synchronously) and is mirrored into state. Byte-progress
    // ticks arrive many times a second; they are throttled so the whole
    // panel (framer-motion layout) doesn't re-render on every XHR event.
    // Status changes flush immediately.
    let flushTimer = null;
    let lastFlushAt = 0;
    const cancelFlush = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
    };
    const flush = () => {
      cancelFlush();
      lastFlushAt = Date.now();
      if (showCard) setUploadProgress(progress);
    };
    const commit = (updater, { throttle = false } = {}) => {
      progress = updater(progress);
      if (!showCard) return;
      if (!throttle) {
        flush();
        return;
      }
      if (flushTimer) return;
      flushTimer = setTimeout(flush, Math.max(0, PROGRESS_THROTTLE_MS - (Date.now() - lastFlushAt)));
    };
    setUploadProgress(showCard ? progress : null);

    // The record payload (set once the uploads are done).
    let payload = null;

    // Saved: the cached assets are now referenced by the record. Anything
    // cached that the payload did not use (e.g. a duplicated photo) is an
    // orphan — delete it. Then show the saved record in edit mode.
    const finishSaved = async (savedItem, notice, { reload = true } = {}) => {
      const savedKeys = collectAssetKeys([payload]);
      const leftovers = uploadCacheKeys(uploadCacheRef.current).filter(
        (key) => !savedKeys.has(key)
      );
      writeUploadCache(EMPTY_UPLOAD_CACHE);
      if (leftovers.length > 0) cleanupUploadedKeys(unsavedKeys(leftovers));

      resetEditor();
      if (reload) await loadItems(tab);

      if (savedItem?.id) {
        setEditingId(savedItem.id);
        setForm(toForm(savedItem, tab));
      }
      setSavedNotice(notice);
    };

    const uploadSingle = async (index, entry) => {
      const hit = cachedSingle(uploadCacheRef.current, entry.slot, entry.file);
      if (hit) return hit;
      commit((p) =>
        patchStep(p, index, { status: "uploading", pct: 0, loaded: 0, error: "", errorHint: "" })
      );
      try {
        const asset = await uploadFile(entry.file, entry.folder, {
          signal,
          onProgress: (info) =>
            commit((p) => patchStep(p, index, { status: "uploading", ...progressFields(info) }), {
              throttle: true,
            }),
        });
        attemptKeys.push(asset.key);
        writeUploadCache((prev) => ({ ...prev, [entry.slot]: { file: entry.file, asset } }));
        commit((p) =>
          patchStep(p, index, {
            status: "done",
            pct: 100,
            loaded: entry.file.size,
            etaSec: 0,
            retry: false,
          })
        );
        return asset;
      } catch (uploadError) {
        commit((p) =>
          patchStep(p, index, {
            status: "error",
            error: uploadError?.message || "Tải lên thất bại.",
            errorHint: uploadError?.hint || "",
          })
        );
        throw withStepContext(uploadError, entry.label, entry.file.name);
      }
    };

    const uploadPhotos = async (index, entry) => {
      const assets = entry.files.map((file) => cachedImage(uploadCacheRef.current, file));
      const tasks = [];
      entry.files.forEach((file, photoIndex) => {
        if (!assets[photoIndex]) tasks.push({ id: photoIndex, file, folder: entry.folder });
      });
      commit((p) => patchStep(p, index, { error: "", errorHint: "" }));
      if (tasks.length === 0) return assets;

      const results = await runUploadQueue(tasks, {
        concurrency: PHOTO_CONCURRENCY,
        signal,
        onTaskUpdate: (photoIndex, patch) => {
          if (patch.status === "done" && patch.result?.key) {
            const file = entry.files[photoIndex];
            const asset = patch.result;
            attemptKeys.push(asset.key);
            writeUploadCache((prev) => ({ ...prev, images: [...prev.images, { file, asset }] }));
          }
          commit(
            (p) => patchPhoto(p, index, photoIndex, photoPatchFrom(patch, entry.files[photoIndex])),
            { throttle: patch.status === "uploading" }
          );
        },
      });

      const failed = [];
      results.forEach((result) => {
        if (result.status === "done") assets[result.id] = result.result;
        else failed.push(result);
      });
      if (signal.aborted) throw new UploadError("aborted");
      if (failed.length > 0) {
        const first = failed[0].error;
        const names = failedPhotoNames(failed.map((result) => entry.files[result.id]?.name));
        const batchError = new Error(
          `${entry.label}: ${failed.length}/${entry.files.length} ảnh chưa tải lên được (${names}) — ${
            first?.message || "lỗi không rõ."
          }`
        );
        batchError.hint = [
          first?.hint,
          "Bấm “Thử lại ảnh lỗi” — ảnh đã tải xong sẽ không phải tải lại.",
        ]
          .filter(Boolean)
          .join(" ");
        batchError.status = first?.status ?? null;
        commit((p) =>
          patchStep(p, index, {
            error: `${failed.length} ảnh chưa tải lên được: ${names} — ${
              first?.message || "lỗi không rõ."
            }`,
            errorHint: first?.hint || "",
          })
        );
        throw batchError;
      }
      return assets;
    };

    try {
      const uploaded = {};
      for (let index = 0; index < plan.length; index += 1) {
        const entry = plan[index];
        commit((p) => ({ ...p, current: index }));
        uploaded[entry.slot] =
          entry.slot === "images"
            ? await uploadPhotos(index, entry)
            : await uploadSingle(index, entry);
      }
      if (signal.aborted) throw new UploadError("aborted");

      const basePayload = {
        title: form.title,
        slug: form.slug || slugify(form.title),
        client: form.client,
        tagline: form.tagline,
        category: form.category,
        categories: normalizeCategories(form.categoriesText),
        description: form.description,
        fullDescription: form.fullDescription,
        completionDate: form.completionDate || null,
        orientation: form.orientation,
        featured: form.featured,
        adminRating: Number(form.adminRating) || 0,
        order: form.order === "" ? null : Number(form.order),
      };

      payload = { ...basePayload };

      if (isVideoTab) {
        payload = {
          ...payload,
          duration: form.duration,
          media: uploaded.media || form.media,
          preview: uploaded.preview || form.preview,
          thumbnail: uploaded.thumbnail || form.thumbnail,
        };
      } else {
        payload = {
          ...payload,
          media: uploaded.images || (Array.isArray(form.mediaList) ? form.mediaList : []),
          thumbnail: uploaded.thumbnail || form.thumbnail,
        };
      }

      // From here the record is being written: no more cancelling, and no
      // cleanup of these keys if the page is closed meanwhile.
      savingRecordRef.current = true;
      abortRef.current = null;
      commit((p) => ({ ...p, phase: "saving" }));

      const endpoint = isEditing ? `/api/admin/${tab}/${editingId}` : `/api/admin/${tab}`;
      const method = isEditing ? "PUT" : "POST";

      const responsePayload = await fetchJson(
        endpoint,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        { fallbackError: "Lưu thất bại" }
      );

      await finishSaved(
        responsePayload?.data,
        showCard ? "Đã lưu xong ✓ — file đã được tải lên và lưu." : "Đã lưu xong ✓"
      );
    } catch (saveError) {
      // A pending throttled tick must not resurrect the card after this.
      cancelFlush();
      if (signal.aborted && !savingRecordRef.current) {
        // Huỷ: delete what THIS attempt uploaded (never saved). Uploads kept
        // from an earlier failed attempt stay cached.
        writeUploadCache((prev) => removeKeysFromCache(prev, attemptKeys));
        await cleanupUploadedKeys(unsavedKeys(attemptKeys));
        setUploadProgress(null);
        setCancelNotice(
          attemptKeys.length > 0
            ? "Đã huỷ tải lên. Các file vừa tải lên trong lần này đã được xoá."
            : "Đã huỷ tải lên."
        );
      } else {
        // Keep everything uploaded so far: pressing save again only uploads
        // what is still missing.
        const recordError = savingRecordRef.current;
        if (recordError && payload) {
          // The write may have been stored although the response was lost
          // (504, dropped connection, empty body). Reload the list BEFORE
          // any cleanup can run, so the "is this key saved?" check is not
          // based on stale records — and so "Tạo mới" is not pressed again
          // to POST a duplicate that shares the same files.
          const reloaded = await loadItems(tab);
          const landed = findStoredRecord(
            reloaded,
            payload,
            uploadCacheKeys(uploadCacheRef.current)
          );
          if (landed) {
            await finishSaved(
              landed,
              "Đã lưu xong ✓ (mạng phản hồi chậm nhưng dữ liệu đã được lưu).",
              { reload: false }
            );
            return;
          }
        }
        commit((p) => ({
          ...p,
          phase: "error",
          error: recordError
            ? {
                message: `Lưu thông tin thất bại: ${saveError?.message || "lỗi không rõ."}`,
                hint: saveError?.hint || "",
              }
            : null,
        }));
        setError(saveError?.message || "Lưu thất bại.");
        setErrorHint(saveError?.hint || "");
        setErrorStatus(saveError?.status ?? null);
      }
    } finally {
      savingRecordRef.current = false;
      abortRef.current = null;
      setSaving(false);
    }
  };

  const handleCancelUpload = () => {
    if (savingRecordRef.current) return;
    abortRef.current?.abort();
  };

  // "Thử lại ảnh lỗi": re-submit — cached photos are skipped, only the
  // failed / missing ones upload again.
  const handleRetryUploads = () => {
    if (saving) return;
    const formElement = formRef.current;
    if (formElement && typeof formElement.requestSubmit === "function") {
      formElement.requestSubmit();
    } else {
      handleSave();
    }
  };

  // Section visibility derived from mode prop. The legacy combined panel
  // (mode === undefined) keeps its original behaviour so anything still
  // importing ProjectsAdminPanel without a mode renders unchanged.
  const showShowreelSection = !mode || mode === "showreel-featured";
  const showFeaturedLayoutSection =
    (!mode && tab === "projects") || mode === "showreel-featured";
  const showSubTabs = !mode;

  return (
    <div>
      {showShowreelSection ? (
        <div className="mt-6">
          <ShowreelPanel onBusyChange={setShowreelBusy} />
        </div>
      ) : null}

      {/* Sub-tabs row only shows in legacy mode; in the four-tab admin
          shell the outer page handles tab switching, and the "+ Tạo mới"
          button has been moved to the list panel toolbar where it's
          contextual to the list. */}
      {showSubTabs ? (
        <div className="mt-8 flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={saving}
              onClick={() => {
                if (!confirmDiscardUploads()) return;
                setTab(item.key);
                resetEditor();
                setListFilter("");
              }}
              className={`rounded-full px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                tab === item.key
                  ? "bg-black text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            disabled={saving}
            onClick={startCreate}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + New {tabLabel}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="break-words">{error}</p>
          {errorHint ? (
            <p className="mt-1.5 text-xs leading-relaxed text-red-800">💡 {errorHint}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => loadItems(tab)}
              disabled={loadingItems}
              className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Tải lại danh sách
            </button>
            {errorStatus === 401 ? (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-xs text-red-700 underline hover:text-red-900"
              >
                Tải lại trang để đăng nhập
              </button>
            ) : (
              <a
                href="/api/admin/health"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-red-700 underline hover:text-red-900"
                title="Mở báo cáo kiểm tra biến môi trường + kết nối R2 của server (tab mới)"
              >
                Kiểm tra kết nối R2 ↗
              </a>
            )}
          </div>
        </div>
      ) : null}

      {/* Stay mounted while re-fetching once we have items, so an unsaved
          layout the admin is arranging survives a save/delete elsewhere on
          the page (the panel only re-syncs when the server layout changed). */}
      {showFeaturedLayoutSection && (!loadingItems || items.length > 0) ? (
        <div className="mt-8">
          <FeaturedLayoutPanel items={items} onSaved={() => loadItems(tab)} />
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <motion.div
          layout
          className="rounded-2xl border border-gray-200 p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isEditing ? `edit-${editingId}` : "create"}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.18 }}
                  className="inline-block"
                >
                  {isEditing ? `Edit #${editingId}` : `Create ${tabLabel}`}
                </motion.span>
              </AnimatePresence>
            </h2>
            {isEditing ? (
              <button
                type="button"
                onClick={startCreate}
                disabled={saving}
                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Tạo mới
              </button>
            ) : null}
          </div>

          <form ref={formRef} onSubmit={handleSave} className="mt-4 space-y-4">
            {/* Locked while saving: handleSave sends the form as it was when
                the save started, and a successful save reloads the record —
                edits typed during a long upload would be silently lost. */}
            <fieldset disabled={saving} className="m-0 min-w-0 space-y-4 border-0 p-0">
            <div>
              <label className="mb-2 block text-sm font-medium">Title *</label>
              <AutocompleteInput
                value={form.title}
                onChange={(v) => setForm((prev) => ({ ...prev, title: v }))}
                suggestions={suggestions.title}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Slug</label>
              <input
                value={form.slug}
                onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
                className={baseInputClassName()}
                placeholder="auto-generated if empty"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Client</label>
                <AutocompleteInput
                  value={form.client}
                  onChange={(v) => setForm((prev) => ({ ...prev, client: v }))}
                  suggestions={suggestions.client}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Category</label>
                <AutocompleteInput
                  value={form.category}
                  onChange={(v) => setForm((prev) => ({ ...prev, category: v }))}
                  suggestions={suggestions.category}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Categories (comma-separated)</label>
              <AutocompleteInput
                value={form.categoriesText}
                onChange={(v) => setForm((prev) => ({ ...prev, categoriesText: v }))}
                suggestions={suggestions.categories}
                splitDelimiter=","
                placeholder="vd: Commercial, TVC"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Tagline</label>
              <AutocompleteInput
                value={form.tagline}
                onChange={(v) => setForm((prev) => ({ ...prev, tagline: v }))}
                suggestions={suggestions.tagline}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Description</label>
              <textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                className={baseInputClassName()}
                rows={3}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Full Description</label>
              <textarea
                value={form.fullDescription}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, fullDescription: event.target.value }))
                }
                className={baseInputClassName()}
                rows={5}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Order</label>
                <input
                  type="number"
                  value={form.order}
                  onChange={(event) => setForm((prev) => ({ ...prev, order: event.target.value }))}
                  className={baseInputClassName()}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Completion Date</label>
                <input
                  type="date"
                  value={form.completionDate || ""}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, completionDate: event.target.value }))
                  }
                  className={baseInputClassName()}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Orientation</label>
                <select
                  value={form.orientation}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, orientation: event.target.value }))
                  }
                  className={baseInputClassName()}
                >
                  <option value="landscape">landscape (16:9)</option>
                  <option value="portrait">portrait (9:16)</option>
                  <option value="square">square (1:1)</option>
                </select>
              </div>

              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, featured: event.target.checked }))
                    }
                  />
                  Featured
                </label>
              </div>
            </div>

            {/* Admin-only favourite rating, only exposed in the
                "Video Khác" tab where the spec calls for it. The value
                is still persisted on every project though, so flipping
                a video into Featured doesn't lose its rating. */}
            {mode === "other-videos" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <label className="mb-2 block text-sm font-medium">
                  Đánh giá yêu thích (chỉ hiện trong admin)
                </label>
                <StarRatingInput
                  value={form.adminRating}
                  onChange={(next) =>
                    setForm((prev) => ({ ...prev, adminRating: next }))
                  }
                />
                <p className="mt-2 text-[11px] text-gray-600">
                  Dùng để sort danh sách Video Khác. Không hiển thị trên
                  trang công khai.
                </p>
              </div>
            ) : null}

            {tab === "projects" ? (
              <div>
                <label className="mb-2 block text-sm font-medium">Duration</label>
                <AutocompleteInput
                  value={form.duration}
                  onChange={(v) => setForm((prev) => ({ ...prev, duration: v }))}
                  suggestions={suggestions.duration}
                  placeholder="Ex: 01:30"
                />
              </div>
            ) : null}

            {tab === "projects" ? (
              <>
                <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Media file (video/image)
                    </label>
                    <p className="mb-2 text-xs text-gray-500">
                      File chính (MP4 chất lượng cao). Người xem click xem trong modal sẽ phát file này.
                    </p>
                    <input
                      key={`media-${fileInputsKey}`}
                      type="file"
                      accept={ACCEPT.media}
                      disabled={saving}
                      onChange={(event) => pickFile("media", "media", event)}
                    />
                    {pickErrors.media ? (
                      <p className="mt-1.5 text-xs text-red-600">{pickErrors.media}</p>
                    ) : null}
                    <PickedFileInfo
                      file={mediaFile}
                      uploaded={Boolean(cachedSingle(uploadCache, "media", mediaFile))}
                    />
                  </div>
                  {form.media?.url ? (
                    <p className="text-xs text-gray-600">Current media: {form.media.url}</p>
                  ) : (
                    <p className="text-xs text-gray-500">No media selected yet.</p>
                  )}
                </div>
                {/* Preview WebM is featured-only — the homepage gallery
                    plays this small VP9 file instead of the full MP4 to
                    free decoder bandwidth across 12 looping cards. */}
                {form.featured ? (
                  <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        Preview WebM (gallery loop)
                      </label>
                      <p className="mb-2 text-xs text-gray-600">
                        File <span className="font-semibold">.webm</span> nén nhỏ (VP9 + Opus, không tiếng).
                        Trang chủ sẽ phát file này trong gallery 12 video.
                        Khuyến nghị: ≤ 3 MB, &lt; 12 s, 720p. Nếu để trống,
                        gallery fallback về file MP4 chính.
                      </p>
                      <input
                        key={`preview-${fileInputsKey}`}
                        type="file"
                        accept={ACCEPT.preview}
                        disabled={saving}
                        onChange={(event) => pickFile("preview", "preview", event)}
                      />
                      {pickErrors.preview ? (
                        <p className="mt-1.5 text-xs text-red-600">{pickErrors.preview}</p>
                      ) : null}
                    </div>
                    {previewFile ? (
                      <PickedFileInfo
                        file={previewFile}
                        uploaded={Boolean(cachedSingle(uploadCache, "preview", previewFile))}
                      />
                    ) : form.preview?.url ? (
                      <p className="text-xs text-gray-700">
                        Current preview: {form.preview.url}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Chưa có preview WebM — gallery sẽ phát file MP4 chính.
                      </p>
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Media images (multiple)
                  </label>
                  <ImageDropzone
                    files={mediaFiles}
                    onChange={changeMediaFiles}
                    existingCount={
                      Array.isArray(form.mediaList) ? form.mediaList.length : 0
                    }
                    uploadedFiles={uploadCache.images.map((entry) => entry.file)}
                    disabled={saving}
                  />
                </div>
              </div>
            )}

            <div className="space-y-3 rounded-xl border border-gray-200 p-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Thumbnail image</label>
                <input
                  key={`thumbnail-${fileInputsKey}`}
                  type="file"
                  accept={ACCEPT.image}
                  disabled={saving}
                  onChange={(event) => pickFile("thumbnail", "image", event)}
                />
                {pickErrors.thumbnail ? (
                  <p className="mt-1.5 text-xs text-red-600">{pickErrors.thumbnail}</p>
                ) : null}
                <PickedFileInfo
                  file={thumbnailFile}
                  uploaded={Boolean(cachedSingle(uploadCache, "thumbnail", thumbnailFile))}
                />
              </div>
              {form.thumbnail?.url ? (
                <p className="text-xs text-gray-600">Current thumbnail: {form.thumbnail.url}</p>
              ) : (
                <p className="text-xs text-gray-500">No thumbnail selected yet.</p>
              )}
            </div>
            </fieldset>

            {/* Full progress card in normal flow (it can be tall for a photo
                batch); the sticky bar below only carries a one-line summary
                + Huỷ so it never covers a phone screen. */}
            {uploadProgress ? (
              <UploadProgressCard
                progress={uploadProgress}
                onRetry={saving ? null : handleRetryUploads}
                keptCount={uploadCacheKeys(uploadCache).length}
                saveLabel={isEditing ? "Cập nhật" : "Tạo mới"}
              />
            ) : null}

            <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white/95 px-5 py-3 backdrop-blur">
              {saving && uploadProgress ? (
                <UploadProgressSummary progress={uploadProgress} onCancel={handleCancelUpload} />
              ) : null}
              {cancelNotice && !saving ? (
                <p className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  {cancelNotice}
                </p>
              ) : null}
              {savedNotice && !saving ? (
                <p
                  className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
                  aria-live="polite"
                >
                  {savedNotice}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Đang lưu..." : isEditing ? "Cập nhật" : "Tạo mới"}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirmDiscardUploads()) resetEditor();
                }}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Xoá form
              </button>

              {saving && !uploadProgress ? (
                <span className="text-xs text-gray-500" aria-live="polite">
                  Đang lưu thông tin…
                </span>
              ) : null}
            </div>
          </form>
        </motion.div>

        <motion.div layout className="rounded-2xl border border-gray-200 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{tabLabel}</h2>
              <p className="mt-1 text-xs text-gray-600">
                {listFilter
                  ? `${sortedFilteredItems.length} / ${items.length}`
                  : `Total: ${items.length}`}
                {reordering ? (
                  <span className="ml-2 text-amber-700">· đang lưu thứ tự...</span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <input
                type="search"
                value={listFilter}
                onChange={(event) => setListFilter(event.target.value)}
                placeholder="Tìm theo title, client, slug, category..."
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-black focus:outline-none sm:w-64"
              />
              <select
                value={listSort}
                onChange={(event) => setListSort(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-black focus:outline-none sm:w-44"
                aria-label="Sắp xếp danh sách"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {/* Mode-specific "+ Tạo mới" button. Sits in the list
                  toolbar where the user is already managing items, so
                  they don't need to scroll back up to the legacy top
                  row to add a new one. */}
              {!showSubTabs ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (!startCreate()) return;
                    if (typeof window !== "undefined") {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Tạo mới
                </button>
              ) : null}
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {listFilter || listSort !== "order"
              ? "Để bật kéo-thả / ↑↓ đổi thứ tự, chọn 'Thứ tự thủ công' và xoá bộ lọc."
              : "Kéo-thả thẻ hoặc dùng ↑/↓ để đổi thứ tự hiển thị trên trang công khai."}
          </p>

          {loadingItems ? (
            <p className="mt-4 text-sm text-gray-600">Loading...</p>
          ) : items.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">No items yet.</p>
          ) : sortedFilteredItems.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              Không có mục nào khớp với &quot;{listFilter}&quot;.
            </p>
          ) : (
            <motion.div layout className="mt-4 space-y-3">
              <AnimatePresence initial={false}>
                {sortedFilteredItems.map((item) => {
                  const thumbUrl = item.thumbnail?.url || item.media?.url;
                  const isCurrent = Number(editingId) === Number(item.id);
                  const cats = Array.isArray(item.categories) ? item.categories : [];
                  const sortIdx = items.findIndex(
                    (it) => Number(it.id) === Number(item.id)
                  );
                  const canReorder =
                    !listFilter && !reordering && listSort === "order";
                  const isDragging = dragId !== null && Number(dragId) === Number(item.id);
                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                      draggable={canReorder}
                      onDragStart={(event) => {
                        if (!canReorder) return;
                        setDragId(item.id);
                        event.dataTransfer.effectAllowed = "move";
                        try {
                          event.dataTransfer.setData("text/plain", String(item.id));
                        } catch {}
                      }}
                      onDragOver={(event) => {
                        if (!canReorder || dragId === null) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        if (!canReorder) return;
                        event.preventDefault();
                        handleDropOnto(item);
                      }}
                      onDragEnd={() => setDragId(null)}
                      className={`rounded-xl border p-3 text-sm text-gray-800 transition-colors ${
                        isCurrent
                          ? "border-black bg-gray-50"
                          : "border-gray-200"
                      } ${canReorder ? "cursor-grab active:cursor-grabbing" : ""} ${
                        isDragging ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex gap-3">
                        <div className="flex shrink-0 flex-col items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMove(item, -1)}
                            disabled={!canReorder || sortIdx <= 0}
                            title={
                              listFilter
                                ? "Xoá bộ lọc để sắp xếp"
                                : "Lên trên"
                            }
                            className="rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMove(item, 1)}
                            disabled={
                              !canReorder ||
                              sortIdx === -1 ||
                              sortIdx >= items.length - 1
                            }
                            title={
                              listFilter
                                ? "Xoá bộ lọc để sắp xếp"
                                : "Xuống dưới"
                            }
                            className="rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="Move down"
                          >
                            ↓
                          </button>
                        </div>
                        {thumbUrl ? (
                          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbUrl}
                              alt={item.title || "thumbnail"}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[10px] text-gray-400">
                            no media
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-semibold">
                                #{item.id} {item.title || "(No title)"}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-gray-600">
                                {item.client || "—"} · slug: {item.slug || "-"}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {item.featured ? (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                    ★ featured
                                  </span>
                                ) : null}
                                <StarRatingDisplay value={item.adminRating} />
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">
                                  order: {item.order ?? "-"}
                                </span>
                                {cats.slice(0, 3).map((cat) => (
                                  <span
                                    key={cat}
                                    className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700"
                                  >
                                    {cat}
                                  </span>
                                ))}
                                {cats.length > 3 ? (
                                  <span className="text-[10px] text-gray-500">
                                    +{cats.length - 3}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => startEdit(item)}
                                className="rounded-md border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => handleDelete(item.id)}
                                className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
