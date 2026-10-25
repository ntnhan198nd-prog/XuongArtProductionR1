import "server-only";
import path from "node:path";
import crypto from "node:crypto";
import {
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { deleteR2Keys, getR2Client, getR2Config, validateR2Config } from "@/lib/r2";
import { toSlotIndex } from "@/lib/featuredLayout";
import {
  HISTORY_PREFIX,
  buildHistoryKey,
  normalizeStoreRevision,
  normalizeStoreUpdatedAt,
  parseHistoryKey,
  selectSnapshotsToPrune,
  toCompactTimestamp,
} from "@/lib/contentHistory";

// Single JSON object on R2 acts as the content store. Writing to the
// repository filesystem is not viable on Vercel (read-only at runtime),
// and R2 is already provisioned for media so it doubles as cheap durable
// state for the admin.
export const STORE_KEY = "_admin/content.json";

// Thrown (as error.code) when _admin/content.json exists but is not a JSON
// object. lib/apiErrors.js turns it into a Vietnamese message pointing the
// admin at the "Lịch sử" tab.
export const STORE_CORRUPT_CODE = "STORE_CORRUPT";
const CORRUPT_COPY_PREFIX = "_admin/content.corrupt-";
// Restore/start-empty over a corrupt store is refused (this code) when the
// corrupt bytes could not be copied aside, so they are never overwritten
// while they are the only copy.
const CORRUPT_COPY_FAILED_CODE = "CORRUPT_COPY_FAILED";

// Fresh object per call so callers can never share/mutate the arrays.
function emptyStore() {
  return {
    projects: [],
    imageProjects: [],
    showreel: null,
    site: null,
    nextProjectId: 1,
    nextImageProjectId: 1,
    nextAssetId: 1,
    updatedAt: null,
    revision: 0,
    trash: [],
  };
}

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeShowreel(value) {
  if (!value || typeof value !== "object") return null;
  const url = typeof value.url === "string" ? value.url.trim() : "";
  if (!url) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    url,
    key: str(value.key),
    name: str(value.name),
    mime: str(value.mime),
    size: num(value.size),
    width: num(value.width),
    height: num(value.height),
    duration: num(value.duration),
    updatedAt: str(value.updatedAt) || new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Trash ("Thùng rác") — shape and normalization
// ---------------------------------------------------------------------------
//
// Deleting a video / image project, or replacing / removing a file (video,
// photo, thumbnail, showreel, logo, founder photo…) no longer deletes
// anything from R2 straight away. The record or file goes into
// `store.trash` and only leaves R2 TRASH_KEEP_DAYS later (or when the
// admin deletes it for good from the "Thùng rác" tab):
//   { id, type: "project" | "imageProject", label, source, deletedAt,
//     expiresAt, record }          — a deleted record, restorable as-is
//   { id, type: "asset", label, source, deletedAt, expiresAt,
//     key, size, mime, url, name } — a replaced / removed file
// Replaced files are kept so older content can be put back from the
// "Lịch sử" tab with its media intact. `store.trash` is a separate array:
// the public serializers / routes never read it.

export const TRASH_KEEP_DAYS = 30;
const TRASH_DAY_MS = 24 * 60 * 60 * 1000;
const TRASH_TYPES = new Set(["project", "imageProject", "asset"]);
const UNTITLED = "(Chưa có tiêu đề)";

function trashString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function trashNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function toIsoTime(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Max time a JS Date can hold; a hand-edited far-future date must never
// make toISOString() throw while the store is being read.
const MAX_DATE_MS = 8.64e15;

function addTrashDays(iso, days = TRASH_KEEP_DAYS) {
  const ms = new Date(iso).getTime() + days * TRASH_DAY_MS;
  return Number.isFinite(ms) && Math.abs(ms) <= MAX_DATE_MS ? new Date(ms).toISOString() : iso;
}

function normalizeTrashEntry(entry, fallbackNow) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const id = trashString(entry.id);
  const type = TRASH_TYPES.has(entry.type) ? entry.type : null;
  if (!id || !type) return null;
  // An unreadable time keeps the entry (and its files) for a full period
  // rather than dropping it: losing track of a file is worse than keeping
  // it a little longer.
  const deletedAt = toIsoTime(entry.deletedAt) || fallbackNow;
  const expiresAt = toIsoTime(entry.expiresAt) || addTrashDays(deletedAt);
  const base = {
    id,
    type,
    label: trashString(entry.label) || (type === "asset" ? "File" : UNTITLED),
    source: trashString(entry.source),
    deletedAt,
    expiresAt,
  };
  if (type === "asset") {
    const key = trashString(entry.key);
    if (!key) return null;
    return {
      ...base,
      key,
      size: trashNumber(entry.size),
      mime: trashString(entry.mime),
      url: trashString(entry.url),
      name: trashString(entry.name),
    };
  }
  const record = entry.record;
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  return { ...base, record };
}

function normalizeTrash(value) {
  if (!Array.isArray(value)) return [];
  const fallbackNow = new Date().toISOString();
  const seen = new Set();
  const list = [];
  for (const item of value) {
    const entry = normalizeTrashEntry(item, fallbackNow);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    list.push(entry);
  }
  return list;
}

let writeQueue = Promise.resolve();

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStore(store = {}) {
  return {
    projects: ensureArray(store.projects),
    imageProjects: ensureArray(store.imageProjects),
    showreel: normalizeShowreel(store.showreel),
    // site stays as a raw object on the store; the normalizer with defaults
    // lives in lib/siteContent.js so the frontend always sees a complete shape.
    site: store.site && typeof store.site === "object" && !Array.isArray(store.site) ? store.site : null,
    nextProjectId: Number(store.nextProjectId) > 0 ? Number(store.nextProjectId) : 1,
    nextImageProjectId:
      Number(store.nextImageProjectId) > 0 ? Number(store.nextImageProjectId) : 1,
    nextAssetId: Number(store.nextAssetId) > 0 ? Number(store.nextAssetId) : 1,
    // When the store was last written (ISO) and a write counter; both are
    // set by writeStoreInternal and shown in the admin "Lịch sử" tab.
    updatedAt: normalizeStoreUpdatedAt(store.updatedAt),
    revision: normalizeStoreRevision(store.revision),
    // Deleted records and replaced files waiting TRASH_KEEP_DAYS before
    // they leave R2 (see the Trash section below).
    trash: normalizeTrash(store.trash),
  };
}

export function isMissingObjectError(error) {
  if (!error) return false;
  // A missing *bucket* also comes back as HTTP 404 — but that is a
  // configuration error (wrong R2_BUCKET / wrong account), not "first boot".
  // Treating it as an empty store would silently show a blank admin and hide
  // the misconfiguration, so let it propagate to the route's error handler.
  if (error.name === "NoSuchBucket" || error.Code === "NoSuchBucket") return false;
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

// A parsed store must be a plain JSON object; "null", arrays, numbers or
// unparseable text all count as corrupt.
function parseStoreJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// CopySource is "<bucket>/<key>" with each key segment URL-encoded.
function copySourceFor(bucket, key) {
  return `${bucket}/${String(key).split("/").map(encodeURIComponent).join("/")}`;
}

// Server-side copy of content.json to `key`. If CopyObject is refused
// (S3-compatibility quirks), fall back to uploading the exact bytes we just
// read — the same PutObject the store itself uses.
async function copyStoreObject(r2, bucket, key, raw) {
  try {
    await r2.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: key,
        CopySource: copySourceFor(bucket, STORE_KEY),
      })
    );
  } catch (copyError) {
    if (typeof raw !== "string") throw copyError;
    console.error(
      `[contentStore] CopyObject to ${key} failed, uploading the bytes instead:`,
      copyError?.message || copyError
    );
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: raw,
        ContentType: "application/json; charset=utf-8",
        CacheControl: "no-store",
      })
    );
  }
}

