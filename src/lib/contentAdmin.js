import "server-only";
import {
  collectAssetKeysFromStore,
  createAssetId,
  normalizeCategories,
  parseOptionalDate,
  slugify,
  sortByOrderThenId,
} from "@/lib/contentStore";
import { resolveFeaturedSlots, toSlotIndex } from "@/lib/featuredLayout";

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
  if (normalized === "portrait") return "portrait";
  if (normalized === "square") return "square";
  return "landscape";
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

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

// slugify() strips accents through NFD, but "đ"/"Đ" do not decompose, so
// "Đà Lạt" used to become "a-lat". Map them to "d" first.
export function toSlug(value = "") {
  return slugify(String(value ?? "").replace(/đ/g, "d").replace(/Đ/g, "D"));
}

// Slug a stored record is reachable under (the public serializers fall back
// to the title when the stored slug is empty).
function effectiveSlug(item) {
  return String(item?.slug || "") || slugify(item?.title || "");
}

// `baseSlug` if no OTHER record of the collection uses it, else the first
// free "<baseSlug>-2", "<baseSlug>-3", … `excludeId` is the record being
// edited (its own slug never counts as taken).
export function makeUniqueSlug(baseSlug, items = [], { excludeId = null } = {}) {
  const base = String(baseSlug || "").trim();
  if (!base) return "";
  const excluded =
    excludeId === null || excludeId === undefined || excludeId === ""
      ? null
      : Number(excludeId);
  const taken = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    if (excluded !== null && Number(item.id) === excluded) continue;
    const slug = effectiveSlug(item);
    if (slug) taken.add(slug);
  }
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

// Final slug for a create / update:
//   requested slug → else the title → else the record's current slug →
//   else "<fallbackPrefix>-<id>", then made unique within `items`.
// A record that keeps its current slug unchanged is left alone even when a
// legacy duplicate exists elsewhere: renaming it on an unrelated edit would
// silently move a live public URL. "Current" is the slug the public site
// uses today: for a legacy record with an empty stored slug that is
// slugify(title) (no "đ" mapping), so an untouched edit keeps that URL.
export function resolveRecordSlug({
  requested,
  title,
  currentItem = null,
  id = null,
  items = [],
  fallbackPrefix = "video",
} = {}) {
  const recordId = id ?? currentItem?.id ?? null;
  const candidate =
    toSlug(normalizeText(requested)) ||
    toSlug(normalizeText(title)) ||
    toSlug(normalizeText(currentItem?.slug)) ||
    (recordId !== null && recordId !== undefined && recordId !== ""
      ? `${fallbackPrefix}-${recordId}`
      : fallbackPrefix);
  if (currentItem && candidate === effectiveSlug(currentItem)) return candidate;
  return makeUniqueSlug(candidate, items, { excludeId: recordId });
}

// `options.id` = id the record is (or will be) saved under; the create
// routes pass the id they are about to assign so an empty slug can fall
// back to "video-<id>".
export function normalizeProjectPayload(payload, store, currentItem = null, options = {}) {
  const now = new Date().toISOString();

  const title = normalizeText(payload.title, currentItem?.title || "");
  // Unique within store.projects (another video's slug gets "-2", "-3", …).
  const slug = resolveRecordSlug({
    requested: payload.slug,
    title,
    currentItem,
    id: options?.id ?? currentItem?.id ?? null,
    items: store?.projects,
    fallbackPrefix: "video",
  });
  const featured = normalizeBoolean(payload.featured ?? currentItem?.featured);

  return {
    title,
    slug,
    client: normalizeText(payload.client, currentItem?.client || ""),
    tagline: normalizeText(payload.tagline, currentItem?.tagline || ""),
    category: normalizeText(payload.category, currentItem?.category || ""),
    categories: normalizeCategories(payload.categories ?? currentItem?.categories ?? []),
    featured,
    order: normalizeNumber(payload.order ?? currentItem?.order),
    // Pinned cell on the homepage featured grid, written by the admin
    // layout panel through /api/admin/projects/reorder. The edit form
    // never sends it, so an edit keeps the existing pin; un-featuring a
    // project releases its cell.
    featuredSlot: featured
      ? toSlotIndex(payload.featuredSlot ?? currentItem?.featuredSlot)
      : null,
    duration: normalizeText(payload.duration, currentItem?.duration || ""),
    orientation: normalizeOrientation(payload.orientation ?? currentItem?.orientation),
    description: normalizeText(payload.description, currentItem?.description || ""),
    fullDescription: normalizeText(payload.fullDescription, currentItem?.fullDescription || ""),
    completionDate: parseOptionalDate(payload.completionDate ?? currentItem?.completionDate),
    media: normalizeAssetInput(payload.media ?? currentItem?.media, store, now),
    // `preview` is the optional WebM (VP9, no audio) used in the homepage
    // featured gallery. Falls back to `media` at render time so existing
    // projects without a preview keep working unchanged.
    preview: normalizeAssetInput(payload.preview ?? currentItem?.preview, store, now),
    // `adminRating` is a private 0–5 score the admin assigns to mark
    // their favourites. Used only inside the admin "Video Khác" tab for
    // sorting; never serialised to the public /api/projects payload, so
    // homepage / videos page can't expose it accidentally.
    adminRating: normalizeNumber(payload.adminRating ?? currentItem?.adminRating),
    thumbnail: normalizeAssetInput(payload.thumbnail ?? currentItem?.thumbnail, store, now),
    createdAt: currentItem?.createdAt || now,
    updatedAt: now,
    publishedAt: currentItem?.publishedAt || now,
  };
}

