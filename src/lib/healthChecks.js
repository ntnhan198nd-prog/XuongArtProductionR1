import "server-only";
import { GetObjectCommand, HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { describeServerError } from "@/lib/apiErrors";
import { formatVnDateTime } from "@/lib/contentHistory";
import {
  STORE_KEY,
  collectAssetKeysFromStore,
  isMissingObjectError,
  isTrashEntryExpired,
  listHistory,
  readHistorySnapshotRaw,
  readStore,
  slugify,
  sortByOrderThenId,
} from "@/lib/contentStore";
import {
  FEATURED_SLOTS_PER_SLIDE,
  compactFeaturedSlides,
  resolveFeaturedSlots,
} from "@/lib/featuredLayout";
import {
  deleteR2Keys,
  findMissingR2Keys,
  getR2Client,
  getR2Config,
  isAllowedFolder,
  validateR2Config,
} from "@/lib/r2";

// Server-side admin diagnostics, shared by:
//   - GET /api/admin/health      → runHealthChecks()   ("Hệ thống" tab)
//   - GET /api/admin/overview    → buildOverview()     ("Tổng quan" tab)
//   - /api/admin/r2/orphans      → scanOrphanMedia() / deleteOrphanMedia()
// Every user-facing string is Vietnamese (non-technical owner).

const DAY_MS = 24 * 60 * 60 * 1000;

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toIso(value) {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function basename(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  const last = text.split(/[?#]/)[0].split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

// "45.2 KB" style size for the health messages.
function formatSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

// ===========================================================================
// Health checks
// ===========================================================================

export const HEALTH_ENV_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ENDPOINT",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_URL",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
];

const PROBE_TIMEOUT_MS = 8000;

function envPresence() {
  const result = {};
  for (const key of HEALTH_ENV_KEYS) {
    result[key] = Boolean(process.env[key] && String(process.env[key]).trim());
  }
  return result;
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url ? "(invalid URL)" : "";
  }
}

// HEAD a public URL (GET of one byte when HEAD is refused). Never throws:
// { status } on an HTTP answer, { status: 0, error } on a network failure.
export async function probePublicUrl(
  url,
  { fetchImpl = globalThis.fetch, timeoutMs = PROBE_TIMEOUT_MS } = {}
) {
  const attempt = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
        ...(method === "GET" ? { headers: { Range: "bytes=0-0" } } : {}),
      });
      try {
        await response.body?.cancel?.();
      } catch {
        // Body already consumed / not cancellable — nothing to free.
      }
      return { status: Number(response.status) || 0 };
    } catch (error) {
      const timedOut = controller.signal.aborted;
      return {
        status: 0,
        error: timedOut
          ? `quá ${Math.round(timeoutMs / 1000)} giây không phản hồi`
          : String(error?.cause?.code || error?.message || error || "lỗi mạng"),
      };
    } finally {
      clearTimeout(timer);
    }
  };
  const head = await attempt("HEAD");
  if (head.status === 405 || head.status === 501) return attempt("GET");
  return head;
}

// First media file of the store that visitors load: showreel, then videos,
// then image projects. Returns { url, key, label } or null.
export function pickProbeAsset(store, publicBaseUrl = "") {
  const candidates = [];
  const push = (asset, label) => {
    if (!isPlainObject(asset)) return;
    const key = typeof asset.key === "string" ? asset.key.trim() : "";
    const rawUrl = typeof asset.url === "string" ? asset.url.trim() : "";
    // The stored URL is what the website actually loads (it can point at an
    // old domain after an account move), so it wins over the key.
    const url = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : key && publicBaseUrl
      ? `${publicBaseUrl}/${key.replace(/^\/+/, "")}`
      : "";
    if (url) candidates.push({ url, key: key || null, label });
  };
  const source = isPlainObject(store) ? store : {};
  push(source.showreel, "showreel");
  for (const project of ensureArray(source.projects)) {
    const name = project?.title ? `video “${project.title}”` : "một video";
    push(project?.media, name);
    push(project?.thumbnail, `ảnh đại diện của ${name}`);
  }
  for (const project of ensureArray(source.imageProjects)) {
    const name = project?.title ? `dự án ảnh “${project.title}”` : "một dự án ảnh";
    for (const asset of ensureArray(project?.media)) push(asset, `ảnh của ${name}`);
    push(project?.thumbnail, `ảnh đại diện của ${name}`);
  }
  return candidates[0] || null;
}

function overallLevel(items) {
  if (items.some((item) => item.level === "error")) return "error";
  if (items.some((item) => item.level === "warn")) return "warn";
  return "ok";
}