// Corrupt-store copies already made by this process (object version →
// copy key), so every public page view does not issue another CopyObject.
const preservedCorruptVersions = new Map();

// Best-effort copy of the corrupt bytes to content.corrupt-<stamp>.json.
// Returns { key, preserved } — preserved=false when the copy failed.
async function preserveCorruptStore(r2, bucket, result, raw) {
  const modified =
    result?.LastModified instanceof Date && !Number.isNaN(result.LastModified.getTime())
      ? result.LastModified
      : null;
  const version = String(result?.ETag || modified?.toISOString() || "");
  if (version && preservedCorruptVersions.has(version)) {
    return { key: preservedCorruptVersions.get(version), preserved: true };
  }
  // Named after the corrupt object's own LastModified so repeated copies
  // (other instances, retries) overwrite one file instead of piling up.
  const stamp = (modified || new Date()).toISOString().replace(/[:.]/g, "-");
  const key = `${CORRUPT_COPY_PREFIX}${stamp}.json`;
  try {
    await copyStoreObject(r2, bucket, key, raw);
    if (version) preservedCorruptVersions.set(version, key);
    console.error(`[contentStore] ${STORE_KEY} is corrupt — kept a copy at ${key}.`);
    return { key, preserved: true };
  } catch (error) {
    console.error(
      `[contentStore] ${STORE_KEY} is corrupt and copying it to ${key} failed:`,
      error?.message || error
    );
    return { key, preserved: false };
  }
}

// Largest value of `"<field>": <int>` anywhere in (possibly truncated or
// garbled) store text. Used to keep id counters ahead of anything the
// corrupt store may have handed out.
const MAX_SANE_COUNTER = 1e9;
function scanMaxInt(raw, field) {
  if (typeof raw !== "string" || !raw) return 0;
  const pattern = new RegExp(`"${field}"\\s*:\\s*"?(\\d{1,10})`, "g");
  let max = 0;
  for (const match of raw.matchAll(pattern)) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value < MAX_SANE_COUNTER && value > max) max = value;
  }
  return max;
}

// Reads the store plus whether the object exists at all (a history
// snapshot only makes sense when there is something to copy).
async function readStoreWithMeta() {
  assertR2Configured();
  const { bucket } = getR2Config();
  const r2 = getR2Client();

  let result;
  try {
    result = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: STORE_KEY }));
  } catch (error) {
    if (isMissingObjectError(error)) {
      // First boot in an environment that has never written the store.
      return { store: emptyStore(), exists: false, raw: null };
    }
    throw error;
  }

  const raw = await result.Body.transformToString("utf-8");
  const parsed = parseStoreJson(raw);
  if (!parsed) {
    // Corrupt JSON. This used to "repair" itself by writing an EMPTY store,
    // which silently wiped the whole site. Never do that: keep a copy of the
    // bad bytes and fail loudly. Public pages fall back to built-in defaults
    // on a throw; the admin restores a good version from the history tab.
    const copy = await preserveCorruptStore(r2, bucket, result, raw);
    const error = storeError(
      STORE_CORRUPT_CODE,
      `${STORE_KEY} is not a valid JSON object (content store is corrupt).`
    );
    error.corruptCopyKey = copy.key;
    error.corruptPreserved = copy.preserved;
    // Non-enumerable so route error logs do not dump the whole file.
    Object.defineProperty(error, "rawStore", { value: raw, enumerable: false });
    throw error;
  }
  return { store: normalizeStore(parsed), exists: true, raw };
}

async function readStoreInternal() {
  const { store } = await readStoreWithMeta();
  return store;
}

