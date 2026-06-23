"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import FeaturedLayoutPanel from "@/components/admin/FeaturedLayoutPanel";
import ShowreelPanel from "@/components/admin/ShowreelPanel";
import AutocompleteInput from "@/components/admin/AutocompleteInput";

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
// to undo before save.
function ImageDropzone({ files = [], onChange, existingCount = 0 }) {
  const [dragActive, setDragActive] = useState(false);
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
    const arr = Array.from(incoming || []).filter((f) =>
      f.type?.startsWith("image/")
    );
    if (arr.length === 0) return;
    onChange([...(files || []), ...arr]);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          handleFilesAdded(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragActive
            ? "border-black bg-gray-50"
            : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
        }`}
      >
        <span className="text-2xl">⬆️</span>
        <p className="mt-2 text-sm font-medium text-gray-800">
          Kéo-thả ảnh vào đây
        </p>
        <p className="mt-1 text-xs text-gray-500">
          hoặc bấm để chọn nhiều file. Hỗ trợ PNG, JPG, WebP.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            handleFilesAdded(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>
          {files.length > 0
            ? `${files.length} file mới · sẽ thay toàn bộ ${existingCount} ảnh hiện có khi lưu`
            : `Hiện có ${existingCount} ảnh — kéo file mới sẽ thay thế danh sách này.`}
        </span>
        {files.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-md border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50"
          >
            Xoá hết
          </button>
        ) : null}
      </div>

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
              <button
                type="button"
                onClick={() => {
                  const next = [...files];
                  next.splice(idx, 1);
                  onChange(next);
                }}
                className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white hover:bg-black"
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

async function readImageMetadata(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.width, height: image.height });
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
  });
}

async function readVideoMetadata(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(2)) : null,
      });
      URL.revokeObjectURL(objectUrl);
    };
    video.onerror = () => {
      resolve({ width: null, height: null, duration: null });
      URL.revokeObjectURL(objectUrl);
    };
    video.src = objectUrl;
  });
}

async function getFileMetadata(file) {
  if (file?.type?.startsWith("image/")) {
    return readImageMetadata(file);
  }
  if (file?.type?.startsWith("video/")) {
    return readVideoMetadata(file);
  }
  return { width: null, height: null, duration: null };
}

async function uploadAsset(file, folder, onProgress) {
  // Browser uploads directly to R2 via a short-lived presigned URL — bypassing
  // the Next.js server entirely. This avoids the double-bandwidth round trip
  // and Vercel function size/timeout limits.
  const metadata = await getFileMetadata(file);
  const contentType = file.type || "application/octet-stream";

  // Step 1: ask the server for a presigned PUT URL.
  const presignRes = await fetch("/api/admin/r2/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType,
      folder,
    }),
  });
  // Guard against an empty/non-JSON error body (e.g. a 502/504 gateway page):
  // bare .json() would throw "Unexpected end of JSON input" and mask the real
  // failure. Falling back to {} lets the status-aware message below surface.
  const presignPayload = await presignRes.json().catch(() => ({}));
  if (!presignRes.ok) {
    throw new Error(presignPayload?.error || `Failed to obtain upload URL (${presignRes.status}).`);
  }
  const { key, uploadUrl, publicUrl } = presignPayload.data || {};
  if (!uploadUrl) {
    throw new Error("Server did not return an upload URL.");
  }

  // Step 2: PUT the file straight to R2 (with progress events).
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    if (typeof onProgress === "function") {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded / event.total);
        }
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new Error("Upload was aborted."));
    xhr.send(file);
  });

  // Step 3: return the same asset shape the rest of the admin expects.
  return {
    key,
    url: publicUrl,
    previewUrl: null,
    name: file.name,
    mime: contentType,
    size: file.size,
    previewSize: null,
    width: metadata.width || null,
    height: metadata.height || null,
    duration: metadata.duration || null,
  };
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
export default function ProjectsAdminPanel({ mode } = {}) {
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

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);

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

  const resetEditor = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMediaFile(null);
    setMediaFiles([]);
    setPreviewFile(null);
    setThumbnailFile(null);
    setError("");
  };

  const loadItems = useCallback(async (targetTab) => {
    setLoadingItems(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/${targetTab}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to load items (${response.status}).`);
      }
      setItems(Array.isArray(payload.data) ? payload.data : []);
    } catch (loadError) {
      setError(loadError.message);
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    loadItems(tab);
  }, [tab, loadItems]);

  const startCreate = () => {
    resetEditor();
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm(toForm(item, tab));
    setMediaFile(null);
    setMediaFiles([]);
    setPreviewFile(null);
    setThumbnailFile(null);
    setError("");
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
      try {
        const response = await fetch(`/api/admin/${tab}/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedIds: reordered.map((it) => it.id),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Reorder failed.");
        }
      } catch (reorderError) {
        setError(reorderError.message);
        await loadItems(tab);
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
    const response = await fetch(`/api/admin/${tab}/${id}`, { method: "DELETE" });
    // Without the .catch(), an empty/non-JSON body (infra 500/502) makes this
    // bare async click handler reject silently: no error shown, list never
    // refreshes, the row appears to "do nothing". Guard like the others do.
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(payload?.error || `Delete failed (${response.status}).`);
      return;
    }

    if (Number(editingId) === Number(id)) {
      resetEditor();
    }

    await loadItems(tab);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
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

      let payload = { ...basePayload };

      if (tab === "projects") {
        let media = form.media;
        let preview = form.preview;
        let thumbnail = form.thumbnail;

        if (mediaFile) {
          media = await uploadAsset(mediaFile, "projects");
        }
        if (previewFile) {
          preview = await uploadAsset(previewFile, "projects");
        }
        if (thumbnailFile) {
          thumbnail = await uploadAsset(thumbnailFile, "thumbnails");
        }

        payload = {
          ...payload,
          duration: form.duration,
          media,
          preview,
          thumbnail,
        };
      } else {
        let nextMediaList = Array.isArray(form.mediaList) ? form.mediaList : [];
        let thumbnail = form.thumbnail;

        if (mediaFiles.length > 0) {
          nextMediaList = [];
          for (const file of mediaFiles) {
            // Upload sequentially to avoid memory spikes for large files.
            const uploadedAsset = await uploadAsset(file, "image-projects");
            nextMediaList.push(uploadedAsset);
          }
        }

        if (thumbnailFile) {
          thumbnail = await uploadAsset(thumbnailFile, "thumbnails");
        }

        payload = {
          ...payload,
          media: nextMediaList,
          thumbnail,
        };
      }

      const endpoint = isEditing ? `/api/admin/${tab}/${editingId}` : `/api/admin/${tab}`;
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(responsePayload?.error || `Save failed (${response.status}).`);
      }

      const savedItem = responsePayload?.data;
      resetEditor();
      await loadItems(tab);

      if (savedItem?.id) {
        setEditingId(savedItem.id);
        setForm(toForm(savedItem, tab));
      }
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
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
          <ShowreelPanel />
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
              onClick={() => {
                setTab(item.key);
                resetEditor();
                setListFilter("");
              }}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
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
            onClick={startCreate}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm transition-colors hover:bg-gray-50"
          >
            + New {tabLabel}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {showFeaturedLayoutSection && !loadingItems ? (
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
                onClick={resetEditor}
                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50"
              >
                + Tạo mới
              </button>
            ) : null}
          </div>

          <form onSubmit={handleSave} className="mt-4 space-y-4">
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
                      type="file"
                      accept="video/*,image/*"
                      onChange={(event) => setMediaFile(event.target.files?.[0] || null)}
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
                        type="file"
                        accept="video/webm,.webm"
                        onChange={(event) => setPreviewFile(event.target.files?.[0] || null)}
                      />
                    </div>
                    {previewFile ? (
                      <p className="text-xs text-amber-800">
                        Sẽ upload: {previewFile.name} ({Math.round(previewFile.size / 1024)} KB)
                      </p>
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
                    onChange={setMediaFiles}
                    existingCount={
                      Array.isArray(form.mediaList) ? form.mediaList.length : 0
                    }
                  />
                </div>
              </div>
            )}

            <div className="space-y-3 rounded-xl border border-gray-200 p-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Thumbnail image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setThumbnailFile(event.target.files?.[0] || null)}
                />
              </div>
              {form.thumbnail?.url ? (
                <p className="text-xs text-gray-600">Current thumbnail: {form.thumbnail.url}</p>
              ) : (
                <p className="text-xs text-gray-500">No thumbnail selected yet.</p>
              )}
            </div>

            <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white/95 px-5 py-3 backdrop-blur">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Đang lưu..." : isEditing ? "Cập nhật" : "Tạo mới"}
              </button>

              <button
                type="button"
                onClick={resetEditor}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                Xoá form
              </button>

              {saving ? (
                <span className="text-xs text-gray-500" aria-live="polite">
                  Đang upload + lưu thông tin…
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
                  onClick={() => {
                    startCreate();
                    if (typeof window !== "undefined") {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
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
                                onClick={() => startEdit(item)}
                                className="rounded-md border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
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
