import "server-only";
import {
  createAssetId,
  normalizeCategories,
  parseOptionalDate,
  slugify,
  sortByOrderThenId,
} from "@/lib/contentStore";

function normalizeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeOrientation(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "portrait" ? "portrait" : "landscape";
}

function normalizeAssetInput(asset, store, now) {
  if (!asset || typeof asset !== "object") return null;
  const url = normalizeText(asset.url);
  if (!url) return null;

  const existingId = Number(asset.id);
  const hasExistingId = Number.isFinite(existingId) && existingId > 0;

  return {
    id: hasExistingId ? existingId : createAssetId(store),
    key: normalizeText(asset.key),
    url,
    mime: normalizeText(asset.mime) || null,
    name: normalizeText(asset.name) || "file",
    size: normalizeNumber(asset.size),
    width: normalizeNumber(asset.width),
    height: normalizeNumber(asset.height),
    duration: normalizeNumber(asset.duration),
    alternativeText: normalizeText(asset.alternativeText),
    previewUrl: normalizeText(asset.previewUrl),
    createdAt: normalizeText(asset.createdAt) || now,
    updatedAt: now,
  };
}

function normalizeAssetList(input, store, now) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => normalizeAssetInput(item, store, now))
    .filter(Boolean);
}

export function normalizeProjectPayload(payload, store, currentItem = null) {
  const now = new Date().toISOString();

  const title = normalizeText(payload.title, currentItem?.title || "");
  const slug = slugify(normalizeText(payload.slug) || title || currentItem?.slug || "");

  return {
    title,
    slug,
    client: normalizeText(payload.client, currentItem?.client || ""),
    tagline: normalizeText(payload.tagline, currentItem?.tagline || ""),
    category: normalizeText(payload.category, currentItem?.category || ""),
    categories: normalizeCategories(payload.categories ?? currentItem?.categories ?? []),
    featured: normalizeBoolean(payload.featured ?? currentItem?.featured),
    order: normalizeNumber(payload.order ?? currentItem?.order),
    duration: normalizeText(payload.duration, currentItem?.duration || ""),
    orientation: normalizeOrientation(payload.orientation ?? currentItem?.orientation),
    description: normalizeText(payload.description, currentItem?.description || ""),
    fullDescription: normalizeText(payload.fullDescription, currentItem?.fullDescription || ""),
    completionDate: parseOptionalDate(payload.completionDate ?? currentItem?.completionDate),
    media: normalizeAssetInput(payload.media ?? currentItem?.media, store, now),
    thumbnail: normalizeAssetInput(payload.thumbnail ?? currentItem?.thumbnail, store, now),
    createdAt: currentItem?.createdAt || now,
    updatedAt: now,
    publishedAt: currentItem?.publishedAt || now,
  };
}

export function normalizeImageProjectPayload(payload, store, currentItem = null) {
  const now = new Date().toISOString();

  const title = normalizeText(payload.title, currentItem?.title || "");
  const slug = slugify(normalizeText(payload.slug) || title || currentItem?.slug || "");

  return {
    title,
    slug,
    client: normalizeText(payload.client, currentItem?.client || ""),
    tagline: normalizeText(payload.tagline, currentItem?.tagline || ""),
    category: normalizeText(payload.category, currentItem?.category || ""),
    categories: normalizeCategories(payload.categories ?? currentItem?.categories ?? []),
    featured: normalizeBoolean(payload.featured ?? currentItem?.featured),
    order: normalizeNumber(payload.order ?? currentItem?.order),
    orientation: normalizeOrientation(payload.orientation ?? currentItem?.orientation),
    description: normalizeText(payload.description, currentItem?.description || ""),
    fullDescription: normalizeText(payload.fullDescription, currentItem?.fullDescription || ""),
    completionDate: parseOptionalDate(payload.completionDate ?? currentItem?.completionDate),
    media: normalizeAssetList(payload.media ?? currentItem?.media, store, now),
    thumbnail: normalizeAssetInput(payload.thumbnail ?? currentItem?.thumbnail, store, now),
    createdAt: currentItem?.createdAt || now,
    updatedAt: now,
    publishedAt: currentItem?.publishedAt || now,
  };
}

export function getSortedProjects(items = []) {
  return sortByOrderThenId(items);
}

function normalizePosition(value, maxPosition, fallbackPosition) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackPosition;
  return Math.max(1, Math.min(maxPosition, Math.floor(parsed)));
}

function resequence(items = []) {
  return items.map((item, index) => ({
    ...item,
    order: index + 1,
  }));
}

export function compactOrder(items = []) {
  return resequence(sortByOrderThenId(items));
}

export function insertAtOrder(items = [], newItem, desiredOrder) {
  const sorted = sortByOrderThenId(items);
  const maxPosition = sorted.length + 1;
  const position = normalizePosition(desiredOrder, maxPosition, maxPosition);
  sorted.splice(position - 1, 0, newItem);
  return resequence(sorted);
}

export function replaceAtOrder(items = [], updatedItem, desiredOrder) {
  const others = sortByOrderThenId(
    items.filter((item) => Number(item.id) !== Number(updatedItem.id))
  );
  const maxPosition = others.length + 1;
  const fallbackPosition = Number.isFinite(Number(updatedItem.order))
    ? Math.max(1, Math.min(maxPosition, Number(updatedItem.order)))
    : maxPosition;
  const position = normalizePosition(desiredOrder, maxPosition, fallbackPosition);

  others.splice(position - 1, 0, updatedItem);
  return resequence(others);
}