async function writeStoreInternal(store, previousRevision = 0) {
  assertR2Configured();
  const normalized = normalizeStore({
    ...store,
    updatedAt: new Date().toISOString(),
    revision: normalizeStoreRevision(previousRevision) + 1,
  });
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

// Same content apart from the write bookkeeping fields?
function sameContent(a, b) {
  const strip = (store) => {
    const copy = { ...store };
    delete copy.updatedAt;
    delete copy.revision;
    return copy;
  };
  try {
    return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
  } catch {
    return false;
  }
}

function resolveDetail(detail) {
  try {
    const value = typeof detail === "function" ? detail() : detail;
    return value === null || value === undefined ? "" : String(value);
  } catch {
    return "";
  }
}

// Server-side copy of the current content.json into the history folder.
// Returns the snapshot key, or null when the copy failed — a failed snapshot
// is logged but must never block the admin's save.
async function snapshotCurrentStore(action, detail, raw) {
  let key = null;
  try {
    key = buildHistoryKey(new Date(), action, resolveDetail(detail));
    const { bucket } = getR2Config();
    await copyStoreObject(getR2Client(), bucket, key, raw);
    return key;
  } catch (error) {
    console.error(
      `[contentStore] history snapshot ${key || "(no key)"} failed — saving anyway:`,
      error?.message || error
    );
    return null;
  }
}

async function listHistoryObjects() {
  assertR2Configured();
  const { bucket } = getR2Config();
  const r2 = getR2Client();
  const objects = [];
  let continuationToken;
  // Retention keeps ~80 objects; the page cap only guards against a
  // misbehaving endpoint looping forever.
  for (let page = 0; page < 50; page += 1) {
    const result = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: HISTORY_PREFIX,
        MaxKeys: 1000,
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      })
    );
    for (const item of result?.Contents || []) {
      if (item?.Key) objects.push(item);
    }
    if (!result?.IsTruncated || !result?.NextContinuationToken) break;
    continuationToken = result.NextContinuationToken;
  }
  return objects;
}

// Id counters a store written over a corrupt one must start from. The
// corrupt file's own last state is unknown, so take the largest counters /
// ids still readable in its text, and the newest history snapshots plus a
// margin (ids handed out by saves after the newest snapshot). Skipping ids
// is harmless; reusing one is not.
const CORRUPT_PROJECT_ID_MARGIN = 10;
const CORRUPT_ASSET_ID_MARGIN = 1000;
const CORRUPT_SNAPSHOTS_TO_SCAN = 3;

async function idFloorForCorruptStore(raw) {
  const anyId = scanMaxInt(raw, "id") + 1;
  const floor = {
    nextProjectId: Math.max(1, scanMaxInt(raw, "nextProjectId"), anyId),
    nextImageProjectId: Math.max(1, scanMaxInt(raw, "nextImageProjectId"), anyId),
    nextAssetId: Math.max(1, scanMaxInt(raw, "nextAssetId"), anyId),
    revision: scanMaxInt(raw, "revision"),
  };
  try {
    const newest = (await listHistory()).slice(0, CORRUPT_SNAPSHOTS_TO_SCAN);
    for (const entry of newest) {
      try {
        const snap = await readHistorySnapshot(entry.key);
        floor.nextProjectId = Math.max(
          floor.nextProjectId,
          snap.nextProjectId + CORRUPT_PROJECT_ID_MARGIN,
          maxNumericId(snap.projects) + 1 + CORRUPT_PROJECT_ID_MARGIN
        );
        floor.nextImageProjectId = Math.max(
          floor.nextImageProjectId,
          snap.nextImageProjectId + CORRUPT_PROJECT_ID_MARGIN,
          maxNumericId(snap.imageProjects) + 1 + CORRUPT_PROJECT_ID_MARGIN
        );
        floor.nextAssetId = Math.max(
          floor.nextAssetId,
          snap.nextAssetId + CORRUPT_ASSET_ID_MARGIN,
          maxAssetId(snap) + 1 + CORRUPT_ASSET_ID_MARGIN
        );
        floor.revision = Math.max(floor.revision, snap.revision + 1);
      } catch (error) {
        console.error(
          `[contentStore] could not read ${entry.key} for id counters:`,
          error?.message || error
        );
      }
    }
  } catch (error) {
    console.error("[contentStore] could not list history for id counters:", error?.message || error);
  }
  return floor;
}

const PRUNE_MAX_PER_RUN = 200;

// Best-effort retention (see selectSnapshotsToPrune). Never throws.
// Deletes go through deleteR2Keys (one DeleteObject per key, the call this
// codebase already uses against R2) rather than a batch DeleteObjects.
async function pruneHistory() {
  try {
    const entries = (await listHistoryObjects())
      .map((item) => parseHistoryKey(item.Key))
      .filter(Boolean);
    const doomed = selectSnapshotsToPrune(entries, Date.now()).slice(0, PRUNE_MAX_PER_RUN);
    if (doomed.length > 0) await deleteR2Keys(doomed);
  } catch (error) {
    console.error("[contentStore] history prune failed:", error?.message || error);
  }
}

