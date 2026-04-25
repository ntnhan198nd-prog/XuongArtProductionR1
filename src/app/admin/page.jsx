"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Container from "@/components/Container";

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
    .replace(/[\u0300-\u036f]/g, "")
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

async function uploadAsset(file, folder) {
  const metadata = await getFileMetadata(file);
  const formData = new FormData();
  formData.set("file", file);
  formData.set("folder", folder);
  if (metadata.width) formData.set("width", String(metadata.width));
  if (metadata.height) formData.set("height", String(metadata.height));
  if (metadata.duration) formData.set("duration", String(metadata.duration));

  const response = await fetch("/api/admin/r2/upload", {
    method: "POST",
    body: formData,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to upload file to R2.");
  }

  return payload.data;
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

export default function AdminPage() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
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

  const tabLabel = useMemo(() => TABS.find((item) => item.key === tab)?.label || tab, [tab]);

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
    const checkSession = async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        const payload = await response.json();
        setAuthenticated(Boolean(payload?.authenticated));
      } catch {
        setAuthenticated(false);
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    loadItems(tab);
  }, [authenticated, tab, loadItems]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: loginPassword }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Login failed.");
      }

      setAuthenticated(true);
      setLoginPassword("");
    } catch (loginErr) {
      setLoginError(loginErr.message);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    resetEditor();
    setItems([]);
  };

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

  if (checkingSession) {
    return (
      <main className="bg-white text-black">
        <Container className="py-20">
          <p className="text-sm text-gray-600">Checking admin session...</p>
        </Container>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="bg-white text-black">
        <Container className="py-20">
          <div className="mx-auto max-w-md rounded-2xl border border-gray-200 p-6">
            <h1 className="text-2xl font-semibold">Admin Login</h1>
            <p className="mt-2 text-sm text-gray-600">
              Dang nhap de quan ly project va upload video len R2.
            </p>

            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  className={baseInputClassName()}
                  placeholder="Nhap ADMIN_PASSWORD"
                  required
                />
              </div>

              {loginError ? <p className="text-sm text-red-600">{loginError}</p> : null}

              <button
                type="submit"
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Login
              </button>
            </form>
          </div>
        </Container>
      </main>
    );
  }

  return (
    <main className="bg-white text-black">
      <Container className="py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Custom Admin</h1>
            <p className="mt-1 text-sm text-gray-600">
              Quan ly noi dung portfolio. Giao dien frontend giu nguyen.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Logout
          </button>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTab(item.key);
                resetEditor();
              }}
              className={`rounded-full px-4 py-2 text-sm ${
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
            className="rounded-full border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            New {tabLabel}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold">{isEditing ? `Edit #${editingId}` : `Create ${tabLabel}`}</h2>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Title *</label>
                <input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  className={baseInputClassName()}
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
                  <input
                    value={form.client}
                    onChange={(event) => setForm((prev) => ({ ...prev, client: event.target.value }))}
                    className={baseInputClassName()}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Category</label>
                  <input
                    value={form.category}
                    onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                    className={baseInputClassName()}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Categories (comma-separated)</label>
                <input
                  value={form.categoriesText}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, categoriesText: event.target.value }))
                  }
                  className={baseInputClassName()}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Tagline</label>
                <input
                  value={form.tagline}
                  onChange={(event) => setForm((prev) => ({ ...prev, tagline: event.target.value }))}
                  className={baseInputClassName()}
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
                  <input
                    value={form.duration}
                    onChange={(event) => setForm((prev) => ({ ...prev, duration: event.target.value }))}
                    className={baseInputClassName()}
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
          </div>

          <div className="rounded-2xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold">{tabLabel}</h2>
            <p className="mt-1 text-xs text-gray-600">Total: {items.length}</p>

            {loadingItems ? (
              <p className="mt-4 text-sm text-gray-600">Loading...</p>
            ) : items.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">No items yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-gray-200 p-3 text-sm text-gray-800"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-semibold">#{item.id} {item.title || "(No title)"}</div>
                        <div className="text-xs text-gray-600">slug: {item.slug || "-"}</div>
                        <div className="text-xs text-gray-600">
                          order: {item.order ?? "-"} | featured: {item.featured ? "yes" : "no"}
                        </div>
                      </div>
                      <div className="flex gap-2">
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
                ))}
              </div>
            )}
          </div>
        </div>
      </Container>
    </main>
  );
}