function mediaItemFor(probe, asset) {
  const host = safeHost(asset.url);
  if (probe.status >= 200 && probe.status < 300) {
    return {
      level: "ok",
      message: `Mở được ${asset.label} qua ${host} (HTTP ${probe.status}).`,
      hint: "",
    };
  }
  if (probe.status === 404) {
    return {
      level: "error",
      message: `Không tìm thấy file của ${asset.label} trên ${host} (HTTP 404) — file có thể đã bị xoá khỏi R2.`,
      hint: "Mở mục đó trong admin và chọn lại file, hoặc khôi phục một bản cũ trong tab Lịch sử.",
    };
  }
  if (probe.status === 401 || probe.status === 403) {
    return {
      level: "error",
      message: `${host} từ chối cho xem file (HTTP ${probe.status}).`,
      hint: "Kiểm tra bucket R2 đã bật truy cập công khai (Public access / Custom domain) và R2_PUBLIC_URL đúng tên miền đó.",
    };
  }
  if (probe.status > 0) {
    return {
      level: "error",
      message: `${host} trả về lỗi HTTP ${probe.status} khi mở ${asset.label}.`,
      hint: "Thử lại sau ít phút. Nếu vẫn lỗi, báo người hỗ trợ kỹ thuật.",
    };
  }
  return {
    level: "error",
    message: `Không kết nối được tới ${host} (${probe.error || "lỗi mạng"}).`,
    hint: "Kiểm tra R2_PUBLIC_URL là tên miền công khai của bucket (ví dụ https://pub-….r2.dev hoặc tên miền riêng).",
  };
}

function storePublicItemFor(probe, url) {
  if (probe.status === 200 || probe.status === 206) {
    // r2.dev is Cloudflare's own domain: no WAF rule can be added there, so
    // the only way to block it is to move to a custom domain first.
    const onR2Dev = /(^|\.)r2\.dev$/i.test(String(safeHost(url)).split(":")[0]);
    return {
      level: "warn",
      message: `Ai biết đường dẫn ${url} đều mở xem được file nội dung website (kể cả các bản Lịch sử và mục trong Thùng rác). Đây chỉ là lưu ý, không phải lỗi — trong file không có mật khẩu, website vẫn chạy bình thường.`,
      hint: onR2Dev
        ? "Không bắt buộc xử lý. Tên miền r2.dev là của Cloudflare nên không chặn riêng được thư mục này. Nếu muốn chặn: gắn tên miền riêng cho bucket R2 (Custom domain), đổi R2_PUBLIC_URL sang tên miền đó, tắt r2.dev, rồi tạo quy tắc WAF chặn các đường dẫn bắt đầu bằng /_admin/."
        : "Không bắt buộc xử lý. Nếu muốn chặn: trên Cloudflare, tạo quy tắc WAF chặn các đường dẫn bắt đầu bằng /_admin/ trên tên miền công khai của R2.",
    };
  }
  if (probe.status >= 400 && probe.status < 500) {
    return {
      level: "ok",
      message: `File nội dung không xem công khai được (HTTP ${probe.status}) — tốt.`,
      hint: "",
    };
  }
  return {
    level: "skip",
    message: probe.status
      ? `Không kiểm tra được (HTTP ${probe.status}).`
      : `Không kiểm tra được (${probe.error || "lỗi mạng"}).`,
    hint: "",
  };
}