function runUpdate(mutator, { action = "unknown", detail, allowCorruptCurrent = false } = {}) {
  // Why the .catch(): without it, a single failure (R2 timeout, mutator
  // throwing, JSON corruption) leaves writeQueue as a rejected promise.
  // Every subsequent updateStore() does writeQueue.then(...) which on a
  // rejected promise propagates the original rejection without ever running
  // the new callback — so all admin saves stay broken until the process
  // restarts. Catching here keeps the queue chain healthy while the
  // returned promise still surfaces this call's error to its caller.
  const next = writeQueue.then(async () => {
    let current;
    let exists;
    let raw = null;
    let corrupt = false;
    try {
      ({ store: current, exists, raw } = await readStoreWithMeta());
    } catch (error) {
      if (!allowCorruptCurrent || error?.code !== STORE_CORRUPT_CODE) throw error;
      // Only an explicit admin action (history restore / start empty) may
      // write over a corrupt store, and only once the bad bytes are safely
      // kept as content.corrupt-*.json: they cannot go into history (not
      // valid JSON), so that copy is the only way back to them.
      if (!error.corruptPreserved) {
        throw storeError(
          CORRUPT_COPY_FAILED_CODE,
          `Could not keep a copy of the corrupt ${STORE_KEY}; refusing to overwrite it.`
        );
      }
      corrupt = true;
      current = { ...emptyStore(), ...(await idFloorForCorruptStore(error.rawStore)) };
      exists = false;
    }
    const draft = structuredClone(current);
    const maybeUpdated = await mutator(draft, { corrupt });
    const nextStore = normalizeStore(maybeUpdated ?? draft);

    // Snapshot the state right BEFORE this action (skipped when the store
    // does not exist yet, or when the save changes nothing — e.g. pressing
    // Save twice — so history is not flooded with identical copies).
    let snapshotKey = null;
    if (exists && !sameContent(current, nextStore)) {
      snapshotKey = await snapshotCurrentStore(action, detail, raw);
    }

    const saved = await writeStoreInternal(
      nextStore,
      Math.max(current.revision, nextStore.revision)
    );
    return { saved, snapshotKey };
  });
  writeQueue = next.catch(() => {});
  return next;
}

// mutator(draft) edits the draft (or returns a replacement). `action` /
// `detail` name the change for the history tab (see HISTORY_ACTION_LABELS
// in lib/contentHistory.js); `detail` may be a function, evaluated after the
// mutator ran (e.g. the id of a project the mutator just created).
export async function updateStore(mutator, { action = "unknown", detail } = {}) {
  const { saved, snapshotKey } = await runUpdate(mutator, { action, detail });
  // Outside the queue so pruning never delays the next save.
  if (snapshotKey) await pruneHistory();
  return saved;
}

// Explicit way out when content.json is corrupt and there is no history
// to restore from: write a fresh empty store (id counters kept ahead of the
// corrupt file and of history). Refused when the store is NOT corrupt, and
// when the corrupt bytes could not be copied aside. No R2 media is deleted.
export async function startEmptyAfterCorruption() {
  const { saved } = await runUpdate(
    (current, { corrupt }) => {
      if (!corrupt) {
        throw storeError("NOT_CORRUPT", `${STORE_KEY} is readable; nothing to start over from.`);
      }
      return {
        ...emptyStore(),
        nextProjectId: current.nextProjectId,
        nextImageProjectId: current.nextImageProjectId,
        nextAssetId: current.nextAssetId,
        revision: current.revision,
      };
    },
    { action: "history.start-empty", allowCorruptCurrent: true }
  );
  return saved;
}

// Newest first: [{ key, createdAt, action, detail, size }].
export async function listHistory() {
  const objects = await listHistoryObjects();
  return objects
    .map((item) => {
      const entry = parseHistoryKey(item.Key);
      if (!entry) return null;
      const size = Number(item.Size);
      return { ...entry, size: Number.isFinite(size) ? size : null };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
    });
}

// Raw bytes of one snapshot (for the download route). Throws code BAD_KEY
// for anything that is not a history key, NOT_FOUND when it is gone.
export async function readHistorySnapshotRaw(key) {
  const entry = parseHistoryKey(key);
  if (!entry) throw storeError("BAD_KEY", "Invalid history snapshot key.");
  assertR2Configured();
  const { bucket } = getR2Config();
  let result;
  try {
    result = await getR2Client().send(new GetObjectCommand({ Bucket: bucket, Key: entry.key }));
  } catch (error) {
    if (isMissingObjectError(error)) {
      throw storeError("NOT_FOUND", "History snapshot not found.");
    }
    throw error;
  }
  const raw = await result.Body.transformToString("utf-8");
  return { entry, raw };
}

export async function readHistorySnapshot(key) {
  const { raw } = await readHistorySnapshotRaw(key);
  const parsed = parseStoreJson(raw);
  if (!parsed) {
    throw storeError("SNAPSHOT_CORRUPT", "History snapshot is not a valid JSON object.");
  }
  return normalizeStore(parsed);
}

function maxNumericId(items) {
  let max = 0;
  for (const item of ensureArray(items)) {
    const id = Number(item?.id);
    if (Number.isFinite(id) && id > max) max = id;
  }
  return max;
}

function maxAssetId(store) {
  const assets = [];
  for (const project of ensureArray(store?.projects)) {
    assets.push(project?.media, project?.preview, project?.thumbnail);
  }
  for (const project of ensureArray(store?.imageProjects)) {
    assets.push(...ensureArray(project?.media), project?.thumbnail);
  }
  return maxNumericId(assets.filter(Boolean));
}

