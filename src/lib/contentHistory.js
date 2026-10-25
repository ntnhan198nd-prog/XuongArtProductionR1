// Pure helpers for the content-store history ("Lịch sử" tab).
//
// Every admin save first copies the current _admin/content.json to
// _admin/history/<timestamp>__<action>[__<detail>].json, so each history
// entry is the content AS IT WAS RIGHT BEFORE that action. Restoring an
// entry therefore undoes that action and everything after it.
//
// This file must stay free of "server-only", Node built-ins and browser
// globals: it is imported by the content store (server) AND by the admin
// HistoryPanel (client), and unit-tested directly with node.

export const HISTORY_PREFIX = "_admin/history/";
export const HISTORY_KEEP_RECENT = 50;
export const HISTORY_KEEP_DAYS = 30;
export const HISTORY_TIME_ZONE = "Asia/Ho_Chi_Minh";

const SEGMENT_MAX_LENGTH = 40;
const DAY_MS = 24 * 60 * 60 * 1000;
// Vietnam has used UTC+7 with no DST since 1975, so a fixed offset is an
// exact fallback when the runtime's Intl has no time-zone data.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// Action → Vietnamese wording, rendered as "Bản trước khi <label>".
export const HISTORY_ACTION_LABELS = {
  "project.create": "thêm video",
  "project.update": "sửa video",
  "project.delete": "xoá video",
  "projects.reorder": "sắp xếp video",
  "projects.featured-layout": "đổi bố cục nổi bật",
  "image-project.create": "thêm dự án ảnh",
  "image-project.update": "sửa dự án ảnh",
  "image-project.delete": "xoá dự án ảnh",
  "image-projects.reorder": "sắp xếp dự án ảnh",
  "showreel.update": "thay showreel",
  "showreel.delete": "xoá showreel",
  "site.update": "sửa nội dung trang",
  "site.reset": "khôi phục mặc định nội dung trang",
  "history.restore": "khôi phục lịch sử",
};

const FALLBACK_ACTION_LABEL = "lưu thay đổi";

export function getHistoryActionLabel(action) {
  return HISTORY_ACTION_LABELS[action] || FALLBACK_ACTION_LABEL;
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "string") return new Date(value);
  return new Date(Number.NaN);
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

// Restrict a key segment to [a-z0-9.-]: no "_" (it is the "__" separator),
// no "/" and never ".." (path traversal), Vietnamese accents folded.
export function sanitizeHistorySegment(value, maxLength = SEGMENT_MAX_LENGTH) {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, maxLength)
    .replace(/[.-]+$/g, "");
}

// 2026-10-25T07:32:10.123Z → 2026-10-25T07-32-10-123Z (":" and "." are
// awkward in object keys / filenames).
function toKeyTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function buildHistoryKey(date, action, detail) {
  const when = toDate(date);
  if (!isValidDate(when)) throw new TypeError("buildHistoryKey: invalid date");
  const safeAction = sanitizeHistorySegment(action) || "unknown";
  const safeDetail = sanitizeHistorySegment(detail);
  return `${HISTORY_PREFIX}${toKeyTimestamp(when)}__${safeAction}${
    safeDetail ? `__${safeDetail}` : ""
  }.json`;
}

const HISTORY_NAME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z__([a-z0-9.-]{1,40})(?:__([a-z0-9.-]{1,40}))?$/;

// Inverse of buildHistoryKey. Returns null for anything that is not a
// history snapshot key we wrote — callers use it to validate user input
// before touching R2 with it.
export function parseHistoryKey(key) {
  if (typeof key !== "string" || key.length > 300) return null;
  if (!key.startsWith(HISTORY_PREFIX)) return null;
  if (key.includes("..") || key.includes("\\")) return null;
  if (!key.endsWith(".json")) return null;
  const name = key.slice(HISTORY_PREFIX.length, -".json".length);
  if (!name || name.includes("/")) return null;
  const match = HISTORY_NAME_PATTERN.exec(name);
  if (!match) return null;
  const [, day, hh, mm, ss, ms, action, detail] = match;
  const createdAt = `${day}T${hh}:${mm}:${ss}.${ms}Z`;
  const parsed = new Date(createdAt);
  // Round-trip check rejects impossible values like month 13 / hour 25.
  if (!isValidDate(parsed) || parsed.toISOString() !== createdAt) return null;
  return { key, createdAt, action, detail: detail || null };
}

let vnFormatter = null;