// Full report for GET /api/admin/health. The top-level fields of the old
// route are kept as they were (ok, checkedAt, env, missingEnv, r2,
// checks.bucket, checks.store, problems); `items` / `level` drive the
// traffic-light rows of the "Hệ thống" tab. `ok` still only means
// "bucket reachable + store readable".
export async function runHealthChecks({
  fetchImpl = globalThis.fetch,
  timeoutMs = PROBE_TIMEOUT_MS,
} = {}) {
  const validation = validateR2Config();
  const config = getR2Config();

  const report = {
    ok: false,
    level: "ok",
    checkedAt: new Date().toISOString(),
    env: envPresence(),
    missingEnv: validation.missing,
    r2: {
      endpointHost: safeHost(config.endpoint),
      bucket: config.bucket || null,
      publicBaseUrl: config.publicBaseUrl || null,
      storeKey: STORE_KEY,
    },
    checks: {},
    problems: [],
    items: [],
  };
  const items = {
    env: null,
    bucket: null,
    store: null,
    media: null,
    storePublic: null,
  };
  const labels = {
    env: "Cấu hình máy chủ",
    bucket: "Kết nối kho lưu trữ R2",
    store: "File nội dung website",
    media: "File video, ảnh mở được từ website",
    storePublic: "Quyền xem file nội dung",
  };
  const set = (id, level, message, hint = "") => {
    items[id] = { id, label: labels[id], level, message, hint: hint || "" };
  };
  const finish = () => {
    report.items = Object.values(items).filter(Boolean);
    report.level = overallLevel(report.items);
    return report;
  };

  // Independent of the R2 credentials: only needs the public URL.
  const storePublicUrl = config.publicBaseUrl ? `${config.publicBaseUrl}/${STORE_KEY}` : "";
  const storePublicProbe = storePublicUrl
    ? probePublicUrl(storePublicUrl, { fetchImpl, timeoutMs })
    : Promise.resolve(null);
  const applyStorePublic = async () => {
    const probe = await storePublicProbe;
    if (!probe) {
      set("storePublic", "skip", "Chưa kiểm tra vì thiếu R2_PUBLIC_URL.");
      return;
    }
    report.checks.storePublic = {
      url: storePublicUrl,
      status: probe.status,
      publiclyReadable:
        probe.status === 200 || probe.status === 206
          ? true
          : probe.status >= 400 && probe.status < 500
          ? false
          : null,
      ...(probe.error ? { error: probe.error } : {}),
    };
    const item = storePublicItemFor(probe, storePublicUrl);
    set("storePublic", item.level, item.message, item.hint);
  };

  if (!validation.valid) {
    const { hint } = describeServerError(
      new Error(`R2 is not configured. Missing: ${validation.missing.join(", ")}`)
    );
    set("env", "error", `Server thiếu thiết lập: ${validation.missing.join(", ")}.`, hint);
    report.problems.push(
      `Server thiếu biến môi trường R2: ${validation.missing.join(", ")}. Trên Vercel: Settings → Environment Variables → thêm cho Production → Redeploy.`
    );
    const skipText = "Chưa kiểm tra vì server thiếu thiết lập R2.";
    set("bucket", "skip", skipText);
    set("store", "skip", skipText);
    set("media", "skip", skipText);
    await applyStorePublic();
    return finish();
  }
  set("env", "ok", "Đủ các thiết lập kết nối kho lưu trữ R2.");

  const client = getR2Client();

  // 1) Can we reach the bucket with these credentials at all?
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    report.checks.bucket = { ok: true };
    set("bucket", "ok", `Kết nối được bucket “${config.bucket}”.`);
  } catch (error) {
    const described = describeServerError(error);
    // HeadBucket has no response body, so a nonexistent bucket surfaces as a
    // bare 404 ("NotFound") rather than "NoSuchBucket" — spell it out.
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === "NotFound") {
      described.message = `Bucket "${config.bucket}" không tồn tại trên account này (HTTP 404)`;
      described.hint =
        "Kiểm tra R2_BUCKET đúng tên bucket, và R2_ACCOUNT_ID / R2_ENDPOINT đúng account Cloudflare chứa bucket đó.";
      described.code = "NoSuchBucket";
    }
    report.checks.bucket = { ok: false, ...described };
    report.problems.push(`Không truy cập được bucket "${config.bucket}": ${described.message}`);
    if (described.hint) report.problems.push(described.hint);
    set("bucket", "error", `Không truy cập được bucket “${config.bucket}”: ${described.message}`, described.hint);
    const skipText = "Chưa kiểm tra vì chưa kết nối được bucket.";
    set("store", "skip", skipText);
    set("media", "skip", skipText);
    await applyStorePublic();
    return finish();
  }

  // 2) Can we read the content store object?
  let parsed = null;
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: STORE_KEY }));
    const raw = await result.Body.transformToString("utf-8");
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    // Same rule as contentStore: only a plain object is a valid store.
    if (!isPlainObject(parsed)) parsed = null;
    const lastModified =
      result?.LastModified instanceof Date && !Number.isNaN(result.LastModified.getTime())
        ? result.LastModified.toISOString()
        : null;
    report.checks.store = {
      // Reachable but unparseable is NOT ok — every admin read fails with
      // STORE_CORRUPT until the owner restores a snapshot (the file itself
      // is kept; see contentStore.readStoreInternal).
      ok: parsed !== null,
      exists: true,
      bytes: raw.length,
      validJson: parsed !== null,
      lastModified,
      updatedAt: toIso(parsed?.updatedAt),
      revision: Number.isFinite(Number(parsed?.revision)) ? Number(parsed.revision) : null,
      projects: Array.isArray(parsed?.projects) ? parsed.projects.length : null,
      imageProjects: Array.isArray(parsed?.imageProjects) ? parsed.imageProjects.length : null,
      hasShowreel: Boolean(parsed?.showreel),
      hasSiteContent: Boolean(parsed?.site),
    };
    if (parsed === null) {
      report.problems.push(
        `File ${STORE_KEY} bị hỏng (không phải JSON hợp lệ). File được giữ nguyên và một bản sao được lưu thành _admin/content.corrupt-*.json. Vào tab Lịch sử trong admin để khôi phục bản gần nhất.`
      );
      set(
        "store",
        "error",
        "File nội dung bị hỏng nên website đang tạm hiện nội dung mặc định.",
        "Vào tab Lịch sử và bấm Khôi phục ở bản gần nhất."
      );
    } else {
      const savedAt = report.checks.store.updatedAt || lastModified;
      set(
        "store",
        "ok",
        `Đọc được, hợp lệ · ${formatSize(raw.length)}${
          savedAt ? ` · lưu lần cuối ${formatVnDateTime(savedAt)}` : ""
        }.`
      );
    }
  } catch (error) {
    if (isMissingObjectError(error)) {
      report.checks.store = {
        ok: true,
        exists: false,
        note: `Chưa có ${STORE_KEY} trong bucket — store đang trống (bình thường với bucket mới; file sẽ được tạo ở lần lưu đầu tiên).`,
      };
      set(
        "store",
        "warn",
        "Chưa có file nội dung — website đang hiện nội dung mặc định. File sẽ tự được tạo ở lần lưu đầu tiên.",
        "Bình thường nếu bucket mới tạo. Nếu trước đây đã có nội dung, kiểm tra R2_BUCKET có đúng bucket cũ không."
      );
    } else {
      const described = describeServerError(error);
      report.checks.store = { ok: false, exists: null, ...described };
      report.problems.push(`Không đọc được ${STORE_KEY}: ${described.message}`);
      if (described.hint) report.problems.push(described.hint);
      set("store", "error", `Không đọc được file nội dung: ${described.message}`, described.hint);
    }
  }

  // 3) Does one referenced media file open through its public URL?
  const asset = parsed ? pickProbeAsset(parsed, config.publicBaseUrl) : null;
  if (!parsed) {
    set(
      "media",
      "skip",
      report.checks.store?.exists === false
        ? "Chưa có video, ảnh nào để thử."
        : "Chưa kiểm tra vì không đọc được file nội dung."
    );
  } else if (!asset) {
    report.checks.media = { ok: null, skipped: true };
    set("media", "skip", "Chưa có video, ảnh nào để thử.");
  } else {
    const probe = await probePublicUrl(asset.url, { fetchImpl, timeoutMs });
    const item = mediaItemFor(probe, asset);
    report.checks.media = {
      ok: item.level === "ok",
      url: asset.url,
      key: asset.key,
      status: probe.status,
      ...(probe.error ? { error: probe.error } : {}),
    };
    if (item.level !== "ok") report.problems.push(item.message);
    set("media", item.level, item.message, item.hint);
  }

  await applyStorePublic();
  report.ok = Boolean(report.checks.bucket?.ok && report.checks.store?.ok);
  return finish();
}

