"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  thumbnail: null,
};

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
  const presignPayload = await presignRes.json();
  if (!presignRes.ok) {
    throw new Error(presignPayload?.error || "Failed to obtain upload URL.");
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
    thumbnail: item?.thumbnail || null,
  };
}

export default function ProjectsAdminPanel() {
  const [tab, setTab] = useState(TABS[0].key);

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [thumbnailFile, setThumbnailFile] = useState(null);

  const isEditing = editingId !== null;
  const [listFilter, setListFilter] = useState("");

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

  const filteredItems = useMemo(() => {
    const query = listFilter.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
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
  }, [items, listFilter]);

  const resetEditor = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMediaFile(null);
    setMediaFiles([]);
    setThumbnailFile(null);
    setError("");
  };

  const loadItems = useCallback(async (targetTab) => {
    setLoadingItems(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/${targetTab}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load items.");
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
    setThumbnailFile(null);
    setError("");
  };

  const handleDelete = async (id) => {
    const shouldDelete = window.confirm("Xoa muc nay?");
    if (!shouldDelete) return;

    setError("");
    const response = await fetch(`/api/admin/${tab}/${id}`, { method: "DELETE" });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload?.error || "Delete failed.");
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
        order: form.order === "" ? null : Number(form.order),
      };

      let payload = { ...basePayload };

      if (tab === "projects") {
        let media = form.media;
        let thumbnail = form.thumbnail;

        if (mediaFile) {
          media = await uploadAsset(mediaFile, "projects");
        }
        if (thumbnailFile) {
          thumbnail = await uploadAsset(thumbnailFile, "thumbnails");
        }

        payload = {
          ...payload,
          duration: form.duration,
          media,
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
      const responsePayload = await response.json();

      if (!response.ok) {
        throw new Error(responsePayload?.error || "Save failed.");
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

  return (
    <div>
      <div className="mt-6">
        <ShowreelPanel />
      </div>

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

      {error ? (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {tab === "projects" && !loadingItems ? (
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
                  <option value="landscape">landscape</option>
                  <option value="portrait">portrait</option>
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
              <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Media file (video/image)
                  </label>
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
            ) : (
              <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Media images (multiple)</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => setMediaFiles(Array.from(event.target.files || []))}
                  />
                </div>
                <p className="text-xs text-gray-600">
                  Current images: {Array.isArray(form.mediaList) ? form.mediaList.length : 0}
                </p>
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

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : isEditing ? "Update" : "Create"}
              </button>

              <button
                type="button"
                onClick={resetEditor}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                Clear
              </button>
            </div>
          </form>
        </motion.div>

        <motion.div layout className="rounded-2xl border border-gray-200 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{tabLabel}</h2>
              <p className="mt-1 text-xs text-gray-600">
                {listFilter
                  ? `${filteredItems.length} / ${items.length}`
                  : `Total: ${items.length}`}
              </p>
            </div>
            <input
              type="search"
              value={listFilter}
              onChange={(event) => setListFilter(event.target.value)}
              placeholder="Tìm theo title, client, slug, category..."
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-black focus:outline-none sm:w-72"
            />
          </div>

          {loadingItems ? (
            <p className="mt-4 text-sm text-gray-600">Loading...</p>
          ) : items.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">No items yet.</p>
          ) : filteredItems.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              Không có mục nào khớp với &quot;{listFilter}&quot;.
            </p>
          ) : (
            <motion.div layout className="mt-4 space-y-3">
              <AnimatePresence initial={false}>
                {filteredItems.map((item) => {
                  const thumbUrl = item.thumbnail?.url || item.media?.url;
                  const isCurrent = Number(editingId) === Number(item.id);
                  const cats = Array.isArray(item.categories) ? item.categories : [];
                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                      className={`rounded-xl border p-3 text-sm text-gray-800 transition-colors ${
                        isCurrent
                          ? "border-black bg-gray-50"
                          : "border-gray-200"
                      }`}
                    >
                      <div className="flex gap-3">
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
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {item.featured ? (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                    ★ featured
                                  </span>
                                ) : null}
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