// `options.id`: see normalizeProjectPayload.
export function normalizeImageProjectPayload(payload, store, currentItem = null, options = {}) {
  const now = new Date().toISOString();

  const title = normalizeText(payload.title, currentItem?.title || "");
  // Unique within store.imageProjects; empty → "anh-<id>".
  const slug = resolveRecordSlug({
    requested: payload.slug,
    title,
    currentItem,
    id: options?.id ?? currentItem?.id ?? null,
    items: store?.imageProjects,
    fallbackPrefix: "anh",
  });

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

// ---------------------------------------------------------------------------
// Trash ("Thùng rác")
// ---------------------------------------------------------------------------

// error.code values thrown by restoreRecordFromTrash; the trash routes turn
// them into 404 / 400 answers.
export const TRASH_NOT_FOUND_CODE = "TRASH_NOT_FOUND";
export const TRASH_ASSET_RESTORE_CODE = "TRASH_ASSET_RESTORE";

function trashError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// The pinned featured-grid cell a restored video may keep: only when it is
// featured, the grid still uses pins (it has gaps — a dense grid stores no
// pins, see lib/featuredLayout.js) and nothing sits in that cell now (e.g.
// an immediate "Hoàn tác"). An empty cell means no unpinned video was
// placed at or past it either, so keeping the pin moves nobody. Otherwise
// null: it flows into the lowest free cell.
function keptFeaturedSlot(record, items) {
  const slot = toSlotIndex(record?.featuredSlot);
  if (!record?.featured || slot === null) return null;
  const others = items.filter(
    (item) => item?.featured && Number(item.id) !== Number(record.id)
  );
  if (!others.some((item) => toSlotIndex(item.featuredSlot) !== null)) return null;
  return resolveFeaturedSlots(others)[slot] ? null : slot;
}

// Puts a deleted video / image project (a store.trash entry) back into its
// collection, on the store draft of an updateStore() mutator:
//   - at its old place (insertAtOrder with the stored `order`),
//   - with its slug made unique again (another record may have taken it
//     meanwhile → "<slug>-2"),
//   - still featured if it was, keeping its pinned featured-grid cell
//     (`featuredSlot`) only while that cell is still free; otherwise it
//     flows into a free cell instead of colliding with what sits there now,
//   - under its own id, or a fresh one if that id is somehow in use.
// The trash entry is removed, and so are "replaced file" entries whose file
// the restored record uses again (it is live content now). File entries
// ("asset") cannot be restored on their own (their content lives in
// history snapshots).
// Returns { entry, record, collection, slugChanged, previousSlug }.
export function restoreRecordFromTrash(store, entryId, { now = new Date() } = {}) {
  const trash = Array.isArray(store.trash) ? store.trash : [];
  const index = trash.findIndex((entry) => entry && entry.id === entryId);
  if (index === -1) {
    throw trashError(TRASH_NOT_FOUND_CODE, `Trash entry ${entryId} not found.`);
  }
  const entry = trash[index];
  if (entry.type !== "project" && entry.type !== "imageProject") {
    throw trashError(TRASH_ASSET_RESTORE_CODE, "A replaced file cannot be restored on its own.");
  }
  const isVideo = entry.type === "project";
  const collection = isVideo ? "projects" : "imageProjects";
  const counterKey = isVideo ? "nextProjectId" : "nextImageProjectId";
  const items = Array.isArray(store[collection]) ? store[collection] : [];
  const record = structuredClone(entry.record);

  let id = Number(record.id);
  if (!Number.isInteger(id) || id <= 0 || items.some((item) => Number(item?.id) === id)) {
    id = Number(store[counterKey]) > 0 ? Number(store[counterKey]) : 1;
  }
  // Id counters never fall behind an id in use.
  store[counterKey] = Math.max(Number(store[counterKey]) || 1, id + 1);
  record.id = id;

  const previousSlug = effectiveSlug(record);
  const baseSlug = previousSlug || `${isVideo ? "video" : "anh"}-${id}`;
  record.slug = makeUniqueSlug(baseSlug, items, { excludeId: id });
  if (isVideo) record.featuredSlot = keptFeaturedSlot(record, items);
  const when = now instanceof Date ? now : new Date(now);
  record.updatedAt = Number.isNaN(when.getTime())
    ? new Date().toISOString()
    : when.toISOString();

  store[collection] = insertAtOrder(items, record, record.order);
  const live = new Set(collectAssetKeysFromStore(store, { includeTrash: false }));
  store.trash = trash.filter(
    (item, position) =>
      position !== index && !(item?.type === "asset" && live.has(item.key))
  );
  return {
    entry,
    record: store[collection].find((item) => Number(item.id) === id) || record,
    collection,
    slugChanged: record.slug !== previousSlug,
    previousSlug,
  };
}