// ===========================================================================
// Overview ("Tổng quan" tab)
// ===========================================================================

function hasFile(asset) {
  return isPlainObject(asset) && typeof asset.url === "string" && asset.url.trim().length > 0;
}

// Admin tab that edits a video: featured ones live under "Trang chủ:
// Showreel & Nổi bật", the rest under "Thư viện video".
export function videoTabFor(project) {
  return project?.featured ? "showreel-featured" : "other-videos";
}

// Slug the public site resolves a record under (contentStore serializers:
// stored slug, else slugify(title)).
function publicSlugOf(record) {
  const stored = typeof record?.slug === "string" ? record.slug.trim() : "";
  return stored || slugify(record?.title || "");
}

// One issue per record that loses a slug clash: /videos/<slug> opens the
// first record in order/id sequence, so every later one is unreachable.
function slugCollisions(records, tabFor) {
  const winners = new Map();
  const issues = [];
  for (const record of sortByOrderThenId(records)) {
    const slug = publicSlugOf(record);
    if (!slug) continue;
    const winner = winners.get(slug);
    if (!winner) {
      winners.set(slug, record);
      continue;
    }
    issues.push({
      type: "slug-collision",
      id: record.id,
      title: record.title || "",
      tab: tabFor(record),
      slug,
      otherId: winner.id,
      otherTitle: winner.title || "",
    });
  }
  return issues;
}

function recordTime(record) {
  return toIso(record?.updatedAt) || toIso(record?.createdAt);
}

export const OVERVIEW_RECENT_LIMIT = 5;

// Everything the "Tổng quan" tab shows, from one (normalized) store.
export function buildOverview(store, { now = Date.now() } = {}) {
  const source = isPlainObject(store) ? store : {};
  const projects = ensureArray(source.projects).filter(isPlainObject);
  const imageProjects = ensureArray(source.imageProjects).filter(isPlainObject);
  const featured = projects.filter((project) => Boolean(project.featured));

  // Same layout the homepage renders (ProjectsGallery).
  const slots = compactFeaturedSlides(resolveFeaturedSlots(featured));
  const featuredGrid = {
    used: slots.filter(Boolean).length,
    cells: slots.length,
    slides: slots.length / FEATURED_SLOTS_PER_SLIDE,
    perSlide: FEATURED_SLOTS_PER_SLIDE,
  };

  const reel = isPlainObject(source.showreel) && hasFile(source.showreel) ? source.showreel : null;
  const num = (value) =>
    value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
      ? null
      : Number(value);
  const showreel = {
    present: Boolean(reel),
    name: reel
      ? (typeof reel.name === "string" && reel.name.trim()) ||
        basename(reel.key) ||
        basename(reel.url) ||
        "showreel"
      : null,
    duration: reel ? num(reel.duration) : null,
    sizeBytes: reel ? num(reel.size) : null,
    updatedAt: reel ? toIso(reel.updatedAt) : null,
  };

  // Issues, most serious kind first; within a kind, in list order.
  const orderedVideos = sortByOrderThenId(projects);
  const orderedImages = sortByOrderThenId(imageProjects);
  const videoIssue = (type, project) => ({
    type,
    id: project.id,
    title: project.title || "",
    tab: videoTabFor(project),
  });
  const issues = [];
  if (!showreel.present) {
    issues.push({ type: "no-showreel", id: null, title: "Showreel", tab: "showreel-featured" });
  }
  for (const project of orderedVideos) {
    if (!hasFile(project.media)) issues.push(videoIssue("no-media", project));
  }
  for (const project of orderedImages) {
    if (!ensureArray(project.media).some(hasFile)) {
      issues.push({ type: "image-no-media", id: project.id, title: project.title || "", tab: "images" });
    }
  }
  issues.push(...slugCollisions(projects, videoTabFor));
  issues.push(...slugCollisions(imageProjects, () => "images"));
  for (const project of orderedVideos) {
    if (project.featured && !hasFile(project.preview)) {
      issues.push(videoIssue("featured-no-preview", project));
    }
  }
  for (const project of orderedVideos) {
    if (!hasFile(project.thumbnail)) issues.push(videoIssue("no-thumbnail", project));
  }

  const recent = [
    ...projects.map((project) => ({
      id: project.id,
      title: project.title || "",
      kind: "video",
      tab: videoTabFor(project),
      updatedAt: recordTime(project),
    })),
    ...imageProjects.map((project) => ({
      id: project.id,
      title: project.title || "",
      kind: "image",
      tab: "images",
      updatedAt: recordTime(project),
    })),
  ]
    .filter((item) => item.updatedAt)
    .sort((a, b) => (a.updatedAt === b.updatedAt ? 0 : a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, OVERVIEW_RECENT_LIMIT);

  const revision = Number(source.revision);
  return {
    counts: {
      videos: projects.length,
      featured: featured.length,
      otherVideos: projects.length - featured.length,
      imageProjects: imageProjects.length,
      // Same entries the "Thùng rác" tab lists: it purges expired ones first.
      trash: ensureArray(source.trash).filter((entry) => !isTrashEntryExpired(entry, now)).length,
    },
    featuredGrid,
    showreel,
    siteCustomized: isPlainObject(source.site),
    storeUpdatedAt: toIso(source.updatedAt),
    revision: Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) : 0,
    issues,
    recent,
  };
}

