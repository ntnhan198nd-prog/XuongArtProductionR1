"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import FeaturedLayoutPanel from "@/components/admin/FeaturedLayoutPanel";
import ShowreelPanel from "@/components/admin/ShowreelPanel";
import AutocompleteInput from "@/components/admin/AutocompleteInput";
import { useToast, useToastAvoid } from "@/components/admin/ToastProvider";
import {
  ACCEPT,
  UploadError,
  captureVideoFrame,
  cleanupUploadedKeys,
  cleanupUploadedKeysOnUnload,
  formatBytes,
  formatClockDuration,
  formatDuration,
  formatUploadProgress,
  getFileMetadata,
  orientationFromSize,
  resolveContentType,
  runUploadQueue,
  uploadFile,
  validateUploadFile,
} from "@/lib/uploadClient";
import { fetchJson } from "@/lib/apiClient";

const TABS = [
  { key: "projects", label: "Dự án video" },
  { key: "image-projects", label: "Dự án ảnh" },
];

const EMPTY_FORM = {
  title: "",
  slug: "",
  client: "",
  tagline: "",
  // Chips picked in "Thể loại". The legacy single `category` field is not
  // edited directly: the stored value is kept while it is still among the
  // chips, else categories[0] is saved (see mainCategoryFor; the
  // /videos/<slug> page shows it above the title; both galleries filter on it).
  categories: [],
  category: "",
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

// Same rules as the server (lib/contentAdmin toSlug): "đ"/"Đ" do not
// decompose under NFD, so they are mapped to "d" first.
function slugify(value = "") {
  return String(value)
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Slug the public site falls back to for a record with an empty stored slug
// (lib/contentStore slugify: no "đ" mapping, so "Đà Lạt" → "a-lat"). Used to
// show / keep the live URL of such legacy records.
function publicSlugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Create-form defaults for the admin section: a video added from the
// "Trang chủ: Showreel & Nổi bật" section starts as featured.
function emptyFormFor(mode) {
  return { ...EMPTY_FORM, featured: mode === "showreel-featured" };
}

// Note added to the "saved" message when the saved video belongs to the
// other video section (so it is not in the list on screen).
function savedSectionNote(mode, savedItem) {
  if (!savedItem) return "";
  if (mode === "showreel-featured" && !savedItem.featured) {
    return "Video này chưa bật “Nổi bật” nên nằm ở thẻ Thư viện video.";
  }
  if (mode === "other-videos" && savedItem.featured) {
    return "Video này đã bật “Nổi bật” nên nằm ở thẻ Trang chủ: Showreel & Nổi bật.";
  }
  return "";
}

// --- Auto-fill from the picked video ----------------------------------------

// Patch putting back what orientation / duration held before a pick filled
// them: only for fields the owner did not touch and that still hold the
// auto-filled value. `base` = values before the first auto-fill (null when
// nothing was auto-filled yet).
function revertAutoFilledFields(form, autoFilled, base, touched) {
  const patch = {};
  if (!base) return patch;
  ["orientation", "duration"].forEach((field) => {
    if (touched?.[field]) return;
    const auto = autoFilled?.[field];
    if (!auto || form?.[field] !== auto) return;
    if (base[field] !== undefined && base[field] !== auto) patch[field] = base[field];
  });
  return patch;
}

// --- Categories ("Thể loại" chips) ------------------------------------------

// Trimmed, de-duplicated list (first spelling wins).
function cleanCategoryList(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((item) => {
    const text = String(item ?? "").replace(/\s+/g, " ").trim();
    if (text && !out.includes(text)) out.push(text);
  });
  return out;
}

// Selected chips for a stored record. A legacy single `category` that is not
// in `categories` is put FIRST so it is not silently dropped; the order of a
// list that already holds it is kept (the public cards show the chips in
// order) and mainCategoryFor keeps it as the saved main category.
function categoriesFromItem(item) {
  const list = cleanCategoryList(item?.categories);
  const legacy = String(item?.category ?? "").trim();
  if (legacy && !list.includes(legacy)) return [legacy, ...list];
  return list;
}

// Legacy single `category` to save: the stored one while it is still picked
// (an untouched edit then never changes what /videos/<slug> shows), else the
// first chip.
function mainCategoryFor(categories, storedCategory) {
  const list = cleanCategoryList(categories);
  const stored = String(storedCategory ?? "").trim();
  if (stored && list.includes(stored)) return stored;
  return list[0] || "";
}

function toggleCategory(selected, category) {
  const list = cleanCategoryList(selected);
  return list.includes(category)
    ? list.filter((item) => item !== category)
    : [...list, category];
}

// Add free text ("TVC, MV" adds both). A name matching a known category
// apart from upper/lower case reuses the known spelling: the public filter
// compares names exactly. Returns the same array when nothing was added.
function addCategories(selected, raw, known = []) {
  const list = cleanCategoryList(selected);
  let changed = false;
  String(raw ?? "")
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .forEach((text) => {
      const lower = text.toLowerCase();
      const name = (known || []).find((k) => String(k).toLowerCase() === lower) || text;
      if (list.some((item) => item.toLowerCase() === String(name).toLowerCase())) return;
      list.push(String(name));
      changed = true;
    });
  return changed ? list : selected;
}

// Chips to render: the base list, then selected names that are not in it.
function mergeChipList(base, selected) {
  return cleanCategoryList([...(base || []), ...(selected || [])]);
}

// Selected names the public filter cannot find. An empty / unknown public
// list means the gallery collects every category by itself → nothing missing.
function categoriesMissingFromFilter(selected, publicList) {
  if (!Array.isArray(publicList) || publicList.length === 0) return [];
  return cleanCategoryList(selected).filter((item) => !publicList.includes(item));
}

// Note shown after a save when the server had to change the slug.
function slugChangeNote(sentSlug, savedSlug, isVideo) {
  const sent = slugify(sentSlug);
  const saved = String(savedSlug || "");
  if (!sent || !saved || sent === saved) return "";
  return isVideo
    ? `Đường dẫn “${sent}” đã có video khác dùng nên được đổi thành xuongart.com/videos/${saved}.`
    : `Đường dẫn “${sent}” đã có mục khác dùng nên được đổi thành “${saved}”.`;
}

const ORIENTATION_LABELS = {
  landscape: "khung ngang",
  portrait: "khung dọc",
  square: "khung vuông",
};

function isVideoAsset(asset) {
  if (!asset) return false;
  if (String(asset.mime || "").startsWith("video/")) return true;
  return /\.(mp4|m4v|webm|mov|mkv)(\?|#|$)/i.test(String(asset.url || ""));
}

function baseInputClassName() {
  return "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-black focus:outline-none";
}

function FieldLabel({ htmlFor, children, badge }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex flex-wrap items-center gap-2 text-sm font-medium">
      <span>{children}</span>
      {badge ? (
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-normal text-emerald-700">
          {badge}
        </span>
      ) : null}
    </label>
  );
}

function FormSection({ title, hint, children }) {
  return (
    <section className="space-y-4 rounded-xl border border-gray-200 p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-gray-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

// File picker styled as a button. The real input stays focusable (sr-only)
// so keyboard users can still open it.
function FileButton({ children, accept, onChange, disabled = false, inputKey }) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus-within:ring-2 focus-within:ring-black/30 hover:bg-gray-50 ${
        disabled ? "pointer-events-none opacity-50" : ""
      }`}
    >
      {children}
      <input
        key={inputKey}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={onChange}
        className="sr-only"
      />
    </label>
  );
}

// "Đang dùng: clip.mp4 · 120 MB · 1 phút 05 giây" for a saved asset.
function StoredAssetLine({ asset, label = "Đang dùng" }) {
  if (!asset?.url) return null;
  const extra = [formatBytes(asset.size), formatDuration(asset.duration)].filter(Boolean);
  return (
    <p className="mt-2 break-all text-xs text-gray-600">
      {label}:{" "}
      <a
        href={asset.url}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-gray-900 underline hover:text-black"
      >
        {asset.name || "file đã lưu"}
      </a>
      {extra.length > 0 ? ` · ${extra.join(" · ")}` : ""}
    </p>
  );
}

const CHIP_BASE = "rounded-full border px-2.5 py-1 text-xs transition-colors";

// "Thể loại": the public filter list as toggle chips + free text.
//   publicList: site.portfolio.searchCategories / imageSearchCategories
//     (null while loading / when it could not be read).
//   fallback: categories already used by the items (chips when there is no
//     public list; also the autocomplete suggestions).
//   main: the chip saved as the main (legacy single) category.
function CategoryPicker({ value, onChange, publicList, fallback = [], mainHint = "", main = "" }) {
  const [draft, setDraft] = useState("");
  const selected = cleanCategoryList(value);
  const base = Array.isArray(publicList) && publicList.length > 0 ? publicList : fallback;
  const chips = mergeChipList(base, selected);
  const missing = categoriesMissingFromFilter(selected, publicList);
  const known = cleanCategoryList([...(publicList || []), ...fallback]);

  const addDraft = () => {
    const next = addCategories(selected, draft, known);
    if (next !== selected) onChange(next);
    setDraft("");
  };

  return (
    <div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((category) => {
            const on = selected.includes(category);
            const notInFilter = missing.includes(category);
            return (
              <button
                key={category}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(toggleCategory(selected, category))}
                className={`${CHIP_BASE} ${
                  on
                    ? notInFilter
                      ? "border-amber-400 bg-amber-100 text-amber-900"
                      : "border-black bg-black text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {on ? "✓ " : ""}
                {category}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500">Chưa có thể loại nào — gõ ở ô dưới để thêm.</p>
      )}

      {/* Enter adds the typed name (and must not submit the form). When the
          autocomplete picked a suggestion with Enter it already called
          preventDefault, so that Enter only fills the box. */}
      <div
        className="mt-2 flex gap-2"
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.defaultPrevented) return;
          event.preventDefault();
          addDraft();
        }}
      >
        <div className="min-w-0 flex-1">
          <AutocompleteInput
            value={draft}
            onChange={setDraft}
            suggestions={known}
            placeholder="Thêm thể loại khác"
            emptyHint="Chưa có thể loại nào được dùng trước đó."
          />
        </div>
        <button
          type="button"
          onClick={addDraft}
          disabled={!draft.trim()}
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Thêm
        </button>
      </div>

      {missing.length > 0 ? (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          “{missing.join("”, “")}”: Chưa có trong bộ lọc của trang công khai — thêm ở thẻ “Nội dung
          trang” › Bộ lọc thể loại.
        </p>
      ) : null}
      {mainHint && selected.length > 1 && (main || selected[0]) ? (
        <p className="mt-1.5 text-[11px] text-gray-500">
          “{main || selected[0]}” {mainHint}
        </p>
      ) : null}
    </div>
  );
}

