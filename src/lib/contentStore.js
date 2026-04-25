import "server-only";
import path from "node:path";
import crypto from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, getR2Config, validateR2Config } from "@/lib/r2";

// Single JSON object on R2 acts as the content store. Writing to the
// repository filesystem is not viable on Vercel (read-only at runtime),
// and R2 is already provisioned for media so it doubles as cheap durable
// state for the admin.
const STORE_KEY = "_admin/content.json";

const EMPTY_STORE = {
  projects: [],
  imageProjects: [],
  nextProjectId: 1,
  nextImageProjectId: 1,
  nextAssetId: 1,
};

let writeQueue = Promise.resolve();

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStore(store = {}) {
  return {
    projects: ensureArray(store.projects),
    imageProjects: ensureArray(store.imageProjects),
    nextProjectId: Number(store.nextProjectId) > 0 ? Number(store.nextProjectId) : 1,
    nextImageProjectId:
      Number(store.nextImageProjectId) > 0 ? Number(store.nextImageProjectId) : 1,
    nextAssetId: Number(store.nextAssetId) > 0 ? Number(store.nextAssetId) : 1,
  };
}

function isMissingObjectError(error) {
  if (!error) return false;
  if (error.name === "NoSuchKey" || error.Code === "NoSuchKey") return true;
  const status = error?.$metadata?.httpStatusCode;
  return status === 404;
}

function assertR2Configured() {
  const validation = validateR2Config();
  if (!validation.valid) {
    throw new Error(
      `R2 is not configured for the content store. Missing: ${validation.missing.join(", ")}`
    );
  }
}

async function readStoreInternal() {
  assertR2Configured();
  const { bucket } = getR2Config();
  const r2 = getR2Client();

  try {
    const result = await r2.send(
      new GetObjectCommand({ Bucket: bucket, Key: STORE_KEY })
    );
    const raw = await result.Body.transformToString("utf-8");
    try {
      return normalizeStore(JSON.parse(raw));
    } catch {
      // Corrupt JSON — reset to an empty store rather than poisoning future reads.
      const empty = { ...EMPTY_STORE };
      await writeStoreInternal(empty);
      return empty;
    }
  } catch (error) {
    if (isMissingObjectError(error)) {
      // First boot in an environment that has never written the store.
      return { ...EMPTY_STORE };
    }
    throw error;
  }
}

async function writeStoreInternal(store) {
  assertR2Configured();
  const normalized = normalizeStore(store);
  const { bucket } = getR2Config();
  const r2 = getR2Client();

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: STORE_KEY,
      Body: JSON.stringify(normalized, null, 2),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "no-store",
    })
  );

  return normalized;
}

export async function readStore() {
  return readStoreInternal();
}

export async function updateStore(mutator) {
  writeQueue = writeQueue.then(async () => {
    const current = await readStoreInternal();
    const draft = structuredClone(current);
    const maybeUpdated = await mutator(draft);
    const nextStore = normalizeStore(maybeUpdated ?? draft);
    return writeStoreInternal(nextStore);
  });

  return writeQueue;
}

export function slugify(value = "") {
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

export function normalizeCategories(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof input === "string") {
    return input
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function parseOptionalDate(input) {
  const value = String(input || "").trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

export function sortByOrderThenId(items = []) {
  return [...items].sort((a, b) => {
    const aOrder = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return Number(a.id) - Number(b.id);
  });
}

export function createAssetId(store) {
  const id = store.nextAssetId;
  store.nextAssetId += 1;
  return id;
}

function buildAssetFormats(asset) {
  if (!asset?.mime?.startsWith("image/") || !asset?.width || !asset?.height) {
    return null;
  }

  return {
    medium: {
      ext: path.extname(asset.name || "") || null,
      url: asset.url,
      hash: crypto.createHash("md5").update(asset.key || asset.url || "").digest("hex"),
      mime: asset.mime,
      name: asset.name || null,
      width: Number(asset.width),
      height: Number(asset.height),
      size: asset.size ? Number((asset.size / (1024 * 1024)).toFixed(3)) : null,
    },
  };
}

function serializeAsset(asset) {
  if (!asset?.url) return null;
  const parsedWidth = Number(asset.width);
  const parsedHeight = Number(asset.height);
  const width = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : null;
  const height = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : null;

  return {
    id: asset.id,
    attributes: {
      name: asset.name || null,
      alternativeText: asset.alternativeText || null,
      caption: null,
      width,
      height,
      formats: buildAssetFormats(asset),
      hash: crypto.createHash("md5").update(asset.key || asset.url).digest("hex"),
      ext: path.extname(asset.name || "") || null,
      mime: asset.mime || null,
      size: asset.size ? Number((asset.size / (1024 * 1024)).toFixed(3)) : null,
      url: asset.url,
      previewUrl: asset.previewUrl || null,
      provider: "cloudflare-r2",
      createdAt: asset.createdAt || null,
      updatedAt: asset.updatedAt || null,
    },
  };
}

export function serializeProject(project) {
  const mediaData = project.media ? serializeAsset(project.media) : null;
  const thumbnailData = project.thumbnail ? serializeAsset(project.thumbnail) : null;

  return {
    id: project.id,
    attributes: {
      title: project.title || "",
      slug: project.slug || slugify(project.title || ""),
      client: project.client || "",
      tagline: project.tagline || "",
      category: project.category || "",
      categories: normalizeCategories(project.categories),
      featured: Boolean(project.featured),
      order: Number.isFinite(Number(project.order)) ? Number(project.order) : null,
      duration: project.duration || "",
      orientation: project.orientation || "landscape",
      description: project.description || "",
      fullDescription: project.fullDescription || "",
      completionDate: project.completionDate || null,
      media: {
        data: mediaData,
      },
      thumbnail: {
        data: thumbnailData,
      },
      createdAt: project.createdAt || null,
      updatedAt: project.updatedAt || null,
      publishedAt: project.publishedAt || project.createdAt || null,
    },
  };
}

export function serializeImageProject(project) {
  const mediaArray = ensureArray(project.media)
    .map((asset) => serializeAsset(asset))
    .filter(Boolean);
  const thumbnailData = project.thumbnail ? serializeAsset(project.thumbnail) : null;

  return {
    id: project.id,
    attributes: {
      title: project.title || "",
      slug: project.slug || slugify(project.title || ""),
      client: project.client || "",
      tagline: project.tagline || "",
      category: project.category || "",
      categories: normalizeCategories(project.categories),
      featured: Boolean(project.featured),
      order: Number.isFinite(Number(project.order)) ? Number(project.order) : null,
      orientation: project.orientation || "landscape",
      description: project.description || "",
      fullDescription: project.fullDescription || "",
      completionDate: project.completionDate || null,
      media: {
        data: mediaArray,
      },
      thumbnail: {
        data: thumbnailData,
      },
      createdAt: project.createdAt || null,
      updatedAt: project.updatedAt || null,
      publishedAt: project.publishedAt || project.createdAt || null,
    },
  };
}