// ===========================================================================
// Orphan media ("File thừa trên R2")
// ===========================================================================

export const ORPHAN_MIN_AGE_MS = DAY_MS;
export const ORPHAN_HISTORY_DAYS = 30;
export const ORPHAN_HISTORY_MAX_SNAPSHOTS = 100;
export const ORPHAN_SCAN_CAP = 5000;
export const ORPHAN_DELETE_MAX_KEYS = 200;
const PROTECTED_PREFIX = "_admin/";
const LIST_MAX_PAGES = 20;
// Copies of a corrupt content.json kept aside by contentStore (its
// CORRUPT_COPY_PREFIX, not exported): the only record of the old content
// after "Bắt đầu lại với nội dung trống", so their media must stay.
const CORRUPT_COPY_PREFIX = `${PROTECTED_PREFIX}content.corrupt-`;
const CORRUPT_COPIES_MAX = 50;
const SNAPSHOT_READ_CONCURRENCY = 6;
const DELETE_CHUNK = 20;

// Only keys inside an upload folder (lower-case, as the upload routes write
// them) with clean path segments can ever be reported or deleted; never
// anything under "_admin/" (content store, history, corrupt copies).
export function isOrphanCandidateKey(key) {
  if (typeof key !== "string" || !key || key.length > 1024) return false;
  if (key.startsWith(PROTECTED_PREFIX) || key.includes("\\")) return false;
  const segments = key.split("/");
  if (segments.length < 2) return false;
  if (!segments.every((segment) => segment && segment !== "." && segment !== "..")) return false;
  const folder = segments[0];
  return folder === folder.toLowerCase() && isAllowedFolder(folder);
}