// Small preview in the list: thumbnail, else a frame of the video, else the
// first photo.
function RowThumb({ item }) {
  const box = "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100";
  const thumbUrl = item?.thumbnail?.url || "";
  const first = Array.isArray(item?.media) ? item.media[0] : item?.media;
  const mediaUrl = first?.url || "";
  if (thumbUrl || (mediaUrl && !isVideoAsset(first))) {
    return (
      <div className={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl || mediaUrl}
          alt={item?.title || "ảnh thumbnail"}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  if (mediaUrl) {
    return (
      <div className={box}>
        <video
          src={`${mediaUrl}#t=0.5`}
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
      Chưa có ảnh
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload helpers (all R2 upload logic itself lives in lib/uploadClient.js)
// ---------------------------------------------------------------------------

// Above this size a video upload can take many minutes — warn the admin.
const LARGE_VIDEO_BYTES = 500 * 1024 * 1024;
const PHOTO_CONCURRENCY = 3;
// Max re-render rate of the progress card while bytes are flowing.
const PROGRESS_THROTTLE_MS = 250;
// Re-read the public category filters at most this often.
const PUBLIC_CATEGORIES_MIN_INTERVAL_MS = 5000;
// A save started while the thumbnail frame is still being captured waits
// this long for it (the capture itself gives up later on its own).
const CAPTURE_WAIT_MS = 8000;

// Resolves with `promise`'s value, or `fallback` after `ms`.
function withTimeLimit(promise, ms, fallback = null) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

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
          File lớn, tải lên có thể mất nhiều phút — giữ tab này mở.
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
    // Empty stored slug: show the URL the public site uses today.
    slug: item?.slug || publicSlugify(item?.title || ""),
    client: item?.client || "",
    tagline: item?.tagline || "",
    categories: categoriesFromItem(item),
    category: String(item?.category ?? "").trim(),
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

// --- Unsaved form edits -----------------------------------------------------

// Field-by-field comparison of two form states (toForm / emptyFormFor shape).
// Asset objects and category lists are compared by value.
function sameFormValues(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) {
    if (JSON.stringify(a?.[key] ?? null) !== JSON.stringify(b?.[key] ?? null)) return false;
  }
  return true;
}

// True while the form holds something that is not saved yet:
//   - a field that differs from `baseline` (toForm(original item) when
//     editing, emptyFormFor(mode) when creating),
//   - a picked file (`files`: single files and photos, falsy entries ignored),
//   - files already uploaded by a failed save (`uploadedCount`).
function isFormDirty({ form, baseline, files = [], uploadedCount = 0 } = {}) {
  if ((Array.isArray(files) ? files : []).some(Boolean)) return true;
  if (Number(uploadedCount) > 0) return true;
  return !sameFormValues(form, baseline);
}

// --- Manual order of the list on screen ---------------------------------------
// A panel shows only part of the stored list (e.g. "Video Khác" hides the
// featured videos), but the reorder API takes the order of EVERY item. These
// helpers move an item next to its neighbour in the list on screen and
// return the full array to send (null = nothing to do).

function sameId(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return Number(a) === Number(b);
}

// Full list with `movingId` taken out and put right before / after
// `anchorId` (`placement`: "before" | "after").
function moveNextTo(allItems, movingId, anchorId, placement) {
  const list = Array.isArray(allItems) ? allItems : [];
  if (sameId(movingId, anchorId)) return null;
  const from = list.findIndex((item) => sameId(item?.id, movingId));
  if (from < 0) return null;
  const rest = list.filter((_, index) => index !== from);
  const anchor = rest.findIndex((item) => sameId(item?.id, anchorId));
  if (anchor < 0) return null;
  const at = placement === "after" ? anchor + 1 : anchor;
  const next = [...rest.slice(0, at), list[from], ...rest.slice(at)];
  return next.every((item, index) => item === list[index]) ? null : next;
}

// Position of an item in the list on screen: { index (0-based, -1 when not
// shown), total }. ↑ is off for index 0, ↓ for the last row.
function visiblePosition(visibleItems, itemId) {
  const visible = Array.isArray(visibleItems) ? visibleItems : [];
  return {
    index: visible.findIndex((item) => sameId(item?.id, itemId)),
    total: visible.length,
  };
}

// A move on screen as { movingId, anchorId, placement } (null = nothing to
// do). Kept apart from the full array so a "Thử lại" can apply the SAME move
// to whatever the list holds by then (applyMove), never an old full order.
//   ↑ (direction -1) / ↓ (+1): past the neighbour on screen.
function visibleMoveFor(visibleItems, itemId, direction) {
  const visible = Array.isArray(visibleItems) ? visibleItems : [];
  const { index } = visiblePosition(visible, itemId);
  if (index < 0) return null;
  const up = Number(direction) < 0;
  const neighbour = visible[index + (up ? -1 : 1)];
  if (!neighbour) return null;
  return { movingId: itemId, anchorId: neighbour.id, placement: up ? "before" : "after" };
}

// Drag-and-drop on screen: dropped on a row further down → lands after it,
// further up → lands before it (the dropped-on row moves one step aside).
function visibleDropFor(visibleItems, dragId, targetId) {
  const from = visiblePosition(visibleItems, dragId).index;
  const to = visiblePosition(visibleItems, targetId).index;
  if (from < 0 || to < 0 || from === to) return null;
  return { movingId: dragId, anchorId: targetId, placement: from < to ? "after" : "before" };
}

// Key of a row's ↑ (direction < 0) / ↓ button in the panel's button map.
function arrowKey(id, direction) {
  return `${Number(id)}:${Number(direction) < 0 ? "up" : "down"}`;
}

// Full list after `move` (null when it no longer applies / changes nothing).
function applyMove(allItems, move) {
  if (!move) return null;
  return moveNextTo(allItems, move.movingId, move.anchorId, move.placement);
}

function moveWithinVisible(allItems, visibleItems, itemId, direction) {
  return applyMove(allItems, visibleMoveFor(visibleItems, itemId, direction));
}

function dropWithinVisible(allItems, visibleItems, dragId, targetId) {
  return applyMove(allItems, visibleDropFor(visibleItems, dragId, targetId));
}

// --- Links to the public site -------------------------------------------------

// Where a record can be seen on the public site: { href, title, toastLabel }
// or null (a video without a stored slug has no page yet). A featured video
// seen from the "Trang chủ: Showreel & Nổi bật" section links to the homepage
// grid it plays in.
function publicLinkFor(item, { isVideo, mode } = {}) {
  if (!item) return null;
  if (!isVideo) {
    return { href: "/images", title: "Xem trên trang Ảnh", toastLabel: "Xem trang Ảnh ↗" };
  }
  if (mode === "showreel-featured" && item.featured) {
    return { href: "/", title: "Xem trên trang chủ", toastLabel: "Xem trang chủ ↗" };
  }
  const slug = String(item.slug || "").trim();
  if (!slug) return null;
  return {
    href: `/videos/${encodeURIComponent(slug)}`,
    title: "Xem trang chi tiết video",
    toastLabel: "Xem trên trang ↗",
  };
}

// Options for toast.error from an API / upload error: hint, a retry button
// when `retry` is given, and the R2 check link for server / network errors
// (an expired login offers a page reload instead).
function errorToastOptions(err, retry) {
  const status = err?.status ?? null;
  const opts = { hint: err?.hint || "" };
  if (typeof retry === "function") {
    opts.actionLabel = "Thử lại";
    opts.onAction = retry;
  }
  if (status === 401) {
    // Expired login: a reload would throw away the form. Same handling as
    // the content panel — log in again in a new tab, then retry here.
    opts.hint = "Phiên đăng nhập đã hết hạn. Đăng nhập ở tab mới rồi quay lại bấm “Thử lại” — dữ liệu trong form vẫn còn.";
    opts.href = "/admin";
    opts.hrefLabel = "Đăng nhập lại ở tab mới ↗";
    return opts;
  }
  if (status === null || status === undefined || status === 0 || status >= 500) {
    opts.href = "/api/admin/health";
    opts.hrefLabel = "Kiểm tra kết nối R2 ↗";
  }
  return opts;
}

function isCoarsePointer() {
  try {
    return Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
  } catch {
    return false;
  }
}

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
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
// `active` (optional boolean) = this section is the visible admin tab. When
// it turns true again the list is re-read, since another section may have
// changed the same records meanwhile.
// `onDirtyChange(dirty)` (optional) is true while the form has unsaved edits
// or picked / uploaded-but-unsaved files, the featured layout has an unsaved
// arrangement, or a save is running.
export default function ProjectsAdminPanel({ mode, onBusyChange, active, onDirtyChange } = {}) {
  const toast = useToast();
  // Keep phone toasts from covering the form's sticky save bar.
  const saveBarRef = useRef(null);
  useToastAvoid(saveBarRef, active !== false);
  // Async callbacks read the latest toast API through this ref.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  // notify("success" | "error" | "info", message, opts) — never throws, also
  // when the panel is rendered without a ToastProvider.
  // Returns the toast id (null when none was shown).
  const notify = useCallback((kind, message, opts) => {
    const api = toastRef.current;
    return api && typeof api[kind] === "function" ? api[kind](message, opts) ?? null : null;
  }, []);
  // Error toasts stay until closed. The last save / reorder failure is
  // remembered so the next attempt (or a new form) closes it: its "Thử lại"
  // must never act on a different record or on a later order.
  const saveErrorToastRef = useRef(null);
  const reorderErrorToastRef = useRef(null);
  const dismissToast = useCallback((holder) => {
    if (holder.current !== null && holder.current !== undefined) {
      toastRef.current?.dismiss?.(holder.current);
    }
    holder.current = null;
  }, []);
  // Bumped whenever the form is replaced (new / other record / cleared): a
  // save retry captured for an older form does nothing.
  const formGenRef = useRef(0);
  // Bumped by every reorder: a retry of an older failed move does nothing.
  const orderGenRef = useRef(0);
  // Element ids are prefixed per instance: three panels can be mounted at
  // once (hidden), and getElementById must find THIS panel's fields.
  const uid = useId().replace(/:/g, "");
  const fieldId = (name) => `${uid}-${name}`;
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
  const [form, setForm] = useState(() => emptyFormFor(mode));
  // What the form was opened with (toForm(item) / emptyFormFor(mode)): the
  // form is "dirty" while it differs from this (see isFormDirty).
  const [formBaseline, setFormBaseline] = useState(() => emptyFormFor(mode));
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);

  // --- Form helpers: auto-fill, slug, categories, validation --------------
  // Slug follows the title on create until the owner edits the slug box.
  const [slugTouched, setSlugTouched] = useState(false);
  // Values the last picked video filled in ({ orientation, duration }); the
  // "tự điền từ video" badges are shown while the field still holds them.
  const [autoFilled, setAutoFilled] = useState({ orientation: null, duration: null });
  const autoFilledRef = useRef({ orientation: null, duration: null });
  // What orientation / duration held before the first auto-fill of this
  // form (null = nothing auto-filled yet): restored when the picked video
  // is removed or replaced by one that gives no value.
  const autoFillBaseRef = useRef(null);
  // Fields the owner typed in: auto-fill never overwrites them.
  const touchedRef = useRef({ orientation: false, duration: false });
  // JPEG frame captured from the picked video (null when none / failed).
  const [autoThumbFile, setAutoThumbFile] = useState(null);
  const [capturingThumb, setCapturingThumb] = useState(false);
  // Running frame capture (resolves to the frame it set as thumbnail, or
  // null); a save started meanwhile waits for it briefly.
  const capturePromiseRef = useRef(null);
  const [waitingThumb, setWaitingThumb] = useState(false);
  // Bumped on every main-file pick / form reset: a metadata read or frame
  // capture that finishes later for an older pick is ignored.
  const mediaPickTokenRef = useRef(0);
  // Mirrors read by those async callbacks.
  const thumbnailFileRef = useRef(null);
  const autoThumbRef = useRef(null);
  const storedThumbRef = useRef(null);
  const thumbnailInputRef = useRef(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Blocking problems found when pressing save: { title, media }.
  const [formErrors, setFormErrors] = useState({});
  // Public filter lists from site content (read once, never written here).
  // null = still loading or could not be read.
  const [publicCategories, setPublicCategories] = useState(null);
  // In-row delete confirmation.
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // Failed delete, shown inside that row's confirmation: { id, message, hint }.
  const [deleteError, setDeleteError] = useState(null);
  // Row "Xoá" buttons (focus goes back there when the confirmation closes)
  // and the open confirmation's "Huỷ" button (focused when it opens).
  const deleteButtonRefs = useRef(new Map());
  const confirmCancelRef = useRef(null);
  // Root element: used to notice when the (kept-mounted) panel is shown again.
  const rootRef = useRef(null);
  // Editor card: scrolled into view by "Sửa" / "+ Tạo mới" (on phones the
  // list comes first, so the form is further down).
  const formCardRef = useRef(null);
  // Background re-read of the list (no "Đang tải…" placeholder).
  const [refreshing, setRefreshing] = useState(false);
  // Shown when this section became visible again while the form had unsaved
  // edits (or a save was running), so the list was not re-read on its own.
  const [staleNotice, setStaleNotice] = useState(false);
  // Unsaved arrangement in FeaturedLayoutPanel.
  const [layoutDirty, setLayoutDirty] = useState(false);

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
  // Short red line in the save bar after a failed save (the toast has the
  // details and "Thử lại"; this one stays visible once the toast is closed).
  const [saveFailedText, setSaveFailedText] = useState("");
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

  const isVideoTab = tab === "projects";
  const listTitle =
    mode === "showreel-featured"
      ? "Video nổi bật"
      : mode === "other-videos"
      ? "Video trong thư viện (không nổi bật)"
      : TABS.find((item) => item.key === tab)?.label || tab;
  const createLabel = isVideoTab ? "Thêm video mới" : "Thêm dự án ảnh mới";

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

  useEffect(() => {
    thumbnailFileRef.current = thumbnailFile;
  }, [thumbnailFile]);
  useEffect(() => {
    autoThumbRef.current = autoThumbFile;
  }, [autoThumbFile]);
  useEffect(() => {
    storedThumbRef.current = form.thumbnail;
  }, [form.thumbnail]);

  // Public category filters (Nội dung trang › Bộ lọc). Read on mount and
  // again whenever the form is (re)started or the panel is shown again
  // (the admin shell keeps visited sections mounted, just hidden), so a
  // filter added in "Nội dung trang" is picked up. Never written here. A
  // failure is silent: the chips then fall back to categories in use.
  const aliveRef = useRef(true);
  const categoriesLoadRef = useRef({ at: 0, seq: 0 });
  const loadPublicCategories = useCallback(({ force = false } = {}) => {
    const state = categoriesLoadRef.current;
    const now = Date.now();
    if (!force && now - state.at < PUBLIC_CATEGORIES_MIN_INTERVAL_MS) return;
    state.at = now;
    state.seq += 1;
    const seq = state.seq;
    const clean = (list) =>
      Array.isArray(list) ? cleanCategoryList(list.filter((item) => typeof item === "string")) : [];
    fetchJson(
      "/api/admin/site-content",
      { cache: "no-store" },
      { fallbackError: "Không đọc được bộ lọc thể loại" }
    )
      .then((payload) => {
        if (!aliveRef.current || categoriesLoadRef.current.seq !== seq) return;
        const portfolio = payload?.data?.portfolio || {};
        setPublicCategories({
          videos: clean(portfolio.searchCategories),
          images: clean(portfolio.imageSearchCategories),
        });
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    aliveRef.current = true;
    loadPublicCategories({ force: true });
    return () => {
      aliveRef.current = false;
    };
  }, [loadPublicCategories]);
  // Shown again after being hidden (other admin section, other browser tab).
  useEffect(() => {
    const node = rootRef.current;
    let wasVisible = true;
    let observer = null;
    if (node && typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver((entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible && !wasVisible) loadPublicCategories();
        wasVisible = visible;
      });
      observer.observe(node);
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadPublicCategories();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadPublicCategories]);

  // Delete confirmation opened, or a delete failed: put the keyboard focus
  // on its "Huỷ" button.
  useEffect(() => {
    if (confirmDeleteId === null) return;
    confirmCancelRef.current?.focus?.();
  }, [confirmDeleteId, deleteError]);

  // Preview of the picked thumbnail (object URL revoked when it changes).
  const thumbnailPreviewUrl = useMemo(
    () => (thumbnailFile ? URL.createObjectURL(thumbnailFile) : ""),
    [thumbnailFile]
  );
  useEffect(
    () => () => {
      if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
    },
    [thumbnailPreviewUrl]
  );

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

  // Unsaved form edits (fields, picked files, uploads of a failed save).
  const formDirty = isFormDirty({
    form,
    baseline: formBaseline,
    files: [mediaFile, previewFile, thumbnailFile, ...mediaFiles],
    uploadedCount: uploadCacheKeys(uploadCache).length,
  });
  const panelDirty = formDirty || layoutDirty || saving;
  // Read when the section becomes visible again (see the `active` effect).
  const keepListRef = useRef(false);
  useEffect(() => {
    // Re-reading the list now could disturb running work or an unsaved
    // layout arrangement: offer it in a banner instead.
    keepListRef.current = formDirty || layoutDirty || saving || reordering || deletingId !== null;
  }, [formDirty, layoutDirty, saving, reordering, deletingId]);
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    if (typeof onDirtyChangeRef.current === "function") onDirtyChangeRef.current(panelDirty);
  }, [panelDirty]);
  useEffect(
    () => () => {
      if (typeof onDirtyChangeRef.current === "function") onDirtyChangeRef.current(false);
    },
    []
  );

  const resetUploadUi = () => {
    setUploadProgress(null);
    setPickErrors({});
    setCancelNotice("");
    setSavedNotice("");
    setSaveFailedText("");
    setFileInputsKey((value) => value + 1);
  };

  // Forget auto-fill / slug / validation state of the previous form.
  const resetFormHelpers = () => {
    mediaPickTokenRef.current += 1;
    touchedRef.current = { orientation: false, duration: false };
    thumbnailFileRef.current = null;
    autoThumbRef.current = null;
    autoFillBaseRef.current = null;
    autoFilledRef.current = { orientation: null, duration: null };
    capturePromiseRef.current = null;
    setAutoFilled({ orientation: null, duration: null });
    setAutoThumbFile(null);
    setCapturingThumb(false);
    setSlugTouched(false);
    setFormErrors({});
  };

  const resetEditor = () => {
    formGenRef.current += 1;
    dismissToast(saveErrorToastRef);
    discardUploadCache();
    setEditingId(null);
    const empty = emptyFormFor(mode);
    setForm(empty);
    setFormBaseline(empty);
    setMediaFile(null);
    setMediaFiles([]);
    setPreviewFile(null);
    setThumbnailFile(null);
    resetFormHelpers();
    resetUploadUi();
  };

  // Leaving the form (new / clear / edit another / switch tab) loses unsaved
  // edits and deletes files uploaded by a failed save — ask first, with ONE
  // confirm covering both.
  const confirmLeaveForm = () => {
    const hasUploads = uploadCacheKeys(uploadCacheRef.current).length > 0;
    if (!hasUploads && !formDirty) return true;
    const question = "Bạn có thay đổi chưa lưu ở form. Bỏ các thay đổi này?";
    return window.confirm(
      hasUploads ? `${question}\n\nCác file đã tải lên (chưa lưu) cũng sẽ bị xoá.` : question
    );
  };

  // Bring the editor into view and put the cursor in "Tiêu đề" (on phones
  // the list is shown above the form). No scroll when the top of the form
  // is already on screen (desktop, side by side).
  const revealForm = () => {
    const run = () => {
      const card = formCardRef.current;
      const top = card?.getBoundingClientRect?.().top;
      const onScreen =
        typeof top === "number" && top >= 0 && top < (window.innerHeight || 0) * 0.4;
      if (card && !onScreen) {
        card.scrollIntoView?.({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "start",
        });
      }
      // Touch screens: focusing would pop up the keyboard and the title
      // suggestions over the form the owner only wanted to look at.
      if (!isCoarsePointer()) {
        document.getElementById(fieldId("project-title"))?.focus?.({ preventScroll: true });
      }
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
    else run();
  };

  const SLOT_SETTERS = {
    media: setMediaFile,
    preview: setPreviewFile,
    thumbnail: setThumbnailFile,
  };

  // Put a file in a single-file slot. If the slot's file changes, delete the
  // copy an earlier failed save already uploaded for it.
  const setSlotFile = (slot, next) => {
    if (slot === "thumbnail") thumbnailFileRef.current = next;
    const cached = uploadCacheRef.current[slot];
    if (cached && !isSameFile(cached.file, next)) forgetCachedKeys([cached.asset.key]);
    SLOT_SETTERS[slot](next);
  };

  const setAutoFilledState = (next) => {
    autoFilledRef.current = next;
    setAutoFilled(next);
  };

  const setAutoThumb = (file) => {
    autoThumbRef.current = file;
    setAutoThumbFile(file);
  };

  // Main file picked (or cleared): read its size / duration right away and
  // fill orientation + duration unless the owner typed them; for a video
  // with no thumbnail yet, capture a frame as the thumbnail.
  const applyMediaAutoFill = (file) => {
    const token = mediaPickTokenRef.current + 1;
    mediaPickTokenRef.current = token;
    // A frame captured from the previous video no longer fits.
    const previousAuto = autoThumbRef.current;
    if (previousAuto) {
      if (thumbnailFileRef.current === previousAuto) setSlotFile("thumbnail", null);
      setAutoThumb(null);
    }
    setCapturingThumb(false);
    capturePromiseRef.current = null;
    // Values the previous pick filled in no longer apply: put back what the
    // untouched fields held before, and drop the "tự điền" notes.
    const previousFilled = autoFilledRef.current;
    const base = autoFillBaseRef.current;
    setForm((prev) => {
      const patch = revertAutoFilledFields(prev, previousFilled, base, touchedRef.current);
      return Object.keys(patch).length > 0 ? { ...prev, ...patch } : prev;
    });
    setAutoFilledState({ orientation: null, duration: null });
    if (!file) return;

    getFileMetadata(file)
      .then((meta) => {
        if (mediaPickTokenRef.current !== token) return;
        const applied = {};
        const orientation = orientationFromSize(meta?.width, meta?.height);
        if (orientation && !touchedRef.current.orientation) applied.orientation = orientation;
        const duration = isVideoFile(file) ? formatClockDuration(meta?.duration) : "";
        if (duration && !touchedRef.current.duration) applied.duration = duration;
        if (Object.keys(applied).length === 0) return;
        setForm((prev) => {
          // Remember the values from before the first auto-fill (idempotent,
          // so a double-invoked updater is harmless).
          if (!autoFillBaseRef.current) {
            autoFillBaseRef.current = { orientation: prev.orientation, duration: prev.duration };
          }
          return { ...prev, ...applied };
        });
        setAutoFilledState({
          orientation: applied.orientation || null,
          duration: applied.duration || null,
        });
      })
      .catch(() => {});

    if (!isVideoFile(file) || thumbnailFileRef.current || storedThumbRef.current?.url) return;
    setCapturingThumb(true);
    const capture = captureVideoFrame(file)
      .then((frame) => {
        if (mediaPickTokenRef.current !== token) return null;
        setCapturingThumb(false);
        if (capturePromiseRef.current === capture) capturePromiseRef.current = null;
        // Nothing to say when the browser could not read a frame. The owner
        // may also have picked a thumbnail while the frame was captured.
        if (!frame || thumbnailFileRef.current || storedThumbRef.current?.url) return null;
        setAutoThumb(frame);
        setSlotFile("thumbnail", frame);
        return frame;
      })
      .catch(() => {
        if (mediaPickTokenRef.current === token) {
          setCapturingThumb(false);
          if (capturePromiseRef.current === capture) capturePromiseRef.current = null;
        }
        return null;
      });
    capturePromiseRef.current = capture;
  };

  // Single-file inputs: validate the type, then fill the slot. The input is
  // emptied right away so picking the same file again still fires. A wrong
  // type keeps the previous choice and shows why next to the button.
  const pickFile = (slot, kind, event) => {
    const picked = event.target.files?.[0] || null;
    event.target.value = "";
    if (!picked) return;
    const problem = validateUploadFile(picked, { kind }) || "";
    setPickErrors((prev) => ({ ...prev, [slot]: problem }));
    if (problem) return;
    setSlotFile(slot, picked);
    if (slot === "media") {
      setFormErrors((prev) => (prev.media ? { ...prev, media: "" } : prev));
      applyMediaAutoFill(picked);
    }
  };

  const clearSlot = (slot) => {
    setPickErrors((prev) => ({ ...prev, [slot]: "" }));
    setSlotFile(slot, null);
    if (slot === "media") applyMediaAutoFill(null);
  };

  const markTouched = (field) => {
    touchedRef.current = { ...touchedRef.current, [field]: true };
  };

  // Create: the slug follows the title until the owner edits the slug box.
  const slugFollowsTitle = !isEditing && !slugTouched;
  const handleTitleChange = (value) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: slugFollowsTitle ? slugify(value) : prev.slug,
    }));
    if (formErrors.title && String(value).trim()) {
      setFormErrors((prev) => ({ ...prev, title: "" }));
    }
  };
  const handleSlugChange = (value) => {
    setForm((prev) => ({ ...prev, slug: value }));
    // Emptying the box hands the slug back to the title.
    setSlugTouched(String(value).trim() !== "");
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
  // `background`: re-read while a list is already shown — no "Đang tải…"
  // placeholder, and a failure keeps the list on screen (the banner explains).
  // Only the most recent request updates the list.
  const loadSeqRef = useRef(0);
  // Latest syncEditorWithList (defined below), run after every fresh list.
  const editorSyncRef = useRef(null);
  const loadItems = useCallback(async (targetTab, { background = false } = {}) => {
    loadSeqRef.current += 1;
    const seq = loadSeqRef.current;
    const setBusyFlag = background ? setRefreshing : setLoadingItems;
    setBusyFlag(true);
    try {
      const payload = await fetchJson(
        `/api/admin/${targetTab}`,
        { cache: "no-store" },
        { fallbackError: "Không tải được danh sách" }
      );
      const list = Array.isArray(payload.data) ? payload.data : [];
      if (loadSeqRef.current === seq) {
        itemsRef.current = list;
        setItems(list);
        setError("");
        setErrorHint("");
        setErrorStatus(null);
        setStaleNotice(false);
        editorSyncRef.current?.(list);
      }
      return list;
    } catch (loadError) {
      if (loadSeqRef.current === seq) {
        setError(loadError.message);
        setErrorHint(loadError.hint || "");
        setErrorStatus(loadError.status ?? null);
        if (!background) setItems([]);
      }
      return null;
    } finally {
      setBusyFlag(false);
    }
  }, []);

  useEffect(() => {
    loadItems(tab);
  }, [tab, loadItems]);

  // Section shown again (admin tab switched back): re-read the list — a
  // save / delete / reorder in another section may have changed it. While
  // the form has unsaved edits or work is running, offer it instead.
  const wasActiveRef = useRef(active);
  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = active;
    if (active !== true || wasActive !== false) return;
    loadPublicCategories();
    if (keepListRef.current) {
      setStaleNotice(true);
      return;
    }
    loadItems(tab, { background: true });
  }, [active, tab, loadItems, loadPublicCategories]);

  // A fresh list arrived while a record is open WITHOUT unsaved edits: show
  // that record as now stored (another section may have changed it), so the
  // next "Cập nhật" does not send old values back. A record that is gone
  // closes the form. A form with unsaved edits is left alone (the stale
  // banner covers it), and nothing happens while saving / deleting.
  const syncEditorWithList = (list) => {
    if (editingId === null || formDirty || saving || savingRecordRef.current) return;
    if (deletingId !== null) return;
    const fresh = (Array.isArray(list) ? list : []).find((it) => sameId(it?.id, editingId));
    if (!fresh) {
      const title = formBaseline?.title || "(Chưa có tiêu đề)";
      resetEditor();
      notify("info", `“${title}” không còn nữa (có thể đã bị xoá ở thẻ khác) — đã đóng form sửa.`);
      return;
    }
    const opened = toForm(fresh, tab);
    if (sameFormValues(opened, formBaseline)) return;
    setForm(opened);
    setFormBaseline(opened);
  };
  useEffect(() => {
    editorSyncRef.current = syncEditorWithList;
  });

  // Returns false when the admin chose to keep the unsaved form.
  const startCreate = () => {
    if (!confirmLeaveForm()) return false;
    resetEditor();
    loadPublicCategories();
    revealForm();
    return true;
  };

  const startEdit = (item) => {
    // The record being edited, with unsaved edits: just bring the form back.
    if (sameId(editingId, item.id) && formDirty) {
      revealForm();
      return;
    }
    if (!confirmLeaveForm()) return;
    formGenRef.current += 1;
    dismissToast(saveErrorToastRef);
    discardUploadCache();
    setEditingId(item.id);
    const opened = toForm(item, tab);
    setForm(opened);
    setFormBaseline(opened);
    setMediaFile(null);
    setMediaFiles([]);
    setPreviewFile(null);
    setThumbnailFile(null);
    resetFormHelpers();
    resetUploadUi();
    loadPublicCategories();
    revealForm();
  };

  // Persist a new ordering of `items` to the server. Called by both the
  // ↑/↓ buttons and drag-and-drop. Optimistic: updates local state first,
  // then reloads on failure so the UI matches the source of truth.
  // Set synchronously so a retry from a toast cannot overlap a running save.
  const reorderingRef = useRef(false);
  const persistOrderRef = useRef(null);
  const persistOrder = useCallback(
    async (nextItems, move = null) => {
      if (reorderingRef.current) return;
      reorderingRef.current = true;
      orderGenRef.current += 1;
      const gen = orderGenRef.current;
      dismissToast(reorderErrorToastRef);
      const orderedIds = nextItems.map((it) => it.id);
      const previous = itemsRef.current;
      const reordered = nextItems.map((it, i) => ({ ...it, order: i + 1 }));
      // A list read still in flight must not overwrite the new order.
      loadSeqRef.current += 1;
      setItems(reordered);
      setReordering(true);
      try {
        const result = await fetchJson(
          `/api/admin/${tab}/reorder`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedIds }),
          },
          { fallbackError: "Lưu thứ tự thất bại" }
        );
        // The projects reorder route returns the saved list: a reorder may
        // also re-flow featured grid pins (`featuredSlot`), which the
        // optimistic update above cannot know about. Adopt the server
        // state so FeaturedLayoutPanel's preview stays in sync.
        if (Array.isArray(result?.data)) {
          itemsRef.current = result.data;
          setItems(result.data);
        }
        notify("success", "Đã lưu thứ tự");
      } catch (reorderError) {
        // Put the list back as stored (or as it was, when even the reload
        // fails), then report. "Thử lại" redoes the same MOVE on the list as
        // it is when pressed — and nothing once another reorder ran.
        const reloaded = await loadItems(tab, { background: true });
        if (!reloaded) {
          itemsRef.current = previous;
          setItems(previous);
        }
        const retry = move
          ? () => {
              if (orderGenRef.current !== gen) return;
              if (reorderBlockedRef.current) {
                notify("info", "Tải lại danh sách trước khi sắp xếp.");
                return;
              }
              const next = applyMove(itemsRef.current, move);
              if (next) persistOrderRef.current?.(next, move);
            }
          : null;
        reorderErrorToastRef.current = notify(
          "error",
          reorderError?.message || "Lưu thứ tự thất bại.",
          errorToastOptions(reorderError, retry)
        );
      } finally {
        reorderingRef.current = false;
        setReordering(false);
      }
    },
    [tab, loadItems, notify, dismissToast]
  );
  useEffect(() => {
    persistOrderRef.current = persistOrder;
  }, [persistOrder]);

  // ↑/↓ and drag-and-drop work on the list ON SCREEN (e.g. "Video Khác"
  // hides the featured videos): the item moves past its visible neighbour
  // and the full order is rebuilt around it (see moveWithinVisible).
  // The reorder API rewrites the WHOLE order from this panel's list, so a
  // list that may be out of date (being re-read, or the "đã đổi ở tab khác"
  // banner is up) must not be reordered: it would undo changes made elsewhere.
  const reorderBlocked = refreshing || loadingItems || staleNotice;
  const reorderBlockedRef = useRef(reorderBlocked);
  useEffect(() => {
    reorderBlockedRef.current = reorderBlocked;
  }, [reorderBlocked]);
  const canReorderList = !listFilter && !reordering && !reorderBlocked && listSort === "order";

  // ↑/↓ buttons by `${id}:up|down`, and the one pressed with the keyboard
  // focus on it: the buttons are disabled while the order saves (focus would
  // fall to the page), so focus goes back to it afterwards.
  const arrowButtonRefs = useRef(new Map());
  const arrowFocusRef = useRef(null);
  useEffect(() => {
    const pending = arrowFocusRef.current;
    if (!pending || reordering) return;
    arrowFocusRef.current = null;
    if (!canReorderList) return;
    const map = arrowButtonRefs.current;
    const same = map.get(arrowKey(pending.id, pending.direction));
    const other = map.get(arrowKey(pending.id, -pending.direction));
    const target = same && !same.disabled ? same : other && !other.disabled ? other : null;
    target?.focus?.();
  }, [reordering, canReorderList]);

  const handleMove = (item, direction, event) => {
    if (!canReorderList) return;
    const move = visibleMoveFor(sortedFilteredItems, item.id, direction);
    const next = applyMove(items, move);
    if (!next) return;
    const button = event?.currentTarget;
    arrowFocusRef.current =
      button && typeof document !== "undefined" && document.activeElement === button
        ? { id: item.id, direction: Number(direction) < 0 ? -1 : 1 }
        : null;
    persistOrder(next, move);
  };

  const handleDropOnto = (targetItem) => {
    if (!canReorderList || dragId === null) return;
    const move = visibleDropFor(sortedFilteredItems, dragId, targetItem.id);
    const next = applyMove(items, move);
    setDragId(null);
    if (next) persistOrder(next, move);
  };

  // Called from the in-row confirmation ("Xoá “…” (#id)? … [Huỷ] [Xoá]").
  const openDeleteConfirm = (id) => {
    setDeleteError(null);
    setConfirmDeleteId(id);
  };

  // Close the confirmation and give focus back to the row's "Xoá" button.
  const closeDeleteConfirm = (id) => {
    setConfirmDeleteId(null);
    setDeleteError(null);
    const button = deleteButtonRefs.current.get(Number(id));
    if (button) setTimeout(() => button.focus?.(), 0);
  };

  const handleDelete = async (id) => {
    if (deletingId !== null) return;
    const deletedTitle =
      items.find((item) => sameId(item?.id, id))?.title || "(Chưa có tiêu đề)";
    setDeletingId(id);
    setDeleteError(null);
    try {
      // Bare async click handler: without try/catch an empty/non-JSON error
      // body used to reject silently — no message, list never refreshed,
      // the row appeared to "do nothing".
      await fetchJson(
        `/api/admin/${tab}/${id}`,
        { method: "DELETE" },
        { fallbackError: "Xoá thất bại" }
      );
      setConfirmDeleteId(null);
      if (Number(editingId) === Number(id)) {
        resetEditor();
      }
      // Gone from the list right away, also when the re-read below fails.
      loadSeqRef.current += 1;
      itemsRef.current = itemsRef.current.filter((it) => !sameId(it?.id, id));
      setItems((prev) => prev.filter((it) => !sameId(it?.id, id)));
      notify("success", `Đã xoá “${deletedTitle}”`);
      // loadItems never throws (it shows its own error).
      await loadItems(tab, { background: true });
    } catch (deleteError) {
      // The confirmation stays open so the owner can retry or cancel; the
      // reason (and the R2 check link for server errors) is shown inside it.
      setDeleteError({
        id,
        message: deleteError?.message || "Xoá thất bại.",
        hint: deleteError?.hint || "",
        status: deleteError?.status ?? null,
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async (event) => {
    event?.preventDefault?.();
    if (saving) return;
    dismissToast(saveErrorToastRef);
    setSaveFailedText("");

    // Blocking checks first (shown next to the fields).
    const problems = {};
    if (!String(form.title || "").trim()) problems.title = "Cần nhập tiêu đề.";
    if (isVideoTab && !isEditing && !mediaFile) {
      problems.media = "Cần chọn file video chính trước khi lưu.";
    }
    setFormErrors(problems);
    if (problems.media || problems.title) {
      const target = document.getElementById(
        fieldId(problems.media ? "field-media" : "field-title")
      );
      target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      if (!problems.media) {
        document.getElementById(fieldId("project-title"))?.focus?.({ preventScroll: true });
      }
      return;
    }

    setSaving(true);
    setCancelNotice("");
    setSavedNotice("");

    // The frame for the automatic thumbnail is still being captured: wait
    // for it briefly so the video is not saved without one.
    let thumbnailForSave = thumbnailFile;
    const pendingCapture = capturePromiseRef.current;
    if (isVideoTab && !thumbnailForSave && !form.thumbnail?.url && pendingCapture) {
      setWaitingThumb(true);
      const frame = await withTimeLimit(pendingCapture, CAPTURE_WAIT_MS, null);
      setWaitingThumb(false);
      thumbnailForSave = thumbnailFileRef.current || frame || null;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    // Keys PUT to R2 during THIS attempt. On Huỷ they are deleted again; on
    // any other failure they stay cached so the next save skips them.
    const attemptKeys = [];

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
        plan.push({ slot: "preview", label: "Bản WebM", file: previewFile, folder: "projects" });
      }
    } else if (mediaFiles.length > 0) {
      plan.push({ slot: "images", label: "Ảnh dự án", files: [...mediaFiles], folder: "image-projects" });
    }
    if (thumbnailForSave) {
      plan.push({
        slot: "thumbnail",
        label: "Ảnh thumbnail",
        file: thumbnailForSave,
        folder: "thumbnails",
      });
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
      if (reload) await loadItems(tab, { background: true });

      if (savedItem?.id) {
        setEditingId(savedItem.id);
        const opened = toForm(savedItem, tab);
        setForm(opened);
        setFormBaseline(opened);
      }
      setSavedNotice(notice);
      loadPublicCategories();

      const savedTitle = savedItem?.title || form.title || "(Chưa có tiêu đề)";
      const link = publicLinkFor(savedItem, { isVideo: isVideoTab, mode });
      notify(
        "success",
        isEditing ? `Đã lưu “${savedTitle}”` : `Đã thêm “${savedTitle}”`,
        link ? { href: link.href, hrefLabel: link.toastLabel } : undefined
      );
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

      const categories = cleanCategoryList(form.categories);
      const basePayload = {
        title: form.title,
        // The server makes it unique ("-2", "-3", …) and returns the final one.
        slug: form.slug || slugify(form.title),
        client: form.client,
        tagline: form.tagline,
        // Legacy single category kept in step with the chips (the stored
        // one is kept while it is still picked).
        category: mainCategoryFor(categories, form.category),
        categories,
        description: form.description,
        fullDescription: form.fullDescription,
        completionDate: form.completionDate || null,
        orientation: form.orientation,
        featured: form.featured,
        adminRating: Number(form.adminRating) || 0,
        // An edit never sends its position: the list may have been
        // reordered since the form was opened, and the stored record's
        // current place must win (null → the server keeps it).
        order: isEditing || form.order === "" ? null : Number(form.order),
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

      // Image projects have no public page per item: no slug note.
      const slugNote = isVideoTab
        ? slugChangeNote(basePayload.slug, responsePayload?.data?.slug, isVideoTab)
        : "";
      const savedText = showCard
        ? "Đã lưu xong ✓ — file đã được tải lên và lưu."
        : "Đã lưu xong ✓";
      const sectionNote = isVideoTab ? savedSectionNote(mode, responsePayload?.data) : "";
      await finishSaved(
        responsePayload?.data,
        [savedText, slugNote, sectionNote].filter(Boolean).join(" ")
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
          const reloaded = await loadItems(tab, { background: true });
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
        // "Thử lại" re-submits this same form; it does nothing once the
        // form was cleared or another record was opened.
        const gen = formGenRef.current;
        setSaveFailedText(`Chưa lưu được: ${saveError?.message || "lỗi không rõ."}`);
        saveErrorToastRef.current = notify(
          "error",
          saveError?.message || "Lưu thất bại.",
          errorToastOptions(saveError, () => {
            if (formGenRef.current === gen) handleRetryUploads();
          })
        );
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

  // --- Values derived for the form ----------------------------------------
  const publicList = publicCategories
    ? isVideoTab
      ? publicCategories.videos
      : publicCategories.images
    : null;
  const effectiveSlug = slugify(form.slug) || slugify(form.title);
  const ownRecord = isEditing
    ? items.find((item) => Number(item?.id) === Number(editingId))
    : null;
  // Slug the record is reachable under today (empty stored slug → title).
  const ownStoredSlug = ownRecord
    ? String(ownRecord.slug || "") || publicSlugify(ownRecord.title || "")
    : "";
  // Same rule as the server (lib/contentAdmin resolveRecordSlug).
  const slugTaken =
    Boolean(effectiveSlug) &&
    effectiveSlug !== ownStoredSlug &&
    items.some(
      (item) =>
        item &&
        Number(item.id) !== Number(editingId) &&
        (String(item.slug || "") || publicSlugify(item.title || "")) === effectiveSlug
    );
  const usingAutoThumb = Boolean(autoThumbFile) && thumbnailFile === autoThumbFile;
  const thumbnailShownUrl = thumbnailPreviewUrl || form.thumbnail?.url || "";
  const autoFillParts = [];
  if (autoFilled.orientation && form.orientation === autoFilled.orientation) {
    autoFillParts.push(ORIENTATION_LABELS[autoFilled.orientation] || autoFilled.orientation);
  }
  if (autoFilled.duration && form.duration === autoFilled.duration) {
    autoFillParts.push(`thời lượng ${autoFilled.duration}`);
  }
  const saveWarnings = [];
  if (isVideoTab && (isEditing || mediaFile)) {
    if (!thumbnailFile && !form.thumbnail?.url && !capturingThumb) {
      saveWarnings.push("Chưa có thumbnail — nên chọn một ảnh đại diện cho video.");
    }
    if (form.featured && !previewFile && !form.preview?.url) {
      saveWarnings.push("Chưa có bản WebM — lưới trang chủ sẽ dùng video gốc (nặng hơn).");
    }
  }

  return (
    <div ref={rootRef}>
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
                if (!confirmLeaveForm()) return;
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
            onClick={() => startCreate()}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Thêm mới
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
              onClick={() => loadItems(tab, { background: items.length > 0 })}
              disabled={loadingItems || refreshing}
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

      {staleNotice && !error ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
          role="status"
        >
          <p className="min-w-0 flex-1">Dữ liệu có thể đã đổi ở tab khác —</p>
          <button
            type="button"
            onClick={() => {
              if (
                layoutDirty &&
                !window.confirm(
                  "Bố cục trang chủ chưa lưu có thể bị thay bằng dữ liệu mới. Vẫn tải lại?"
                )
              ) {
                return;
              }
              setStaleNotice(false);
              loadItems(tab, { background: true });
            }}
            disabled={refreshing || loadingItems}
            className="min-h-[36px] rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Tải lại danh sách
          </button>
        </div>
      ) : null}

      {/* Stay mounted while re-fetching once we have items, so an unsaved
          layout the admin is arranging survives a save/delete elsewhere on
          the page (the panel only re-syncs when the server layout changed). */}
      {showFeaturedLayoutSection && (!loadingItems || items.length > 0) ? (
        <div className="mt-8">
          <FeaturedLayoutPanel
            items={items}
            onSaved={() => loadItems(tab, { background: true })}
            onDirtyChange={setLayoutDirty}
          />
        </div>
      ) : null}

      {/* Phones: the list comes first (it is what the owner browses); "Sửa"
          and "+ Tạo mới" scroll down to the form. Side by side from lg. */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <motion.div
          layout
          ref={formCardRef}
          className="order-2 scroll-mt-4 rounded-2xl border border-gray-200 p-5 lg:order-1"
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
                  {isEditing ? `Đang sửa #${editingId}` : createLabel}
                </motion.span>
              </AnimatePresence>
            </h2>
            {isEditing ? (
              <button
                type="button"
                onClick={() => startCreate()}
                disabled={saving}
                className="min-h-[36px] rounded-md border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
              {/* (a) Files first: picking the video fills orientation,
                  duration and (when missing) the thumbnail. */}
              <FormSection
                title="File"
                hint={
                  isVideoTab
                    ? "Chọn video trước — máy sẽ tự điền hướng khung hình, thời lượng và tạo ảnh thumbnail."
                    : "Ảnh của dự án và ảnh đại diện."
                }
              >
                {isVideoTab ? (
                  <div id={fieldId("field-media")}>
                    <FieldLabel>{isEditing ? "Video chính" : "Video chính *"}</FieldLabel>
                    <p className="mb-2 text-xs text-gray-500">
                      File chất lượng cao (MP4). Khách bấm vào video sẽ xem file này.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <FileButton
                        inputKey={`media-${fileInputsKey}`}
                        accept={ACCEPT.media}
                        disabled={saving}
                        onChange={(event) => pickFile("media", "media", event)}
                      >
                        {mediaFile || form.media?.url ? "Chọn video khác…" : "Chọn video…"}
                      </FileButton>
                      {mediaFile ? (
                        <button
                          type="button"
                          onClick={() => clearSlot("media")}
                          className="text-xs text-gray-600 underline hover:text-gray-900"
                        >
                          Bỏ chọn
                        </button>
                      ) : null}
                    </div>
                    {pickErrors.media ? (
                      <p className="mt-1.5 text-xs text-red-600">{pickErrors.media}</p>
                    ) : null}
                    {formErrors.media ? (
                      <p className="mt-1.5 text-xs text-red-600">{formErrors.media}</p>
                    ) : null}
                    <PickedFileInfo
                      file={mediaFile}
                      uploaded={Boolean(cachedSingle(uploadCache, "media", mediaFile))}
                    />
                    {!mediaFile ? <StoredAssetLine asset={form.media} /> : null}
                    {mediaFile && autoFillParts.length > 0 ? (
                      <p className="mt-1.5 text-[11px] text-emerald-700">
                        ✓ Tự điền từ video: {autoFillParts.join(" · ")} — sửa được trong mục
                        “Nâng cao”.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div>
                    <FieldLabel>Ảnh của dự án</FieldLabel>
                    <ImageDropzone
                      files={mediaFiles}
                      onChange={changeMediaFiles}
                      existingCount={Array.isArray(form.mediaList) ? form.mediaList.length : 0}
                      uploadedFiles={uploadCache.images.map((entry) => entry.file)}
                      disabled={saving}
                    />
                  </div>
                )}

                {/* Featured videos only: the homepage grid plays this small
                    WebM instead of the full video (12 cards loop at once). */}
                {isVideoTab && form.featured ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <FieldLabel>Bản xem trước WebM cho lưới trang chủ</FieldLabel>
                    <p className="mb-2 text-xs text-gray-600">
                      File <span className="font-semibold">.webm</span> nhẹ, không tiếng (nên dưới
                      3 MB, dưới 12 giây, 720p). Lưới video ở trang chủ phát file này thay cho
                      video gốc để trang tải nhanh hơn.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <FileButton
                        inputKey={`preview-${fileInputsKey}`}
                        accept={ACCEPT.preview}
                        disabled={saving}
                        onChange={(event) => pickFile("preview", "preview", event)}
                      >
                        {previewFile || form.preview?.url ? "Chọn file khác…" : "Chọn file WebM…"}
                      </FileButton>
                      {previewFile ? (
                        <button
                          type="button"
                          onClick={() => clearSlot("preview")}
                          className="text-xs text-gray-600 underline hover:text-gray-900"
                        >
                          Bỏ chọn
                        </button>
                      ) : null}
                    </div>
                    {pickErrors.preview ? (
                      <p className="mt-1.5 text-xs text-red-600">{pickErrors.preview}</p>
                    ) : null}
                    <PickedFileInfo
                      file={previewFile}
                      uploaded={Boolean(cachedSingle(uploadCache, "preview", previewFile))}
                    />
                    {!previewFile ? <StoredAssetLine asset={form.preview} /> : null}
                  </div>
                ) : null}

                <div id={fieldId("field-thumbnail")}>
                  <FieldLabel>Ảnh thumbnail</FieldLabel>
                  <p className="mb-2 text-xs text-gray-500">
                    {isVideoTab
                      ? "Ảnh hiện trên thẻ video ở trang Video (xuongart.com/videos) và trong danh sách quản trị. Lưới video ở trang chủ phát video, không dùng ảnh này."
                      : "Ảnh đại diện của dự án. Để trống thì trang công khai dùng ảnh đầu tiên."}
                  </p>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100 px-2 text-center text-[11px] text-gray-400">
                      {thumbnailShownUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbnailShownUrl}
                          alt="Ảnh thumbnail"
                          className="h-full w-full object-cover"
                        />
                      ) : capturingThumb ? (
                        "Đang tạo ảnh từ video…"
                      ) : (
                        "Chưa có ảnh"
                      )}
                    </div>
                    <div className="min-w-[11rem] flex-1 space-y-2">
                      {usingAutoThumb ? (
                        <p className="text-xs text-gray-600">Ảnh tự tạo từ một khung hình của video.</p>
                      ) : !thumbnailFile && form.thumbnail?.url ? (
                        <p className="text-xs text-gray-600">Đang dùng ảnh đã lưu.</p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        {autoThumbFile ? (
                          <button
                            type="button"
                            aria-pressed={usingAutoThumb}
                            onClick={() => setSlotFile("thumbnail", autoThumbFile)}
                            className={`rounded-lg border px-3 py-1.5 text-sm ${
                              usingAutoThumb
                                ? "border-black bg-black text-white"
                                : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                            }`}
                          >
                            Dùng ảnh tự tạo
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => thumbnailInputRef.current?.click()}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
                        >
                          {autoThumbFile || thumbnailFile || form.thumbnail?.url
                            ? "Chọn ảnh khác"
                            : "Chọn ảnh…"}
                        </button>
                        {thumbnailFile ? (
                          <button
                            type="button"
                            onClick={() => clearSlot("thumbnail")}
                            className="text-xs text-gray-600 underline hover:text-gray-900"
                          >
                            Bỏ chọn
                          </button>
                        ) : null}
                      </div>
                      <input
                        key={`thumbnail-${fileInputsKey}`}
                        ref={thumbnailInputRef}
                        type="file"
                        accept={ACCEPT.image}
                        disabled={saving}
                        className="hidden"
                        onChange={(event) => pickFile("thumbnail", "image", event)}
                      />
                      {pickErrors.thumbnail ? (
                        <p className="text-xs text-red-600">{pickErrors.thumbnail}</p>
                      ) : null}
                      <PickedFileInfo
                        file={thumbnailFile}
                        uploaded={Boolean(cachedSingle(uploadCache, "thumbnail", thumbnailFile))}
                      />
                    </div>
                  </div>
                </div>
              </FormSection>

              {/* (b) What the public pages show about the project. */}
              <FormSection title="Thông tin">
                <div id={fieldId("field-title")}>
                  <FieldLabel htmlFor={fieldId("project-title")}>Tiêu đề *</FieldLabel>
                  <AutocompleteInput
                    value={form.title}
                    onChange={handleTitleChange}
                    suggestions={suggestions.title}
                    openOnFocus={false}
                    inputProps={{ id: fieldId("project-title"), "aria-invalid": Boolean(formErrors.title) }}
                  />
                  {formErrors.title ? (
                    <p className="mt-1.5 text-xs text-red-600">{formErrors.title}</p>
                  ) : null}
                </div>

                <div>
                  <FieldLabel htmlFor={fieldId("project-client")}>Khách hàng</FieldLabel>
                  <AutocompleteInput
                    value={form.client}
                    onChange={(v) => setForm((prev) => ({ ...prev, client: v }))}
                    suggestions={suggestions.client}
                    inputProps={{ id: fieldId("project-client") }}
                  />
                </div>

                <div>
                  <FieldLabel>Thể loại</FieldLabel>
                  <CategoryPicker
                    key={`categories-${fileInputsKey}`}
                    value={form.categories}
                    onChange={(next) => setForm((prev) => ({ ...prev, categories: next }))}
                    publicList={publicList}
                    fallback={suggestions.category}
                    main={mainCategoryFor(form.categories, form.category)}
                    mainHint={
                      isVideoTab
                        ? "là thể loại chính — hiện phía trên tiêu đề ở trang chi tiết video."
                        : ""
                    }
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor={fieldId("project-completion-date")}>Ngày hoàn thành</FieldLabel>
                    <input
                      id={fieldId("project-completion-date")}
                      type="date"
                      value={form.completionDate || ""}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, completionDate: event.target.value }))
                      }
                      className={baseInputClassName()}
                    />
                  </div>
                  {isVideoTab ? (
                    <div className="flex items-end">
                      <label className="inline-flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={form.featured}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, featured: event.target.checked }))
                          }
                        />
                        <span>
                          Nổi bật
                          <span className="block text-xs text-gray-500">
                            Hiện trong lưới video ở trang chủ.
                          </span>
                        </span>
                      </label>
                    </div>
                  ) : null}
                </div>

                {/* Admin-only favourite rating (never sent to the public
                    site); sorts the lists. Kept on every video, featured or
                    not, so flipping "Nổi bật" doesn't lose it. */}
                {isVideoTab ? (
                  <div>
                    <FieldLabel>Đánh giá</FieldLabel>
                    <StarRatingInput
                      value={form.adminRating}
                      onChange={(next) => setForm((prev) => ({ ...prev, adminRating: next }))}
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      Chỉ hiện trong trang quản trị — dùng để sắp xếp danh sách.
                    </p>
                  </div>
                ) : null}
              </FormSection>

              {/* (c) Rarely changed fields, collapsed by default. */}
              <div className="rounded-xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((open) => !open)}
                  aria-expanded={advancedOpen}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm"
                >
                  <span>
                    <span className="font-semibold text-gray-900">Nâng cao</span>
                    <span className="text-xs text-gray-500">
                      {" "}
                      — {isVideoTab ? "đường dẫn, câu giới thiệu, hướng khung hình, thời lượng" : "câu giới thiệu"}, mô tả
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-gray-500">
                    {advancedOpen ? "▴" : "▾"}
                  </span>
                </button>
                {advancedOpen ? (
                  <div className="space-y-4 border-t border-gray-200 p-4">
                    {/* Image projects have no page of their own, so their
                        slug is not shown (the server still keeps a unique
                        one, and an edit keeps the stored value). */}
                    {isVideoTab ? (
                      <div>
                        <FieldLabel htmlFor={fieldId("project-slug")}>Đường dẫn (slug)</FieldLabel>
                        <input
                          id={fieldId("project-slug")}
                          value={form.slug}
                          onChange={(event) => handleSlugChange(event.target.value)}
                          onBlur={() => {
                            // Show the slug as it will be saved.
                            const cleaned = slugify(form.slug);
                            if (cleaned !== form.slug) handleSlugChange(cleaned);
                          }}
                          className={baseInputClassName()}
                          placeholder="tự tạo từ tiêu đề"
                        />
                        <p className="mt-1 break-all text-xs text-gray-600">
                          xuongart.com/videos/
                          <span className="font-medium text-gray-900">{effectiveSlug || "…"}</span>
                        </p>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {slugFollowsTitle
                            ? "Tự đổi theo tiêu đề cho đến khi bạn sửa ô này. Chỉ gồm chữ thường không dấu, số và dấu “-”."
                            : isEditing
                            ? "Đổi đường dẫn thì link cũ của video này sẽ không mở được nữa."
                            : "Chỉ gồm chữ thường không dấu, số và dấu “-”."}
                        </p>
                        {slugTaken ? (
                          <p className="mt-1 text-[11px] text-amber-700">
                            Đã có mục khác dùng đường dẫn này — khi lưu sẽ tự thêm số phía sau (vd:
                            “{effectiveSlug}-2”).
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div>
                      <FieldLabel htmlFor={fieldId("project-tagline")}>Câu giới thiệu ngắn</FieldLabel>
                      <AutocompleteInput
                        value={form.tagline}
                        onChange={(v) => setForm((prev) => ({ ...prev, tagline: v }))}
                        suggestions={suggestions.tagline}
                        inputProps={{ id: fieldId("project-tagline") }}
                      />
                      <p className="mt-1 text-[11px] text-gray-500">
                        {isVideoTab
                          ? "Hiện dưới tên khách hàng ở trang chi tiết video; cũng dùng khi khách tìm kiếm."
                          : "Dùng khi khách tìm kiếm trên trang Ảnh."}
                      </p>
                    </div>

                    {isVideoTab ? (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <FieldLabel
                            htmlFor={fieldId("project-orientation")}
                            badge={
                              autoFilled.orientation && form.orientation === autoFilled.orientation
                                ? "tự điền từ video"
                                : ""
                            }
                          >
                            Hướng khung hình
                          </FieldLabel>
                          <select
                            id={fieldId("project-orientation")}
                            value={form.orientation}
                            onChange={(event) => {
                              markTouched("orientation");
                              setForm((prev) => ({ ...prev, orientation: event.target.value }));
                            }}
                            className={baseInputClassName()}
                          >
                            <option value="landscape">Ngang (16:9)</option>
                            <option value="portrait">Dọc (9:16)</option>
                            <option value="square">Vuông (1:1)</option>
                          </select>
                          <p className="mt-1 text-[11px] text-gray-500">
                            Quyết định ô hiển thị video trong lưới.
                          </p>
                        </div>
                        <div>
                          <FieldLabel
                            htmlFor={fieldId("project-duration")}
                            badge={
                              autoFilled.duration && form.duration === autoFilled.duration
                                ? "tự điền từ video"
                                : ""
                            }
                          >
                            Thời lượng
                          </FieldLabel>
                          <input
                            id={fieldId("project-duration")}
                            value={form.duration}
                            onChange={(event) => {
                              markTouched("duration");
                              setForm((prev) => ({ ...prev, duration: event.target.value }));
                            }}
                            className={baseInputClassName()}
                            placeholder="vd: 1:30"
                          />
                          <p className="mt-1 text-[11px] text-gray-500">
                            Hiện ở trang chi tiết video.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <FieldLabel htmlFor={fieldId("project-description")}>Mô tả ngắn</FieldLabel>
                      <textarea
                        id={fieldId("project-description")}
                        value={form.description}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, description: event.target.value }))
                        }
                        className={baseInputClassName()}
                        rows={3}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={fieldId("project-full-description")}>Mô tả chi tiết</FieldLabel>
                      <textarea
                        id={fieldId("project-full-description")}
                        value={form.fullDescription}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, fullDescription: event.target.value }))
                        }
                        className={baseInputClassName()}
                        rows={5}
                      />
                      <p className="mt-1 text-[11px] text-gray-500">
                        {isVideoTab
                          ? "Hiện trong khung xem video. Nếu có cả hai, trang chủ chỉ hiện mô tả chi tiết."
                          : "Cả hai mô tả hiện trong khung xem dự án ở trang Ảnh."}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </fieldset>

            {/* Non-blocking reminders before saving. */}
            {saveWarnings.length > 0 && !saving ? (
              <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {saveWarnings.map((text) => (
                  <li key={text}>⚠ {text}</li>
                ))}
              </ul>
            ) : null}
            {formErrors.title || formErrors.media ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Chưa lưu được: {[formErrors.title, formErrors.media].filter(Boolean).join(" ")}
              </p>
            ) : null}

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

            <div
              ref={saveBarRef}
              className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white/95 px-5 py-3 backdrop-blur"
            >
              {saving && uploadProgress ? (
                <UploadProgressSummary progress={uploadProgress} onCancel={handleCancelUpload} />
              ) : null}
              {cancelNotice && !saving ? (
                <p className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  {cancelNotice}
                </p>
              ) : null}
              {saveFailedText && !saving ? (
                <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {saveFailedText}
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
                  if (confirmLeaveForm()) resetEditor();
                }}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Xoá form
              </button>

              {saving && !uploadProgress ? (
                <span className="text-xs text-gray-500" aria-live="polite">
                  {waitingThumb ? "Đang tạo ảnh thumbnail từ video…" : "Đang lưu thông tin…"}
                </span>
              ) : null}
            </div>
          </form>
        </motion.div>

        <motion.div
          layout
          className="order-1 rounded-2xl border border-gray-200 p-5 lg:order-2"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{listTitle}</h2>
              <p className="mt-1 text-xs text-gray-600">
                {listFilter
                  ? `${sortedFilteredItems.length} / ${modeFilteredItems.length}`
                  : `Tổng: ${modeFilteredItems.length}`}
                {reordering ? (
                  <span className="ml-2 text-amber-700">· đang lưu thứ tự…</span>
                ) : refreshing ? (
                  <span className="ml-2 text-gray-500">· đang tải lại…</span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <input
                type="search"
                value={listFilter}
                onChange={(event) => setListFilter(event.target.value)}
                placeholder="Tìm theo tên, khách hàng, thể loại…"
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
                  onClick={() => startCreate()}
                  className="min-h-[36px] rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Tạo mới
                </button>
              ) : null}
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {listFilter || listSort !== "order"
              ? "Để bật kéo-thả / ↑↓ đổi thứ tự, chọn “Thứ tự thủ công” và xoá ô tìm kiếm."
              : staleNotice
              ? "Tải lại danh sách (nút ở trên) trước khi đổi thứ tự."
              : "Kéo-thả thẻ hoặc dùng ↑/↓ để đổi thứ tự hiển thị trên trang công khai."}
          </p>

          {loadingItems ? (
            <p className="mt-4 text-sm text-gray-600">Đang tải…</p>
          ) : items.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">Chưa có mục nào.</p>
          ) : sortedFilteredItems.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              {listFilter.trim()
                ? `Không có mục nào khớp với “${listFilter.trim()}”.`
                : mode === "showreel-featured"
                ? "Chưa có video nổi bật nào. Bấm “+ Tạo mới” để thêm, hoặc tích ô Nổi bật cho một video ở thẻ Thư viện video."
                : mode === "other-videos"
                ? "Chưa có video nào trong thư viện (ngoài các video nổi bật)."
                : "Chưa có mục nào."}
            </p>
          ) : (
            <motion.div layout className="mt-4 space-y-3">
              <AnimatePresence initial={false}>
                {sortedFilteredItems.map((item, shownIndex) => {
                  const confirming = Number(confirmDeleteId) === Number(item.id);
                  const deleting = Number(deletingId) === Number(item.id);
                  const rowLocked = saving || deletingId !== null;
                  const isCurrent = Number(editingId) === Number(item.id);
                  const cats = Array.isArray(item.categories) ? item.categories : [];
                  // Place in the manual order on screen, e.g. "Vị trí 3/12";
                  // only shown while the list IS the manual order (no other
                  // sort, no search), where it matches what ↑/↓ change.
                  const showPosition = listSort === "order" && !listFilter;
                  const canReorder = canReorderList;
                  // ↑ / ↓ move past the neighbour ON SCREEN.
                  const isFirstShown = shownIndex === 0;
                  const isLastShown = shownIndex === sortedFilteredItems.length - 1;
                  const reorderOffHint = listFilter
                    ? "Xoá ô tìm kiếm để sắp xếp"
                    : listSort !== "order"
                    ? "Chọn “Thứ tự thủ công” để sắp xếp"
                    : staleNotice
                    ? "Tải lại danh sách trước khi sắp xếp"
                    : refreshing || loadingItems
                    ? "Đang tải lại danh sách…"
                    : "";
                  const publicLink = publicLinkFor(item, { isVideo: isVideoTab, mode });
                  const isDragging = dragId !== null && Number(dragId) === Number(item.id);
                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                      draggable={canReorder && !confirming}
                      onDragStart={(event) => {
                        if (!canReorder || confirming) return;
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
                            ref={(node) => {
                              const key = arrowKey(item.id, -1);
                              if (node) arrowButtonRefs.current.set(key, node);
                              else arrowButtonRefs.current.delete(key);
                            }}
                            onClick={(event) => handleMove(item, -1, event)}
                            disabled={!canReorder || isFirstShown}
                            title={reorderOffHint || "Lên trên"}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="Lên trên"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            ref={(node) => {
                              const key = arrowKey(item.id, 1);
                              if (node) arrowButtonRefs.current.set(key, node);
                              else arrowButtonRefs.current.delete(key);
                            }}
                            onClick={(event) => handleMove(item, 1, event)}
                            disabled={!canReorder || isLastShown}
                            title={reorderOffHint || "Xuống dưới"}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="Xuống dưới"
                          >
                            ↓
                          </button>
                        </div>
                        <RowThumb item={item} />
                        <div className="min-w-0 flex-1">
                          {/* Phones: Sửa / Xoá go under the text so the
                              title and client stay readable. */}
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="truncate font-semibold">
                                {item.title || "(Chưa có tiêu đề)"}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-gray-600">
                                {item.client || "Chưa ghi khách hàng"} · #{item.id}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {item.featured ? (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                    ★ Nổi bật
                                  </span>
                                ) : null}
                                <StarRatingDisplay value={item.adminRating} />
                                {showPosition ? (
                                  <span
                                    className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700"
                                    title={`Thứ tự hiển thị: thứ ${shownIndex + 1} trong ${sortedFilteredItems.length} mục của danh sách này`}
                                  >
                                    Vị trí {shownIndex + 1}/{sortedFilteredItems.length}
                                  </span>
                                ) : null}
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
                            <div className="flex shrink-0 flex-wrap gap-2">
                              {publicLink ? (
                                <a
                                  href={publicLink.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  draggable={false}
                                  title={publicLink.title}
                                  className="inline-flex min-h-[36px] items-center rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                >
                                  Xem ↗
                                </a>
                              ) : null}
                              <button
                                type="button"
                                disabled={rowLocked}
                                onClick={() => startEdit(item)}
                                className="min-h-[36px] rounded-md border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Sửa
                              </button>
                              <button
                                type="button"
                                ref={(node) => {
                                  const key = Number(item.id);
                                  if (node) deleteButtonRefs.current.set(key, node);
                                  else deleteButtonRefs.current.delete(key);
                                }}
                                disabled={rowLocked || confirming}
                                onClick={() => openDeleteConfirm(item.id)}
                                className="min-h-[36px] rounded-md border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Xoá
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {confirming ? (
                        <div
                          className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                          role="alertdialog"
                          aria-label="Xác nhận xoá"
                          aria-describedby={fieldId(`delete-confirm-text-${item.id}`)}
                          onKeyDown={(event) => {
                            if (event.key !== "Escape" || deleting) return;
                            event.preventDefault();
                            event.stopPropagation();
                            closeDeleteConfirm(item.id);
                          }}
                        >
                          <p id={fieldId(`delete-confirm-text-${item.id}`)} className="break-words">
                            Xoá “{item.title || "(Chưa có tiêu đề)"}” (#{item.id})? Video/ảnh của mục
                            này trên R2 cũng sẽ bị xoá.
                          </p>
                          {deleteError && Number(deleteError.id) === Number(item.id) && !deleting ? (
                            <div
                              role="alert"
                              className="mt-2 rounded-md border border-red-300 bg-white px-2 py-1.5 text-red-700"
                            >
                              <p className="break-words font-medium">
                                Chưa xoá được: {deleteError.message}
                              </p>
                              {deleteError.hint ? (
                                <p className="mt-0.5 break-words text-red-800">{deleteError.hint}</p>
                              ) : null}
                              {deleteError.status === 401 ? (
                                <button
                                  type="button"
                                  onClick={() => window.location.reload()}
                                  className="mt-1 text-red-700 underline hover:text-red-900"
                                >
                                  Tải lại trang để đăng nhập
                                </button>
                              ) : deleteError.status === null || deleteError.status >= 500 ? (
                                <a
                                  href="/api/admin/health"
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-block text-red-700 underline hover:text-red-900"
                                >
                                  Kiểm tra kết nối R2 ↗
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              ref={confirmCancelRef}
                              disabled={deleting}
                              onClick={() => closeDeleteConfirm(item.id)}
                              className="min-h-[36px] rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Huỷ
                            </button>
                            <button
                              type="button"
                              disabled={deletingId !== null || saving}
                              onClick={() => handleDelete(item.id)}
                              className="min-h-[36px] rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deleting ? "Đang xoá…" : "Xoá"}
                            </button>
                          </div>
                        </div>
                      ) : null}
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