// Put the whole content back to a history snapshot. Goes through the normal
// write queue, so the current state is itself snapshotted first (a restore
// can be undone). Id counters never move backwards, so ids handed out after
// the snapshot are never reused. Does NOT touch any R2 media: trash entries
// and files the current content uses are carried into the restored store
// (see carryTrashAcrossRestore) so they still leave R2 after
// TRASH_KEEP_DAYS instead of lingering unreferenced.
export async function restoreHistorySnapshot(key) {
  const entry = parseHistoryKey(key);
  if (!entry) throw storeError("BAD_KEY", "Invalid history snapshot key.");
  const snapshot = await readHistorySnapshot(entry.key);

  const { saved, snapshotKey } = await runUpdate(
    (current) => {
      const restored = structuredClone(snapshot);
      restored.nextProjectId = Math.max(
        current.nextProjectId,
        snapshot.nextProjectId,
        maxNumericId(current.projects) + 1,
        maxNumericId(snapshot.projects) + 1
      );
      restored.nextImageProjectId = Math.max(
        current.nextImageProjectId,
        snapshot.nextImageProjectId,
        maxNumericId(current.imageProjects) + 1,
        maxNumericId(snapshot.imageProjects) + 1
      );
      restored.nextAssetId = Math.max(
        current.nextAssetId,
        snapshot.nextAssetId,
        maxAssetId(current) + 1,
        maxAssetId(snapshot) + 1
      );
      // Keep the write counter monotonic even when restoring over a
      // corrupt (unreadable) store.
      restored.revision = Math.max(current.revision, snapshot.revision);
      carryTrashAcrossRestore(current, restored, Date.now());
      return restored;
    },
    {
      action: "history.restore",
      detail: toCompactTimestamp(entry.createdAt),
      allowCorruptCurrent: true,
    }
  );
  if (snapshotKey) await pruneHistory();
  return saved;
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
  // Match YYYY-MM-DD shape, then verify the date round-trips through Date()
  // so impossible values like 2026-13-45 are rejected (regex alone passes
  // them).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== value) return null;
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

// Collect every R2 storage key referenced by a project/image-project/site
// snapshot, so the route handlers can compute "old keys minus new keys" and
// delete the leftovers when content is replaced. Missing/empty keys are
// filtered out so callers can safely pass a partially-populated record.
export function collectAssetKeysFromProject(project) {
  if (!project) return [];
  const keys = [];
  if (project.media?.key) keys.push(project.media.key);
  // `preview` is a first-class uploaded R2 asset (its own key). Without it
  // here, deleting/replacing a project's preview WebM orphans the old object
  // in the bucket forever, since the cleanup diff never sees its key.
  if (project.preview?.key) keys.push(project.preview.key);
  if (project.thumbnail?.key) keys.push(project.thumbnail.key);
  return keys.filter(Boolean);
}

export function collectAssetKeysFromImageProject(project) {
  if (!project) return [];
  const keys = [];
  if (Array.isArray(project.media)) {
    for (const asset of project.media) {
      if (asset?.key) keys.push(asset.key);
    }
  }
  if (project.thumbnail?.key) keys.push(project.thumbnail.key);
  return keys.filter(Boolean);
}

export function collectAssetKeysFromSite(site) {
  if (!site || typeof site !== "object") return [];
  const keys = [];
  const strategicBrands = site.clients?.strategicBrands;
  if (Array.isArray(strategicBrands)) {
    for (const brand of strategicBrands) {
      if (brand?.logoKey) keys.push(brand.logoKey);
    }
  }
  if (site.services?.image?.key) keys.push(site.services.image.key);
  if (site.about?.founder?.photo?.key) keys.push(site.about.founder.photo.key);
  return keys.filter(Boolean);
}

// Every R2 media key a whole store references (deduplicated): videos,
// image projects, showreel and site images, then — unless
// `includeTrash: false` — every key held by a trash entry (deleted records
// and replaced files). Cleanup code (r2/cleanup, trash purge, orphan scans)
// relies on the default so it never deletes live OR trashed media. The
// history tab uses it to tell which media of an old snapshot are gone.
export function collectAssetKeysFromStore(store, { includeTrash = true } = {}) {
  if (!store || typeof store !== "object") return [];
  // Most visible first: the history tab only HEADs the first N keys, so
  // the showreel, site images and videos must not sit behind hundreds of
  // image-project photos.
  const keys = [];
  if (store.showreel?.key) keys.push(store.showreel.key);
  keys.push(...collectAssetKeysFromSite(store.site));
  for (const project of ensureArray(store.projects)) {
    keys.push(...collectAssetKeysFromProject(project));
  }
  for (const project of ensureArray(store.imageProjects)) {
    if (project?.thumbnail?.key) keys.push(project.thumbnail.key);
  }
  for (const project of ensureArray(store.imageProjects)) {
    keys.push(...collectAssetKeysFromImageProject(project));
  }
  // Last, so the history tab's capped check still covers live media first.
  if (includeTrash) {
    for (const entry of ensureArray(store.trash)) {
      keys.push(...collectAssetKeysFromTrashEntry(entry));
    }
  }
  return [...new Set(keys.filter((key) => typeof key === "string" && key.trim()))];
}

// ---------------------------------------------------------------------------
// Trash ("Thùng rác") — operations
// ---------------------------------------------------------------------------
// All of these mutate the store draft handed to an updateStore() mutator.
// They never touch R2 themselves: a route deletes the keys a purge returns
// only AFTER the store write succeeded.

export function collectAssetKeysFromTrashEntry(entry) {
  if (!entry || typeof entry !== "object") return [];
  if (entry.type === "asset") {
    const key = trashString(entry.key);
    return key ? [key] : [];
  }
  if (entry.type === "project") return collectAssetKeysFromProject(entry.record);
  if (entry.type === "imageProject") return collectAssetKeysFromImageProject(entry.record);
  return [];
}

function quotedTitle(title) {
  return `“${trashString(title) || UNTITLED}”`;
}

function assetRef(asset, label, source) {
  const key = trashString(asset?.key);
  if (!key) return null;
  return {
    key,
    url: trashString(asset?.url),
    size: trashNumber(asset?.size),
    mime: trashString(asset?.mime),
    name: trashString(asset?.name),
    label,
    source,
  };
}

// R2 files of a record / the showreel / the site content, each with a
// Vietnamese label for the "Thùng rác" tab. Only files with a key.
export function collectAssetRefsFromProject(project, source = "project-media") {
  if (!project || typeof project !== "object") return [];
  const title = quotedTitle(project.title);
  return [
    assetRef(project.media, `Video cũ của ${title}`, source),
    assetRef(project.preview, `Video xem trước cũ của ${title}`, source),
    assetRef(project.thumbnail, `Ảnh thumbnail cũ của ${title}`, source),
  ].filter(Boolean);
}

export function collectAssetRefsFromImageProject(project, source = "image-project-media") {
  if (!project || typeof project !== "object") return [];
  const title = quotedTitle(project.title);
  const refs = ensureArray(project.media).map((asset) =>
    assetRef(asset, `Ảnh cũ của dự án ${title}`, source)
  );
  refs.push(assetRef(project.thumbnail, `Ảnh thumbnail cũ của dự án ${title}`, source));
  return refs.filter(Boolean);
}

export function collectAssetRefsFromShowreel(showreel, source = "showreel") {
  if (!showreel || typeof showreel !== "object") return [];
  return [assetRef(showreel, "Showreel cũ", source)].filter(Boolean);
}

export function collectAssetRefsFromSite(site, source = "site-image") {
  if (!site || typeof site !== "object") return [];
  const refs = [];
  for (const brand of ensureArray(site.clients?.strategicBrands)) {
    if (!brand?.logoKey) continue;
    const name = trashString(brand.alt);
    refs.push(
      assetRef(
        { key: brand.logoKey, url: brand.logoUrl },
        name ? `Logo khách hàng “${name}”` : "Logo khách hàng",
        source
      )
    );
  }
  refs.push(assetRef(site.services?.image, "Ảnh mục Dịch vụ", source));
  refs.push(assetRef(site.about?.founder?.photo, "Ảnh founder", source));
  return refs.filter(Boolean);
}

function collectLiveAssetRefs(store, source) {
  if (!store || typeof store !== "object") return [];
  return [
    ...collectAssetRefsFromShowreel(store.showreel, source),
    ...collectAssetRefsFromSite(store.site, source),
    ...ensureArray(store.projects).flatMap((item) => collectAssetRefsFromProject(item, source)),
    ...ensureArray(store.imageProjects).flatMap((item) =>
      collectAssetRefsFromImageProject(item, source)
    ),
  ];
}

function resolveNow(now) {
  const date = now instanceof Date ? now : new Date(now ?? Date.now());
  const ms = Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
  return { ms, iso: new Date(ms).toISOString() };
}

function shortKeyHash(value) {
  return crypto.createHash("md5").update(String(value)).digest("hex").slice(0, 10);
}

// "<type>-<record id | key hash>-<ms>", made unique within the trash.
function makeTrashId(trash, type, ref, ms) {
  const base = `${type}-${ref}-${ms}`;
  const taken = new Set(ensureArray(trash).map((entry) => entry?.id));
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

// Move a deleted project / image project into the trash exactly as it was
// stored (its `order` included, so a restore puts it back in place).
// The caller removes it from its collection. Returns the new entry.
export function addRecordToTrash(store, type, record, { now = Date.now() } = {}) {
  if (type !== "project" && type !== "imageProject") {
    throw new TypeError(`addRecordToTrash: unknown type ${type}`);
  }
  if (!record || typeof record !== "object") {
    throw new TypeError("addRecordToTrash: record is required");
  }
  if (!Array.isArray(store.trash)) store.trash = [];
  const { ms, iso } = resolveNow(now);
  const recordId = Number(record.id);
  const entry = {
    id: makeTrashId(
      store.trash,
      type,
      Number.isInteger(recordId) && recordId > 0 ? recordId : shortKeyHash(JSON.stringify(record)),
      ms
    ),
    type,
    label: trashString(record.title) || UNTITLED,
    source: type === "project" ? "projects" : "image-projects",
    deletedAt: iso,
    expiresAt: addTrashDays(iso),
    record,
  };
  store.trash.push(entry);
  return entry;
}

// Files (refs from collectAssetRefsFrom*) the content no longer uses after
// an edit / replace / delete become "asset" trash entries. Call it AFTER the
// draft holds the new content. A key the live content still uses anywhere
// (the same file kept, another record sharing it) is skipped. A key already
// held by an older "asset" entry replaces that entry, so its period starts
// again. `source` overrides the refs' own source. Returns the new entries.
export function trashUnreferencedAssets(store, refs, { now = Date.now(), source } = {}) {
  if (!Array.isArray(store.trash)) store.trash = [];
  const live = new Set(collectAssetKeysFromStore(store, { includeTrash: false }));
  const { ms, iso } = resolveNow(now);
  const added = [];
  const seen = new Set();
  for (const ref of ensureArray(refs)) {
    const key = trashString(ref?.key);
    if (!key || live.has(key) || seen.has(key)) continue;
    seen.add(key);
    store.trash = store.trash.filter((entry) => !(entry?.type === "asset" && entry.key === key));
    const entry = {
      id: makeTrashId(store.trash, "asset", shortKeyHash(key), ms),
      type: "asset",
      label: trashString(ref.label) || trashString(ref.name) || "File",
      source: trashString(source) || trashString(ref.source),
      deletedAt: iso,
      expiresAt: addTrashDays(iso),
      key,
      size: trashNumber(ref.size),
      mime: trashString(ref.mime),
      url: trashString(ref.url),
      name: trashString(ref.name),
    };
    store.trash.push(entry);
    added.push(entry);
  }
  return added;
}

// Keys among `candidates` that nothing left in the store uses (neither the
// live content nor another trash entry).
function keysSafeToDelete(store, candidates) {
  const used = new Set(collectAssetKeysFromStore(store));
  const unique = new Set(
    ensureArray(candidates).filter((key) => typeof key === "string" && key.trim())
  );
  return [...unique].filter((key) => !used.has(key));
}

export function isTrashEntryExpired(entry, now = Date.now()) {
  const expires = new Date(entry?.expiresAt).getTime();
  return Number.isFinite(expires) && expires <= resolveNow(now).ms;
}

export function hasExpiredTrash(store, now = Date.now()) {
  return ensureArray(store?.trash).some((entry) => isTrashEntryExpired(entry, now));
}

// Drops every entry past its expiresAt (gone for good) and returns the R2
// keys that are now safe to delete: held by a dropped entry and used by
// nothing left in the store. Delete them only after the store write.
export function purgeExpiredTrash(store, now = Date.now()) {
  const trash = ensureArray(store?.trash);
  const expired = trash.filter((entry) => isTrashEntryExpired(entry, now));
  if (expired.length === 0) return [];
  store.trash = trash.filter((entry) => !isTrashEntryExpired(entry, now));
  return keysSafeToDelete(store, expired.flatMap(collectAssetKeysFromTrashEntry));
}

// Deletes one entry now. Returns { entry, keys } (keys safe to delete after
// the write), or null when there is no entry with that id.
export function removeTrashEntry(store, id) {
  const trash = ensureArray(store?.trash);
  const entry = trash.find((item) => item?.id === id);
  if (!entry) return null;
  store.trash = trash.filter((item) => item !== entry);
  return { entry, keys: keysSafeToDelete(store, collectAssetKeysFromTrashEntry(entry)) };
}

export function trashDaysLeft(entry, now = Date.now()) {
  const expires = new Date(entry?.expiresAt).getTime();
  if (!Number.isFinite(expires)) return TRASH_KEEP_DAYS;
  return Math.max(0, Math.ceil((expires - resolveNow(now).ms) / TRASH_DAY_MS));
}

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|webp|gif|avif)$/i;
const VIDEO_FILE_PATTERN = /\.(mp4|webm|mov|mkv|m4v)$/i;

function previewKindOf(asset) {
  const mime = String(asset?.mime || "").toLowerCase();
  const name = String(asset?.name || asset?.key || asset?.url || "").split(/[?#]/)[0];
  if (mime.startsWith("image/") || IMAGE_FILE_PATTERN.test(name)) return "image";
  if (mime.startsWith("video/") || VIDEO_FILE_PATTERN.test(name)) return "video";
  return null;
}

function recordFiles(type, record) {
  const files =
    type === "project"
      ? [record?.media, record?.preview, record?.thumbnail]
      : [...ensureArray(record?.media), record?.thumbnail];
  const seen = new Set();
  return files.filter((asset) => {
    const id = asset && (trashString(asset.key) || trashString(asset.url));
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// One row of the "Thùng rác" tab (no full record: the list stays small).
export function describeTrashEntry(entry, now = Date.now()) {
  const base = {
    id: entry.id,
    type: entry.type,
    label: entry.label,
    source: entry.source || null,
    deletedAt: entry.deletedAt,
    expiresAt: entry.expiresAt,
    daysLeft: trashDaysLeft(entry, now),
    restorable: entry.type !== "asset",
  };
  if (entry.type === "asset") {
    const kind = previewKindOf(entry) || (entry.source === "site-image" ? "image" : null);
    return {
      ...base,
      key: entry.key,
      name: entry.name || null,
      mime: entry.mime || null,
      size: entry.size ?? null,
      fileCount: 1,
      previewUrl: kind && entry.url ? entry.url : null,
      previewKind: entry.url ? kind : null,
      recordId: null,
      title: null,
      client: null,
      featured: false,
    };
  }
  const record = entry.record || {};
  const files = recordFiles(entry.type, record);
  const sizes = files.map((asset) => trashNumber(asset.size)).filter((size) => size !== null);
  const firstMedia = Array.isArray(record.media) ? record.media[0] : record.media;
  const thumbUrl = trashString(record.thumbnail?.url);
  const mediaUrl = trashString(firstMedia?.url);
  const recordId = Number(record.id);
  return {
    ...base,
    key: null,
    name: null,
    mime: null,
    size: sizes.length > 0 ? sizes.reduce((sum, size) => sum + size, 0) : null,
    fileCount: files.length,
    previewUrl: thumbUrl || mediaUrl || null,
    previewKind: thumbUrl
      ? "image"
      : mediaUrl
      ? previewKindOf(firstMedia) || (entry.type === "project" ? "video" : "image")
      : null,
    recordId: Number.isFinite(recordId) ? recordId : null,
    title: trashString(record.title) || UNTITLED,
    client: trashString(record.client),
    featured: Boolean(record.featured),
  };
}

// `detail` of a trash.* history entry: "video-12", "anh-5" or "file"
// (see describeHistoryEntry in lib/contentHistory.js).
export function trashHistoryDetail(entry) {
  if (!entry) return "";
  if (entry.type === "asset") return "file";
  const id = Number(entry.record?.id);
  if (!Number.isInteger(id) || id <= 0) return "";
  return `${entry.type === "project" ? "video" : "anh"}-${id}`;
}

// Purges expired trash entries now (one store write, only when something
// expired) and deletes their R2 files after the write succeeded. Pass the
// store just read to skip a second read. Returns { store, purged,
// deletedFiles } — `store` is the latest known content.
export async function purgeExpiredTrashNow({ now = Date.now(), store = null } = {}) {
  const current = store || (await readStore());
  if (!hasExpiredTrash(current, now)) return { store: current, purged: 0, deletedFiles: 0 };
  let keys = [];
  let purged = 0;
  const saved = await updateStore(
    (draft) => {
      const before = ensureArray(draft.trash).length;
      keys = purgeExpiredTrash(draft, now);
      purged = before - ensureArray(draft.trash).length;
      return draft;
    },
    { action: "trash.purge-expired", detail: () => purged }
  );
  if (keys.length > 0) await deleteR2Keys(keys);
  return { store: saved, purged, deletedFiles: keys.length };
}

// Rows for the "Thùng rác" tab, newest first.
export function listTrashEntries(store, now = Date.now()) {
  return [...ensureArray(store?.trash)]
    .sort((a, b) => {
      const diff = new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime();
      if (Number.isFinite(diff) && diff !== 0) return diff;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    })
    .map((entry) => describeTrashEntry(entry, now));
}

// A history restore replaces the whole content, trash included. The
// resulting trash is built so that no file still in R2 is lost track of,
// and no file the owner was using a moment ago is deleted early:
//   - The CURRENT trash is the truth about what is waiting to be deleted:
//     its entries are kept with their own dates, except those the restored
//     content uses again (a record back live, a file back in use) — their
//     files the restored content does not use stay trashed as files.
//   - A SNAPSHOT trash entry the current trash no longer has was already
//     purged (files gone), restored, or superseded by a newer entry, so it
//     is dropped — unless what it holds is live in the current content
//     (its file, or its record): that one comes back with a full new
//     period, since it was live until this restore.
//   - Every file the current content uses that the restored content does
//     not ends up in the trash with a full new period (an entry already
//     holding it is re-stamped; otherwise a new file entry is added).
//   - Two file entries for the same key: the later expiry wins.
function carryTrashAcrossRestore(current, restored, now = Date.now()) {
  const { iso } = resolveNow(now);
  const freshExpiry = addTrashDays(iso);
  const restamp = (entry) =>
    new Date(entry.expiresAt).getTime() >= new Date(freshExpiry).getTime()
      ? entry
      : { ...entry, deletedAt: iso, expiresAt: freshExpiry };

  const currentTrash = ensureArray(current?.trash).filter(Boolean);
  const currentIds = new Set(currentTrash.map((entry) => entry.id));
  const currentLiveKeys = new Set(collectAssetKeysFromStore(current, { includeTrash: false }));
  const currentLiveIds = {
    project: new Set(ensureArray(current?.projects).map((item) => Number(item?.id))),
    imageProject: new Set(ensureArray(current?.imageProjects).map((item) => Number(item?.id))),
  };
  const restoredLiveKeys = new Set(collectAssetKeysFromStore(restored, { includeTrash: false }));
  const restoredLiveIds = {
    project: new Set(ensureArray(restored.projects).map((item) => Number(item?.id))),
    imageProject: new Set(ensureArray(restored.imageProjects).map((item) => Number(item?.id))),
  };

  const trash = [];
  for (const entry of ensureArray(restored.trash)) {
    if (!entry || currentIds.has(entry.id)) continue; // taken from current below
    if (entry.type === "asset" && restoredLiveKeys.has(entry.key)) continue;
    // A record entry comes back only for a record live now: one sharing a
    // live file (e.g. a thumbnail) is still purged / superseded — that file
    // is tracked by the "live until now" step below anyway.
    const liveNow =
      entry.type === "asset"
        ? currentLiveKeys.has(entry.key)
        : currentLiveIds[entry.type]?.has(Number(entry.record?.id));
    if (liveNow) trash.push(restamp(entry));
  }

  const leftovers = [];
  for (const entry of currentTrash) {
    if (entry.type === "asset") {
      if (!restoredLiveKeys.has(entry.key)) trash.push(entry);
      continue;
    }
    if (restoredLiveIds[entry.type]?.has(Number(entry.record?.id))) {
      // That record is back in the restored content: only its files the
      // restored version does not use stay in the trash.
      leftovers.push(
        ...(entry.type === "project"
          ? collectAssetRefsFromProject(entry.record, "history-restore")
          : collectAssetRefsFromImageProject(entry.record, "history-restore"))
      );
      continue;
    }
    trash.push(entry);
  }

  // One file entry per key: the one kept longest.
  const byKey = new Map();
  for (const entry of trash) {
    if (entry.type !== "asset") continue;
    const kept = byKey.get(entry.key);
    if (!kept || new Date(entry.expiresAt).getTime() > new Date(kept.expiresAt).getTime()) {
      byKey.set(entry.key, entry);
    }
  }
  restored.trash = trash.filter((entry) => entry.type !== "asset" || byKey.get(entry.key) === entry);

  // Files live until now that the restored content drops: re-stamp every
  // entry already holding one, trash the rest as new file entries.
  const freshKeys = new Set(
    [...currentLiveKeys].filter((key) => !restoredLiveKeys.has(key))
  );
  const held = new Set();
  restored.trash = restored.trash.map((entry) => {
    const keys = collectAssetKeysFromTrashEntry(entry);
    keys.forEach((key) => held.add(key));
    return keys.some((key) => freshKeys.has(key)) ? restamp(entry) : entry;
  });
  leftovers.push(...collectLiveAssetRefs(current, "history-restore"));
  trashUnreferencedAssets(
    restored,
    leftovers.filter((ref) => !held.has(ref.key)),
    { now }
  );
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
  const previewData = project.preview ? serializeAsset(project.preview) : null;
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
      // Absolute 0-based cell index on the homepage featured grid (6 per
      // slide). null = "flow into the first empty cell". See
      // lib/featuredLayout.js for the resolution rules.
      featuredSlot: toSlotIndex(project.featuredSlot),
      duration: project.duration || "",
      orientation: project.orientation || "landscape",
      description: project.description || "",
      fullDescription: project.fullDescription || "",
      completionDate: project.completionDate || null,
      media: {
        data: mediaData,
      },
      // `preview` mirrors `media` shape; rendered by the homepage gallery
      // when present (small WebM looped to free decoder bandwidth) and
      // falls back to `media` when absent.
      preview: {
        data: previewData,
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