// Every upload-folder key a string may point at: a bare key, a public URL
// (any domain, e.g. an old one from before an account move), a path-style
// URL with the bucket name in front... Each suffix starting at an upload
// folder segment counts, so the set errs on the side of "referenced".
export function referenceKeysFromString(value, { maxLength = 4096 } = {}) {
  if (typeof value !== "string") return [];
  const text = value.trim();
  if (!text || text.length > maxLength || !text.includes("/")) return [];
  let path = text;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      path = new URL(text).pathname;
    } catch {
      path = text.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
    }
  }
  path = path.split(/[?#]/)[0];
  const variants = new Set([path]);
  try {
    variants.add(decodeURIComponent(path));
  } catch {
    // Malformed escape: the raw path is still checked.
  }
  // A link at the end of a sentence ("…/b.pdf." / "…/b.pdf,"): also try
  // without the trailing punctuation.
  for (const variant of [...variants]) {
    const trimmed = variant.replace(/[.,;:!?…]+$/u, "");
    if (trimmed && trimmed !== variant) variants.add(trimmed);
  }
  const keys = [];
  for (const variant of variants) {
    const segments = variant.split("/").filter(Boolean);
    segments.forEach((segment, index) => {
      if (index < segments.length - 1 && isAllowedFolder(segment)) {
        const key = segments.slice(index).join("/");
        if (isOrphanCandidateKey(key)) keys.push(key);
      }
    });
  }
  return keys;
}

// Separators around a link inside free text / HTML / JSON text.
const REFERENCE_TOKEN_SPLIT = /[\s"'`,{}[\]\\<>()]+/;

// Deep walk over a parsed store (or any JSON value): every string anywhere
// — records, trash entries, site content, unknown fields — is scanned, both
// as one key / URL and token by token, so a link inside longer text (a
// sentence, an <img src="…">) counts too. Extra matches only make a file
// look "used", never the other way round.
export function collectReferencedMediaKeys(value, into = new Set()) {
  const stack = [value];
  while (stack.length > 0) {
    const node = stack.pop();
    if (typeof node === "string") {
      for (const key of referenceKeysFromString(node)) into.add(key);
      if (node.includes("/") && REFERENCE_TOKEN_SPLIT.test(node.trim())) {
        collectReferencedMediaKeysFromText(node, into);
      }
    } else if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
    } else if (node && typeof node === "object") {
      for (const item of Object.values(node)) stack.push(item);
    }
  }
  return into;
}

// Fallback for a snapshot that is not valid JSON: treat every run of
// characters between JSON punctuation / whitespace as a possible reference.
export function collectReferencedMediaKeysFromText(raw, into = new Set()) {
  const tokens = String(raw || "").split(REFERENCE_TOKEN_SPLIT);
  for (const token of tokens) {
    for (const key of referenceKeysFromString(token, { maxLength: Infinity })) into.add(key);
  }
  return into;
}

// Pure classification of listed objects. Status per object:
//   protected   — not an upload-folder key (never touched)
//   referenced  — used by the live store (records, showreel, site, trash)
//   too-new     — uploaded less than ORPHAN_MIN_AGE_MS ago (may be a form
//                 that is still being filled in)
//   unknown-age — no readable upload time (never deleted)
//   unknown     — history could not be read, so it cannot be decided
//   history     — only used by a recent history snapshot (restorable)
//   orphan      — none of the above: safe to delete
export function classifyMediaObjects(
  objects,
  { referenced = new Set(), historyRefs = null, now = Date.now(), minAgeMs = ORPHAN_MIN_AGE_MS } = {}
) {
  return ensureArray(objects).map((object) => {
    const key = object?.key;
    const lastModified = toIso(object?.lastModified);
    const size = Number(object?.size);
    const base = { key, size: Number.isFinite(size) ? size : null, lastModified };
    if (!isOrphanCandidateKey(key)) return { ...base, status: "protected" };
    if (referenced.has(key)) return { ...base, status: "referenced" };
    if (!lastModified) return { ...base, status: "unknown-age" };
    if (now - new Date(lastModified).getTime() < minAgeMs) return { ...base, status: "too-new" };
    if (!historyRefs) return { ...base, status: "unknown" };
    if (historyRefs.has(key)) return { ...base, status: "history" };
    return { ...base, status: "orphan" };
  });
}

function assertR2Configured() {
  const validation = validateR2Config();
  if (!validation.valid) {
    // describeServerError keys its Vercel-env hint off this English phrase.
    throw new Error(`R2 is not configured. Missing: ${validation.missing.join(", ")}`);
  }
}

// Objects of every upload folder that exists in the bucket (folders are
// discovered with a "/" delimiter and filtered through the r2.js allowlist),
// capped at `cap` objects in total.
async function listMediaObjects(client, bucket, cap) {
  const folders = [];
  let token;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Delimiter: "/",
        MaxKeys: 1000,
        ...(token ? { ContinuationToken: token } : {}),
      })
    );
    for (const entry of result?.CommonPrefixes || []) {
      const name = String(entry?.Prefix || "").replace(/\/$/, "");
      if (name && name === name.toLowerCase() && isAllowedFolder(name) && !folders.includes(name)) {
        folders.push(name);
      }
    }
    if (!result?.IsTruncated || !result?.NextContinuationToken) break;
    token = result.NextContinuationToken;
  }
  folders.sort();

  const objects = [];
  let truncated = false;
  outer: for (const folder of folders) {
    let continuation;
    for (let page = 0; ; page += 1) {
      if (page >= LIST_MAX_PAGES) {
        truncated = true;
        break;
      }
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: `${folder}/`,
          MaxKeys: 1000,
          ...(continuation ? { ContinuationToken: continuation } : {}),
        })
      );
      for (const item of result?.Contents || []) {
        if (!item?.Key) continue;
        if (objects.length >= cap) {
          truncated = true;
          break outer;
        }
        objects.push({ key: item.Key, size: item.Size, lastModified: item.LastModified });
      }
      if (!result?.IsTruncated || !result?.NextContinuationToken) break;
      continuation = result.NextContinuationToken;
    }
  }
  return { folders, objects, truncated };
}

async function mapWithConcurrency(list, limit, fn) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      await fn(list[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, list.length)) }, worker));
}

// Keys referenced by the newest history snapshots. Reads the newest
// ORPHAN_HISTORY_MAX_SNAPSHOTS of them (all ages: anything still listed in
// the "Lịch sử" tab can be restored); throws when they do not cover every
// snapshot of the last ORPHAN_HISTORY_DAYS days or when one cannot be read.
async function collectHistoryReferences({ now, days, maxSnapshots }) {
  const entries = await listHistory(); // newest first
  const cutoff = now - days * DAY_MS;
  const inWindow = entries.filter((entry) => Date.parse(entry.createdAt) >= cutoff).length;
  const toRead = entries.slice(0, maxSnapshots);
  if (inWindow > toRead.length) {
    const error = new Error(
      `Lịch sử có ${inWindow} bản trong ${days} ngày qua, nhiều hơn ${maxSnapshots} bản đọc được mỗi lần quét.`
    );
    error.code = "HISTORY_TOO_LARGE";
    throw error;
  }
  const refs = new Set();
  let read = 0;
  let gone = 0;
  await mapWithConcurrency(toRead, SNAPSHOT_READ_CONCURRENCY, async (entry) => {
    let raw;
    try {
      ({ raw } = await readHistorySnapshotRaw(entry.key));
    } catch (error) {
      // Pruned between the listing and this read: no longer restorable.
      if (error?.code === "NOT_FOUND") {
        gone += 1;
        return;
      }
      throw error;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === "object") collectReferencedMediaKeys(parsed, refs);
    else collectReferencedMediaKeysFromText(raw, refs);
    read += 1;
  });
  return { refs, read, gone, inWindow, total: entries.length };
}