function vnParts(value) {
  const date = toDate(value);
  if (!isValidDate(date)) return null;
  try {
    if (!vnFormatter) {
      vnFormatter = new Intl.DateTimeFormat("vi-VN", {
        timeZone: HISTORY_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
    }
    const parts = {};
    for (const part of vnFormatter.formatToParts(date)) parts[part.type] = part.value;
    if (!parts.year || !parts.month || !parts.day) throw new Error("incomplete parts");
    return {
      year: parts.year,
      month: parts.month.padStart(2, "0"),
      day: parts.day.padStart(2, "0"),
      hour: (parts.hour === "24" ? "00" : parts.hour || "00").padStart(2, "0"),
      minute: (parts.minute || "00").padStart(2, "0"),
      second: (parts.second || "00").padStart(2, "0"),
    };
  } catch {
    const iso = new Date(date.getTime() + VN_OFFSET_MS).toISOString();
    return {
      year: iso.slice(0, 4),
      month: iso.slice(5, 7),
      day: iso.slice(8, 10),
      hour: iso.slice(11, 13),
      minute: iso.slice(14, 16),
      second: iso.slice(17, 19),
    };
  }
}

// Calendar day in Vietnam time, "YYYY-MM-DD" (sortable as a string).
export function vnDayKey(value) {
  const parts = vnParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

// "14:32 25/10/2026" in Vietnam time.
export function formatVnDateTime(value) {
  const parts = vnParts(value);
  if (!parts) return "";
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}

// "14:32 25/10" — the year is only added when it differs from `now`'s.
export function formatVnShort(value, now = Date.now()) {
  const parts = vnParts(value);
  if (!parts) return "";
  const nowParts = vnParts(now);
  const base = `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}`;
  return nowParts && nowParts.year === parts.year ? base : `${base}/${parts.year}`;
}

export function formatRelativeVi(value, now = Date.now()) {
  const date = toDate(value);
  if (!isValidDate(date)) return "";
  const diffMs = toDate(now).getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (diffMs < 45 * 1000 || minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;
  return `${Math.floor(days / 365)} năm trước`;
}

// Compact UTC stamp used as the `detail` of a history.restore entry so the
// list can say which snapshot was restored: 2026-10-25T07:32:10.123Z →
// "20261025-073210".
export function toCompactTimestamp(value) {
  const date = toDate(value);
  if (!isValidDate(date)) return "";
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${iso.slice(
    11,
    13
  )}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
}

export function parseCompactTimestamp(value) {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
  const date = new Date(iso);
  return isValidDate(date) && date.toISOString() === iso ? iso : null;
}

// Human title for a list row: "Bản trước khi sửa video #12".
export function describeHistoryEntry(entry, now = Date.now()) {
  const action = entry?.action || "";
  const detail = entry?.detail ? String(entry.detail) : "";
  let suffix = "";
  if (detail) {
    if (/^(project|image-project)\./.test(action) && /^\d+$/.test(detail)) {
      suffix = ` #${detail}`;
    } else if (action === "history.restore") {
      const iso = parseCompactTimestamp(detail);
      suffix = iso ? ` (về bản lúc ${formatVnShort(iso, now)})` : "";
    } else {
      suffix = ` (${detail})`;
    }
  }
  return `Bản trước khi ${getHistoryActionLabel(action)}${suffix}`;
}

function timeOf(entry) {
  const date = toDate(entry?.createdAt);
  return isValidDate(date) ? date.getTime() : Number.NaN;
}

// Retention: keep the newest HISTORY_KEEP_RECENT snapshots, plus the newest
// snapshot of each Vietnam calendar day within the last HISTORY_KEEP_DAYS
// days (today included). Everything else is returned for deletion. Entries
// whose time cannot be read are never pruned (we only delete what we
// understand), and the newest snapshot always survives.
export function selectSnapshotsToPrune(
  entries,
  now = Date.now(),
  { keepRecent = HISTORY_KEEP_RECENT, keepDays = HISTORY_KEEP_DAYS } = {}
) {
  const list = (Array.isArray(entries) ? entries : []).filter(
    (entry) => typeof entry?.key === "string" && Number.isFinite(timeOf(entry))
  );
  const sorted = [...list].sort((a, b) => {
    const diff = timeOf(b) - timeOf(a);
    if (diff !== 0) return diff;
    return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
  });

  const nowMs = toDate(now).getTime();
  const cutoffDay = vnDayKey(nowMs - (Math.max(1, keepDays) - 1) * DAY_MS);
  const keep = new Set();
  const daysSeen = new Set();

  sorted.forEach((entry, index) => {
    if (index < Math.max(1, keepRecent)) keep.add(entry.key);
    const day = vnDayKey(timeOf(entry));
    if (day && cutoffDay && day >= cutoffDay && !daysSeen.has(day)) {
      daysSeen.add(day);
      keep.add(entry.key);
    }
  });

  const prune = [];
  const seen = new Set();
  for (const entry of sorted) {
    if (keep.has(entry.key) || seen.has(entry.key)) continue;
    seen.add(entry.key);
    prune.push(entry.key);
  }
  return prune;
}

function basename(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  const clean = text.split(/[?#]/)[0];
  const last = clean.split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

// Small, display-oriented summary of a (raw or normalized) store object.
export function summarizeStore(store) {
  const source = store && typeof store === "object" ? store : {};
  const projects = Array.isArray(source.projects) ? source.projects : [];
  const imageProjects = Array.isArray(source.imageProjects) ? source.imageProjects : [];
  const featured = projects.filter((project) => Boolean(project?.featured)).length;
  const showreel = source.showreel && typeof source.showreel === "object" ? source.showreel : null;
  const showreelName = showreel?.url
    ? (typeof showreel.name === "string" && showreel.name.trim()) ||
      basename(showreel.key) ||
      basename(showreel.url) ||
      "showreel"
    : null;
  const updatedAt = isValidDate(toDate(source.updatedAt))
    ? toDate(source.updatedAt).toISOString()
    : null;
  const revision = Number(source.revision);
  return {
    projects: projects.length,
    featured,
    otherVideos: projects.length - featured,
    imageProjects: imageProjects.length,
    showreel: showreelName,
    siteCustomized: Boolean(
      source.site && typeof source.site === "object" && !Array.isArray(source.site)
    ),
    updatedAt,
    revision: Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) : 0,
  };
}

// Field normalizers shared with contentStore.normalizeStore.
export function normalizeStoreUpdatedAt(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return isValidDate(date) ? date.toISOString() : null;
}

export function normalizeStoreRevision(value) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}