function describeHistoryFailure(error) {
  if (error?.code === "HISTORY_TOO_LARGE") {
    return {
      message: error.message,
      hint: "Lịch sử sẽ tự dọn bớt sau lần lưu tới. Thử quét lại sau.",
      code: error.code,
    };
  }
  return describeServerError(error);
}

// content.json exactly as stored (null when it does not exist). Read-only.
async function readRawStoreJson(client, bucket) {
  let result;
  try {
    result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: STORE_KEY }));
  } catch (error) {
    if (isMissingObjectError(error)) return null;
    throw error;
  }
  const raw = await result.Body.transformToString("utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    // readStore() accepted it a moment ago; scan the text instead.
    return { text: [...collectReferencedMediaKeysFromText(raw)] };
  }
}

// Keys referenced by every _admin/content.corrupt-*.json copy. Read-only.
// Throws (→ "unknown", deletion refused) when a copy cannot be listed or
// read, or when there are too many copies to read on each scan.
async function collectCorruptCopyReferences(client, bucket) {
  const keys = [];
  let token;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: CORRUPT_COPY_PREFIX,
        MaxKeys: 1000,
        ...(token ? { ContinuationToken: token } : {}),
      })
    );
    for (const item of result?.Contents || []) if (item?.Key) keys.push(item.Key);
    if (!result?.IsTruncated || !result?.NextContinuationToken) break;
    token = result.NextContinuationToken;
  }
  if (keys.length > CORRUPT_COPIES_MAX) {
    const error = new Error(
      `Có ${keys.length} bản sao file nội dung bị hỏng trên R2, nhiều hơn ${CORRUPT_COPIES_MAX} bản đọc được mỗi lần quét.`
    );
    error.code = "CORRUPT_COPIES_TOO_MANY";
    throw error;
  }
  const refs = new Set();
  await mapWithConcurrency(keys, SNAPSHOT_READ_CONCURRENCY, async (key) => {
    let result;
    try {
      result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      if (isMissingObjectError(error)) return; // removed since the listing
      throw error;
    }
    const raw = await result.Body.transformToString("utf-8");
    collectReferencedMediaKeysFromText(raw, refs);
  });
  return { refs, count: keys.length };
}

function describeCorruptCopyFailure(error) {
  const base = error?.code === "CORRUPT_COPIES_TOO_MANY" ? { message: error.message } : describeServerError(error);
  return {
    message: `Không đọc được các bản sao file nội dung bị hỏng (${base.message || "lỗi không rõ"}).`,
    hint: "Để an toàn, chưa xoá file nào: các file video, ảnh cũ có thể vẫn cần để khôi phục nội dung. Thử quét lại sau, hoặc nhờ người hỗ trợ kỹ thuật kiểm tra thư mục _admin/ trên R2.",
    code: error?.code || "CORRUPT_COPIES_UNREADABLE",
  };
}

// Full scan. Returns { report, statusByKey } — `report` is what the GET
// route answers, `statusByKey` (key → { status, size }) is used by the
// delete path to re-check each requested key.
async function runOrphanScan({ now = Date.now(), cap = ORPHAN_SCAN_CAP } = {}) {
  assertR2Configured();
  const client = getR2Client();
  const { bucket } = getR2Config();

  // Throws on an unreadable / corrupt store: nothing can be decided then.
  const store = await readStore();
  const referenced = new Set(collectAssetKeysFromStore(store));
  collectReferencedMediaKeys(store, referenced);
  // The raw file too: normalizeStore drops fields it does not know, and a
  // file used only by such a field must never look unused.
  const rawStore = await readRawStoreJson(client, bucket);
  if (rawStore) collectReferencedMediaKeys(rawStore, referenced);
  // A store that was never saved (missing content.json — e.g. a wrong
  // R2_BUCKET or a lost file) references nothing, which would make EVERY
  // file look unused. Never offer deletion then.
  const storeNeverSaved = !store?.updatedAt && !(Number(store?.revision) > 0);

  // Media of the old content kept in corrupt copies stays "referenced".
  let corruptCopies;
  try {
    const { refs, count } = await collectCorruptCopyReferences(client, bucket);
    for (const key of refs) referenced.add(key);
    corruptCopies = { ok: true, count };
  } catch (error) {
    console.error("[orphans] corrupt copies unreadable:", error?.message || error);
    corruptCopies = { ok: false, count: null, error: describeCorruptCopyFailure(error) };
  }

  const listing = await listMediaObjects(client, bucket, cap);

  let history;
  try {
    history = {
      ok: true,
      ...(await collectHistoryReferences({
        now,
        days: ORPHAN_HISTORY_DAYS,
        maxSnapshots: ORPHAN_HISTORY_MAX_SNAPSHOTS,
      })),
    };
  } catch (error) {
    console.error("[orphans] history unreadable:", error?.message || error);
    history = { ok: false, refs: null, error: describeHistoryFailure(error) };
  }

  const decidable = history.ok && corruptCopies.ok && !storeNeverSaved;
  const unknownReason = storeNeverSaved
    ? {
        message:
          "Chưa có file nội dung website (hoặc chưa lưu lần nào) nên chưa biết file nào đang được dùng.",
        hint: "Để an toàn, chức năng dọn file thừa tạm khoá cho tới khi website có nội dung được lưu.",
        code: "STORE_NEVER_SAVED",
      }
    : !corruptCopies.ok
    ? corruptCopies.error
    : history.ok
    ? null
    : history.error;

  const classified = classifyMediaObjects(listing.objects, {
    referenced,
    historyRefs: decidable ? history.refs : null,
    now,
  });
  const statusByKey = new Map(classified.map((item) => [item.key, item]));
  const orphans = classified
    .filter((item) => item.status === "orphan")
    .map(({ key, size, lastModified }) => ({ key, size, lastModified }))
    .sort((a, b) => (b.size || 0) - (a.size || 0) || (a.key < b.key ? -1 : 1));
  const countBy = (status) => classified.filter((item) => item.status === status).length;

  const report = {
    scannedAt: new Date(now).toISOString(),
    minAgeHours: ORPHAN_MIN_AGE_MS / (60 * 60 * 1000),
    historyDays: ORPHAN_HISTORY_DAYS,
    folders: listing.folders,
    scanned: listing.objects.length,
    cap,
    truncated: listing.truncated,
    referencedCount: countBy("referenced"),
    tooNewCount: countBy("too-new"),
    historyOnlyCount: countBy("history"),
    corruptCopies: corruptCopies.ok ? corruptCopies.count : null,
    history: history.ok
      ? {
          ok: true,
          read: history.read,
          inWindow: history.inWindow,
          total: history.total,
          error: null,
        }
      : { ok: false, read: 0, inWindow: null, total: null, error: history.error },
    status: decidable ? "ok" : "unknown",
    unknownReason,
    canDelete: decidable,
    orphans: decidable ? orphans : null,
    count: decidable ? orphans.length : null,
    totalBytes: decidable ? orphans.reduce((sum, item) => sum + (item.size || 0), 0) : null,
  };
  return { report, statusByKey };
}

// Read-only: does this upload-folder key still exist in the bucket? true /
// false, or null when R2 could not answer. Used by the "Thử upload" test
// to confirm its test image was really deleted.
export async function checkMediaKeyExists(key) {
  if (!isOrphanCandidateKey(key)) {
    const error = new Error("Chỉ kiểm tra được file trong thư mục upload.");
    error.code = "INVALID_KEY";
    throw error;
  }
  assertR2Configured();
  const result = await findMissingR2Keys([key], { limit: 1 });
  if (result.failed > 0 || result.checked === 0) return null;
  return !result.missing.includes(key);
}

export async function scanOrphanMedia(options = {}) {
  const { report } = await runOrphanScan(options);
  return report;
}

// Error thrown by deleteOrphanMedia when the scan cannot decide (history
// unreadable, store never saved); the route answers 409 with error.detail.
export const ORPHANS_UNDECIDABLE_CODE = "ORPHANS_UNDECIDABLE";

// Re-runs the whole scan, then deletes only the requested keys that are
// still orphans. { deleted: [key], skipped: [{ key, reason }], failed: [key],
// freedBytes }. `reason` is a classification status, or "not-found" (no
// longer in the bucket) / "not-scanned" (beyond the scan cap).
export async function deleteOrphanMedia(keys, options = {}) {
  const requested = [
    ...new Set(ensureArray(keys).filter((key) => typeof key === "string" && key.length > 0)),
  ];
  if (requested.length === 0) return { deleted: [], skipped: [], failed: [], freedBytes: 0 };

  const { report, statusByKey } = await runOrphanScan(options);
  if (!report.canDelete) {
    const error = new Error("Orphan status cannot be decided; refusing to delete media.");
    error.code = ORPHANS_UNDECIDABLE_CODE;
    error.detail = report.unknownReason;
    throw error;
  }

  const doomed = [];
  const skipped = [];
  for (const key of requested) {
    if (!isOrphanCandidateKey(key)) {
      skipped.push({ key, reason: "protected" });
      continue;
    }
    const entry = statusByKey.get(key);
    if (entry?.status === "orphan") doomed.push(key);
    else skipped.push({ key, reason: entry?.status || (report.truncated ? "not-scanned" : "not-found") });
  }

  for (let index = 0; index < doomed.length; index += DELETE_CHUNK) {
    await deleteR2Keys(doomed.slice(index, index + DELETE_CHUNK));
  }

  // deleteR2Keys swallows per-key failures: confirm with a HEAD per key.
  let gone = new Set();
  if (doomed.length > 0) {
    const check = await findMissingR2Keys(doomed, { limit: doomed.length });
    gone = new Set(check.missing);
  }
  const deleted = doomed.filter((key) => gone.has(key));
  const failed = doomed.filter((key) => !gone.has(key));
  const freedBytes = deleted.reduce((sum, key) => sum + (statusByKey.get(key)?.size || 0), 0);
  return { deleted, skipped, failed, freedBytes };
}
