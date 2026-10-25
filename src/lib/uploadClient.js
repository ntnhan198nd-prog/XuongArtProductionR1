// Single client-side upload module for the admin R2 flow.
// (Imported only by client components — no server-only code here.)
//
// Flow for every admin upload:
//   1. validate the type locally (same allowlist as the server),
//   2. read optional metadata (width/height/duration) behind a watchdog,
//   3. POST /api/admin/r2/upload-url for a short-lived presigned PUT URL,
//   4. XHR PUT the file straight to R2 with progress + a stall watchdog
//      (one automatic retry with a fresh presign when the transfer stalls).
// Every failure surfaces as an UploadError with a Vietnamese message + hint.
//
// Note: the server-relay route (/api/admin/r2/upload) is NOT used by any
// client today, so uploadFile intentionally has no relay fallback.
import { fetchJson } from "@/lib/apiClient";

// Mirror of ALLOWED_CONTENT_TYPES in src/lib/r2.js (the server allowlist,
// which cannot be imported here because r2.js is server-only).
// BOTH LISTS MUST STAY IN SYNC — a type missing here is rejected before
// upload, a type missing there is rejected at presign.
export const ALLOWED_UPLOAD_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "application/pdf",
]);

// `accept` strings for <input type="file">. Extensions are listed next to
// the MIME types because some OS pickers (macOS + .mkv/.mov) only match on
// the extension.
export const ACCEPT_VIDEO =
  "video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv";
export const ACCEPT_IMAGE =
  "image/png,image/jpeg,image/webp,image/gif,image/avif,.png,.jpg,.jpeg,.webp,.gif,.avif";
export const ACCEPT_PREVIEW = "video/webm,.webm";
export const ACCEPT_MEDIA = `${ACCEPT_VIDEO},${ACCEPT_IMAGE}`;
export const ACCEPT = Object.freeze({
  video: ACCEPT_VIDEO,
  image: ACCEPT_IMAGE,
  preview: ACCEPT_PREVIEW,
  media: ACCEPT_MEDIA,
});

// Browsers frequently report an EMPTY file.type for valid media (.mkv almost
// always; .mov on some OS/browser combos). Without inference that empty type
// falls back to application/octet-stream, which the server upload allowlist
// rejects at presign — so an otherwise-allowed .mkv/.mov can never upload.
// Infer the MIME from the extension; the SAME value must be used for both the
// presign request and the PUT Content-Type header.
const EXT_TO_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  qt: "video/quicktime",
  mkv: "video/x-matroska",
  pdf: "application/pdf",
};

export function resolveContentType(file, fallback = "application/octet-stream") {
  const type = (file?.type || "").trim();
  if (type) return type;
  const name = file?.name || "";
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return EXT_TO_MIME[ext] || fallback;
}

function baseType(contentType) {
  return String(contentType || "").split(";")[0].trim().toLowerCase();
}

export function isAllowedUploadType(contentType) {
  return ALLOWED_UPLOAD_TYPES.includes(baseType(contentType));
}

const VIDEO_FORMATS = "MP4, WebM, MOV, MKV";

// R2 (like S3) refuses a single PUT above ~5 GiB (4.995 GiB). Files above
// this are rejected up front instead of uploading for an hour and then
// failing with an unclear 400 / dropped connection.
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3 - 5 * 1024 ** 2;

function tooLargeMessage(name, size) {
  return `File "${name}" quá lớn (${formatBytes(size)}) — tối đa khoảng 5 GB mỗi file.`;
}
const TOO_LARGE_HINT =
  "Hãy xuất lại bản nhẹ hơn (khuyến nghị MP4 H.264, dưới 2 GB) rồi chọn lại file.";
const IMAGE_FORMATS = "PNG, JPG, WebP, GIF, AVIF";

const KIND_RULES = {
  video: {
    formats: `video ${VIDEO_FORMATS}`,
    test: (type) => type.startsWith("video/"),
  },
  image: {
    formats: `ảnh ${IMAGE_FORMATS}`,
    test: (type) => type.startsWith("image/"),
  },
  preview: {
    formats: "video WebM (.webm)",
    test: (type) => type === "video/webm",
  },
  // Main project media accepts either a video or an image.
  media: {
    formats: `video ${VIDEO_FORMATS} hoặc ảnh ${IMAGE_FORMATS}`,
    test: (type) => type.startsWith("video/") || type.startsWith("image/"),
  },
};

// Validate a picked file before anything is uploaded. Returns null when the
// file is fine, otherwise a short Vietnamese message for the admin.
export function validateUploadFile(file, { kind = "media" } = {}) {
  if (!file) return "Chưa chọn file.";
  const name = file.name || "file";
  const rule = KIND_RULES[kind] || KIND_RULES.media;
  const type = baseType(resolveContentType(file, ""));
  if (!type || !isAllowedUploadType(type) || !rule.test(type)) {
    return `File "${name}" không đúng định dạng. Chỉ nhận ${rule.formats}.`;
  }
  if (typeof file.size === "number" && file.size === 0) {
    return `File "${name}" bị rỗng (0 byte) — hãy chọn lại file khác.`;
  }
  if (typeof file.size === "number" && file.size > MAX_UPLOAD_BYTES) {
    return `${tooLargeMessage(name, file.size)} ${TOO_LARGE_HINT}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Formatting helpers (Vietnamese UI)
// ---------------------------------------------------------------------------

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

function pickByteUnit(bytes) {
  let index = 0;
  let value = bytes;
  while (index < BYTE_UNITS.length - 1 && value >= 1024) {
    value /= 1024;
    index += 1;
  }
  // 1023.96 KB would round to "1024 KB" — bump to the next unit instead.
  if (index > 0 && index < BYTE_UNITS.length - 1 && Math.round(value) >= 1024) {
    value /= 1024;
    index += 1;
  }
  return { index, divisor: 1024 ** index };
}

// One decimal below 10 (Vietnamese decimal comma), whole numbers above.
function formatAmount(value, index) {
  if (index === 0 || value >= 10) return String(Math.round(value));
  const rounded = Math.round(value * 10) / 10;
  return String(rounded).replace(".", ",");
}

// 134217728 → "128 MB", 1610612736 → "1,5 GB".
export function formatBytes(n) {
  const bytes = Number(n);
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  const { index, divisor } = pickByteUnit(bytes);
  return `${formatAmount(bytes / divisor, index)} ${BYTE_UNITS[index]}`;
}

// Progress pair in the unit of the total: (134217728, 293601280) → "128/280 MB".
export function formatBytesPair(loaded, total) {
  const totalBytes = Number(total);
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return formatBytes(loaded);
  const loadedBytes = Math.min(Math.max(Number(loaded) || 0, 0), totalBytes);
  const { index, divisor } = pickByteUnit(totalBytes);
  return `${formatAmount(loadedBytes / divisor, index)}/${formatAmount(
    totalBytes / divisor,
    index
  )} ${BYTE_UNITS[index]}`;
}

const pad2 = (value) => String(value).padStart(2, "0");

// 245 → "4 phút 05 giây", 45 → "45 giây", 3725 → "1 giờ 02 phút 05 giây".
export function formatDuration(sec) {
  const value = Number(sec);
  if (sec === null || sec === undefined || !Number.isFinite(value) || value < 0) {
    return "";
  }
  const total = Math.round(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} giờ ${pad2(minutes)} phút ${pad2(seconds)} giây`;
  if (minutes > 0) return `${minutes} phút ${pad2(seconds)} giây`;
  return `${seconds} giây`;
}

// Rough remaining-time label: "vài giây", "~40 giây", "~4 phút", "~1 giờ 05 phút".
export function formatEta(sec) {
  const value = Number(sec);
  if (sec === null || sec === undefined || !Number.isFinite(value) || value < 0) {
    return "";
  }
  if (value < 10) return "vài giây";
  if (value < 60) return `~${Math.round(value / 5) * 5} giây`;
  if (value < 3600) return `~${Math.round(value / 60)} phút`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.round((value % 3600) / 60);
  return minutes > 0 ? `~${hours} giờ ${pad2(minutes)} phút` : `~${hours} giờ`;
}

// "45% · 128/280 MB · còn ~4 phút" from an onProgress payload.
export function formatUploadProgress({ pct, loaded, total, etaSec } = {}) {
  const parts = [`${Math.max(0, Math.min(100, Math.round(Number(pct) || 0)))}%`];
  if (Number(total) > 0) parts.push(formatBytesPair(loaded, total));
  const eta = Number(pct) >= 100 ? "" : formatEta(etaSec);
  if (eta) parts.push(`còn ${eta}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const UPLOAD_ERROR_TEXT = {
  offline: {
    message: "Máy đang mất kết nối mạng nên chưa tải file lên được.",
    hint: "Kiểm tra Wi-Fi hoặc mạng rồi thử lại.",
  },
  // Status 0 before any byte was sent: a flaky network looks exactly like a
  // CORS block from the browser's side, so the text names both (network first).
  cors: {
    message: "Không gửi được file tới kho lưu trữ R2.",
    hint: "Thường do mạng chập chờn — kiểm tra Wi-Fi rồi thử lại. Nếu lần nào cũng lỗi ngay từ đầu dù mạng tốt, có thể cấu hình CORS của bucket R2 chưa cho phép upload từ tên miền này — báo người hỗ trợ kỹ thuật.",
  },
  network: {
    message: "Mạng bị ngắt giữa chừng khi đang tải file lên.",
    hint: "Kiểm tra mạng rồi thử lại.",
  },
  expired: {
    message: "Link tải lên đã hết hạn hoặc không còn hợp lệ.",
    hint: "Thử lại — hệ thống sẽ tự lấy link mới. Nếu vẫn lỗi, báo người hỗ trợ kỹ thuật.",
  },
  "too-large": {
    message: "File quá lớn, kho lưu trữ từ chối nhận.",
    hint: TOO_LARGE_HINT,
  },
  type: {
    message: "Định dạng file không được phép.",
    hint: `Chỉ nhận ảnh ${IMAGE_FORMATS}, video ${VIDEO_FORMATS} và PDF.`,
  },
  presign: {
    message: "Server không cấp được link tải lên.",
    hint: "Thử lại sau ít phút. Nếu vẫn lỗi, báo người hỗ trợ kỹ thuật.",
  },
  server: {
    message: "Kho lưu trữ R2 đang gặp lỗi.",
    hint: "Đợi vài phút rồi thử lại.",
  },
  aborted: {
    message: "Đã huỷ tải lên.",
    hint: "",
  },
  stalled: {
    message: "Mạng đứng quá lâu, file không gửi đi được.",
    hint: "Đã tự thử lại 1 lần nhưng vẫn đứng. Kiểm tra mạng rồi thử lại — nên dùng mạng ổn định khi tải file lớn.",
  },
  unknown: {
    message: "Tải file lên thất bại.",
    hint: "Thử lại. Nếu vẫn lỗi, chụp màn hình này gửi người hỗ trợ kỹ thuật.",
  },
};

export class UploadError extends Error {
  constructor(code, { message, hint, status = null, fileName = "", cause } = {}) {
    const known = Object.prototype.hasOwnProperty.call(UPLOAD_ERROR_TEXT, code);
    const safeCode = known ? code : "unknown";
    const text = UPLOAD_ERROR_TEXT[safeCode];
    let finalMessage = message || text.message;
    if (!message && status && (safeCode === "server" || safeCode === "unknown")) {
      finalMessage = `${finalMessage} (mã lỗi ${status})`;
    }
    super(finalMessage);
    this.name = "UploadError";
    this.code = safeCode;
    let finalHint = hint ?? text.hint;
    if (safeCode === "cors" && hint === undefined && typeof window !== "undefined") {
      const origin = window.location?.origin;
      if (origin) {
        finalHint = `Thường do mạng chập chờn — kiểm tra Wi-Fi rồi thử lại. Nếu lần nào cũng lỗi ngay từ đầu dù mạng tốt, có thể cấu hình CORS của bucket R2 chưa cho phép upload từ tên miền này (${origin}) — báo người hỗ trợ kỹ thuật.`;
      }
    }
    this.hint = finalHint;
    this.status = status;
    this.fileName = fileName;
    if (cause) this.cause = cause;
  }
}

// Pure mapping from what we observed about a failed PUT to an error code.
//   aborted → the admin pressed Huỷ (or the panel unmounted)
//   stalled → no progress for STALL_MS (after the automatic retry)
//   online === false → browser says it is offline
//   status 0 while online → the browser blocked the response: almost always
//     the bucket CORS policy; if bytes were already sent, the link dropped.
export function classifyUploadFailure({
  status,
  online = true,
  aborted = false,
  stalled = false,
  loaded = 0,
} = {}) {
  if (aborted) return "aborted";
  if (stalled) return "stalled";
  if (online === false) return "offline";
  const code = Number(status) || 0;
  if (code === 0) return Number(loaded) > 0 ? "network" : "cors";
  if (code === 403) return "expired";
  if (code === 413) return "too-large";
  if (code === 415) return "type";
  if (code >= 500) return "server";
  return "unknown";
}

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

// ---------------------------------------------------------------------------
// Metadata (width / height / duration)
// ---------------------------------------------------------------------------

// Metadata is non-essential (null is accepted everywhere downstream). Some
// files fire NEITHER onload/onloadedmetadata NOR onerror — the element stalls
// at readyState 0. Since getFileMetadata is awaited BEFORE the upload, a
// stalled read would deadlock the whole save, so a watchdog resolves with
// nulls and lets the upload proceed.
const METADATA_TIMEOUT_MS = 12000;

export async function readImageMetadata(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    let timer = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    image.onload = () => finish({ width: image.width, height: image.height });
    image.onerror = () => finish({ width: null, height: null });
    timer = setTimeout(() => finish({ width: null, height: null }), METADATA_TIMEOUT_MS);
    image.src = objectUrl;
  });
}

export async function readVideoMetadata(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    let timer = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    video.onloadedmetadata = () =>
      finish({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(2)) : null,
      });
    video.onerror = () => finish({ width: null, height: null, duration: null });
    timer = setTimeout(
      () => finish({ width: null, height: null, duration: null }),
      METADATA_TIMEOUT_MS
    );
    video.src = objectUrl;
  });
}

// The panels read metadata when a file is picked (to show its duration) and
// again when it is uploaded — remember the promise per File so the second
// read is free.
const metadataCache = typeof WeakMap === "function" ? new WeakMap() : null;

export async function getFileMetadata(file) {
  if (!file || typeof file !== "object") {
    return { width: null, height: null, duration: null };
  }
  const cached = metadataCache?.get(file);
  if (cached) return cached;
  // Use the inferred type so .mov/.mkv with an empty file.type still get
  // their duration read (the watchdog bounds the cost if decoding fails).
  const type = baseType(resolveContentType(file, ""));
  let promise;
  if (type.startsWith("image/")) {
    promise = readImageMetadata(file);
  } else if (type.startsWith("video/")) {
    promise = readVideoMetadata(file);
  } else {
    promise = Promise.resolve({ width: null, height: null, duration: null });
  }
  metadataCache?.set(file, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Auto-fill helpers for the project form (orientation, duration, thumbnail)
// ---------------------------------------------------------------------------

// "landscape" | "portrait" | "square" from a pixel size, null when unknown.
// Sides within 2% of each other count as square (exports are often cropped
// by a few pixels).
export function orientationFromSize(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  if (Math.abs(w - h) < 0.02 * Math.max(w, h)) return "square";
  return h > w ? "portrait" : "landscape";
}

// Clock-style duration for the public "Thời lượng" field:
// 83 → "1:23", 3725 → "1:02:05". "" when unknown.
export function formatClockDuration(sec) {
  const value = Number(sec);
  if (sec === null || sec === undefined || sec === "" || !Number.isFinite(value) || value <= 0) {
    return "";
  }
  const total = Math.max(1, Math.round(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  return `${minutes}:${pad2(seconds)}`;
}

// Seek positions tried by captureVideoFrame: `time` seconds in (never past
// the middle of a short clip), then 25% / 50% of the clip in case the first
// frame is black (fade-in from black is common at the start of a video).
export function captureTimes(duration, time = 1) {
  const wanted = Number(time);
  const first = Number.isFinite(wanted) && wanted >= 0 ? wanted : 1;
  const d = Number(duration);
  if (!Number.isFinite(d) || d <= 0) return [first];
  const times = [Math.min(first, d / 2)];
  [d * 0.25, d * 0.5].forEach((t) => {
    if (t > times[times.length - 1] + 0.05) times.push(t);
  });
  return times;
}

// Output size of a captured frame: same aspect ratio, never upscaled, at
// most `maxWidth` wide. null when the video size is unknown.
export function captureSize(videoWidth, videoHeight, maxWidth = 1280) {
  const w = Number(videoWidth);
  const h = Number(videoHeight);
  if (!(w > 0) || !(h > 0)) return null;
  const limit = Number(maxWidth) > 0 ? Number(maxWidth) : w;
  const scale = Math.min(1, limit / w);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

// True when an RGBA pixel buffer is (almost) entirely black or transparent:
// a fade-in frame, or a video track the browser could not decode (the
// canvas then stays empty).
export function isBlankFrame(data, threshold = 16) {
  if (!data || !data.length) return true;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (data[i] >= threshold || data[i + 1] >= threshold || data[i + 2] >= threshold) {
      return false;
    }
  }
  return true;
}

// "clip.final.mp4" → "clip.final-thumbnail.jpg".
export function thumbnailNameFor(file) {
  const name = String(file?.name || "").trim();
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name) || "video";
  return `${stem}-thumbnail.jpg`;
}

const CAPTURE_TIMEOUT_MS = 15000;
const CAPTURE_PROBE_SIZE = 16;

// Grab one frame of a picked video as a JPEG File (for an automatic
// thumbnail). Resolves null — never throws — when the browser cannot decode
// the video (e.g. HEVC / MKV on some browsers), every tried frame is black,
// or nothing happens within the watchdog timeout.
export function captureVideoFrame(
  file,
  { time = 1, maxWidth = 1280, timeoutMs = CAPTURE_TIMEOUT_MS } = {}
) {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || typeof URL === "undefined" || !file) {
      resolve(null);
      return;
    }
    if (!baseType(resolveContentType(file, "")).startsWith("video/")) {
      resolve(null);
      return;
    }

    let objectUrl = "";
    let video = null;
    let timer = null;
    let settled = false;
    let times = [];
    let attempt = 0;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (video) {
        video.onloadedmetadata = null;
        video.onseeked = null;
        video.onerror = null;
        try {
          video.removeAttribute("src");
          video.load();
        } catch {}
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(result || null);
    };

    const seekNext = () => {
      if (attempt >= times.length) {
        finish(null);
        return;
      }
      const target = times[attempt];
      attempt += 1;
      try {
        video.currentTime = target;
      } catch {
        finish(null);
      }
    };

    const frameIsBlank = () => {
      const probe = document.createElement("canvas");
      probe.width = CAPTURE_PROBE_SIZE;
      probe.height = CAPTURE_PROBE_SIZE;
      const ctx = probe.getContext("2d");
      if (!ctx) return false;
      ctx.drawImage(video, 0, 0, CAPTURE_PROBE_SIZE, CAPTURE_PROBE_SIZE);
      return isBlankFrame(ctx.getImageData(0, 0, CAPTURE_PROBE_SIZE, CAPTURE_PROBE_SIZE).data);
    };

    const draw = () => {
      if (settled) return;
      try {
        const size = captureSize(video.videoWidth, video.videoHeight, maxWidth);
        if (!size) {
          finish(null);
          return;
        }
        if (frameIsBlank()) {
          seekNext();
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext("2d");
        if (!ctx || typeof canvas.toBlob !== "function") {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, size.width, size.height);
        canvas.toBlob(
          (blob) => {
            if (!blob || !blob.size) {
              finish(null);
              return;
            }
            const name = thumbnailNameFor(file);
            const lastModified = Date.now();
            try {
              finish(new File([blob], name, { type: "image/jpeg", lastModified }));
            } catch {
              // Very old browsers without the File constructor.
              finish(Object.assign(blob, { name, lastModified }));
            }
          },
          "image/jpeg",
          0.85
        );
      } catch {
        finish(null);
      }
    };

    try {
      objectUrl = URL.createObjectURL(file);
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      timer = setTimeout(() => finish(null), timeoutMs);
      video.onerror = () => finish(null);
      video.onloadedmetadata = () => {
        // No picture size = no decodable video track (audio-only, or a codec
        // this browser cannot show).
        if (!video.videoWidth || !video.videoHeight) {
          finish(null);
          return;
        }
        times = captureTimes(video.duration, time);
        seekNext();
      };
      video.onseeked = draw;
      video.src = objectUrl;
    } catch {
      finish(null);
    }
  });
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

// Stall watchdog: onerror does NOT fire when a connection black-holes
// mid-transfer (common on slow networks with large videos), so without it
// the upload would hang forever. A fixed total timeout would wrongly kill
// legitimately slow large uploads, so the timer resets on every progress tick
// and only fires when the transfer is truly stuck.
const STALL_MS = 60000;
// One automatic retry (fresh presign) after a stall or a mid-transfer drop.
const MAX_ATTEMPTS = 2;
const SPEED_WINDOW_MS = 8000;
const PRESIGN_FALLBACK = "Server không cấp được link tải lên";
// The presign request has its own timeout: after a stall the network may be
// black-holed, and a hanging fetch would freeze the save without ever
// reaching the 'stalled' error.
const PRESIGN_TIMEOUT_MS = 30000;

function now() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

// Sliding-window speed estimate so the ETA follows the current speed instead
// of the average since the start.
function createProgressTracker(total) {
  const samples = [];
  return (loaded) => {
    const t = now();
    samples.push({ t, loaded });
    while (samples.length > 2 && t - samples[0].t > SPEED_WINDOW_MS) samples.shift();
    const first = samples[0];
    const seconds = (t - first.t) / 1000;
    const bytesPerSec = seconds >= 1 ? Math.max(0, (loaded - first.loaded) / seconds) : null;
    const etaSec =
      bytesPerSec && bytesPerSec > 0 ? Math.max(0, (total - loaded) / bytesPerSec) : null;
    const pct = total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 0;
    return { loaded, total, pct, bytesPerSec, etaSec };
  };
}

function abortable(promise, signal, fileName) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new UploadError("aborted", { fileName }));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new UploadError("aborted", { fileName }));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

function presignMessage(message) {
  const text = String(message || "").trim();
  if (!text) return `${PRESIGN_FALLBACK}.`;
  if (text.startsWith(PRESIGN_FALLBACK)) return text;
  return `${PRESIGN_FALLBACK}: ${text}`;
}

// AbortSignal that fires on the caller's signal OR after `ms`. Manual
// controller instead of AbortSignal.any/timeout for older Safari.
function withTimeout(signal, ms) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  return {
    signal: controller.signal,
    timedOut: () => timedOut && !signal?.aborted,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

async function requestUploadUrl(
  file,
  folder,
  contentType,
  signal,
  timeoutMs = PRESIGN_TIMEOUT_MS
) {
  const fileName = file?.name || "";
  if (!isOnline()) throw new UploadError("offline", { fileName });
  const timeout = withTimeout(signal, timeoutMs);
  let payload;
  try {
    // fetchJson tolerates empty / non-JSON error bodies (502/504 pages,
    // crashed handlers) and always yields a readable message.
    payload = await fetchJson(
      "/api/admin/r2/upload-url",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ filename: file.name, contentType, folder }),
        signal: timeout.signal,
      },
      { fallbackError: PRESIGN_FALLBACK }
    );
  } catch (error) {
    if (signal?.aborted) throw new UploadError("aborted", { fileName, cause: error });
    if (!isOnline()) throw new UploadError("offline", { fileName, cause: error });
    if (timeout.timedOut()) {
      throw new UploadError("stalled", {
        fileName,
        message: "Mạng đứng quá lâu, không lấy được link tải lên.",
        hint: "Kiểm tra mạng rồi thử lại — nên dùng mạng ổn định khi tải file lớn.",
        cause: error,
      });
    }
    if (error?.code === "type-not-allowed") {
      throw new UploadError("type", {
        fileName,
        status: error.status ?? null,
        message: error.message || undefined,
        hint: error.hint || undefined,
        cause: error,
      });
    }
    throw new UploadError("presign", {
      fileName,
      status: error?.status ?? null,
      message: presignMessage(error?.message),
      // A 401 message already says "đăng nhập lại"; other errors may carry
      // an actionable hint from the server (e.g. which R2 env var is missing).
      hint: error?.hint || (error?.status === 401 ? "" : undefined),
      cause: error,
    });
  } finally {
    timeout.done();
  }
  const { key, uploadUrl, publicUrl } = payload?.data || {};
  if (!uploadUrl || !key) {
    throw new UploadError("presign", {
      fileName,
      message: `${PRESIGN_FALLBACK}: server không trả về link.`,
    });
  }
  return { key, uploadUrl, publicUrl };
}

function putFileWithProgress(uploadUrl, file, contentType, { onProgress, signal, retry }) {
  const fileName = file?.name || "";
  const total = Number(file?.size) || 0;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const track = createProgressTracker(total);
    let settled = false;
    let stalled = false;
    let loaded = 0;
    let stallTimer = null;

    const report = (info) => {
      if (typeof onProgress !== "function") return;
      try {
        onProgress({ ...info, retry: Boolean(retry) });
      } catch {
        // A broken progress callback must never break the upload.
      }
    };
    const clearStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearStall();
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const fail = (code, status = null) =>
      finish(() => reject(new UploadError(code, { status, fileName })));
    const failFromState = (status) =>
      fail(
        classifyUploadFailure({
          status,
          online: isOnline(),
          aborted: Boolean(signal?.aborted),
          stalled,
          loaded,
        }),
        status || null
      );
    function onAbort() {
      try {
        xhr.abort();
      } catch {}
      fail("aborted");
    }
    const armStall = () => {
      clearStall();
      stallTimer = setTimeout(() => {
        stalled = true;
        try {
          xhr.abort();
        } catch {}
        fail("stalled");
      }, STALL_MS);
    };

    if (signal?.aborted) {
      fail("aborted");
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    xhr.upload.onprogress = (event) => {
      armStall();
      if (event.lengthComputable) {
        loaded = event.loaded;
        report(track(loaded));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        finish(() => {
          report({ loaded: total, total, pct: 100, bytesPerSec: null, etaSec: 0 });
          resolve();
        });
      } else {
        failFromState(xhr.status);
      }
    };
    xhr.onerror = () => failFromState(0);
    xhr.onabort = () => failFromState(0);

    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    armStall();
    report({ loaded: 0, total, pct: 0, bytesPerSec: null, etaSec: null });
    xhr.send(file);
  });
}

// Upload one file to R2 and return the asset shape the admin stores:
// { key, url, previewUrl, name, mime, size, previewSize, width, height, duration }.
// onProgress({ loaded, total, pct, bytesPerSec, etaSec, retry }); `signal`
// aborts the presign request and the PUT. Throws UploadError.
export async function uploadFile(
  file,
  folder,
  {
    onProgress,
    signal,
    fallbackContentType = "application/octet-stream",
    presignTimeoutMs = PRESIGN_TIMEOUT_MS,
  } = {}
) {
  const fileName = file?.name || "";
  if (!file) {
    throw new UploadError("type", { message: "Chưa chọn file.", hint: "" });
  }
  if (signal?.aborted) throw new UploadError("aborted", { fileName });

  // Infer MIME from extension when the browser reports none, so allowlisted
  // formats like .mkv/.mov (whose file.type is often empty) aren't rejected.
  const contentType = resolveContentType(file, fallbackContentType);
  if (!isAllowedUploadType(contentType)) {
    throw new UploadError("type", { fileName });
  }
  if (Number(file.size) > MAX_UPLOAD_BYTES) {
    throw new UploadError("too-large", {
      fileName,
      message: tooLargeMessage(fileName || "file", file.size),
    });
  }

  const metadata = await abortable(getFileMetadata(file), signal, fileName);

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // Fresh presign per attempt: a retried PUT must not reuse a URL that may
    // be close to expiry.
    const { key, uploadUrl, publicUrl } = await requestUploadUrl(
      file,
      folder,
      contentType,
      signal,
      presignTimeoutMs
    );
    try {
      await putFileWithProgress(uploadUrl, file, contentType, {
        onProgress,
        signal,
        retry: attempt > 1,
      });
      return {
        key,
        url: publicUrl,
        previewUrl: null,
        name: file.name,
        mime: contentType,
        size: file.size,
        previewSize: null,
        width: metadata?.width || null,
        height: metadata?.height || null,
        duration: metadata?.duration || null,
      };
    } catch (error) {
      lastError = error;
      // 'cors' is retried too: before the first byte a Wi-Fi blip looks the
      // same as a CORS block, and a real CORS block just fails again fast.
      const transient =
        error instanceof UploadError &&
        (error.code === "stalled" || error.code === "network" || error.code === "cors");
      const willRetry = transient && attempt < MAX_ATTEMPTS && !signal?.aborted;
      // R2 may already have committed this attempt's object (e.g. the link
      // dropped after 100% was sent). Its key is never returned to the
      // caller, so delete it here (best-effort, a missing key is ignored).
      if (transient || error?.code === "aborted") cleanupUploadedKeys([key]);
      if (willRetry) continue;
      throw error;
    }
  }
  throw lastError || new UploadError("unknown", { fileName });
}

// Upload a batch (e.g. image-project photos) with limited concurrency.
// tasks: [{ id, file, folder }]. onTaskUpdate(id, patch) receives
// { status: 'uploading' | 'done' | 'error', ...progress, result?, error? }.
// One failure does NOT stop the others; aborting `signal` stops the tasks
// that have not started (they end as 'error' with code 'aborted').
// Resolves (never rejects) with [{ id, status: 'done', result } |
// { id, status: 'error', error }] in task order.
export async function runUploadQueue(
  tasks,
  { concurrency = 3, onTaskUpdate, signal, uploader = uploadFile } = {}
) {
  const list = Array.isArray(tasks) ? tasks : [];
  const results = list.map((task) => ({ id: task?.id, status: "pending" }));
  const notify = (index, patch) => {
    if (typeof onTaskUpdate !== "function") return;
    try {
      onTaskUpdate(list[index]?.id, patch);
    } catch {
      // UI callback errors must not break the queue.
    }
  };

  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      const task = list[index];
      if (signal?.aborted) {
        const error = new UploadError("aborted", { fileName: task?.file?.name || "" });
        results[index] = { id: task?.id, status: "error", error };
        notify(index, { status: "error", error });
        continue;
      }
      notify(index, { status: "uploading", pct: 0, loaded: 0 });
      try {
        const result = await uploader(task.file, task.folder, {
          signal,
          onProgress: (info) => notify(index, { status: "uploading", ...info }),
        });
        results[index] = { id: task.id, status: "done", result };
        notify(index, { status: "done", pct: 100, result });
      } catch (error) {
        results[index] = { id: task.id, status: "error", error };
        notify(index, { status: "error", error });
      }
    }
  };

  const limit = Math.max(1, Math.min(Math.floor(Number(concurrency)) || 1, list.length || 1));
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

// ---------------------------------------------------------------------------
// Cleanup of uploaded-but-never-saved objects
// ---------------------------------------------------------------------------

const CLEANUP_URL = "/api/admin/r2/cleanup";

function normalizeKeys(keys) {
  return Array.from(
    new Set(
      (Array.isArray(keys) ? keys : []).filter(
        (k) => typeof k === "string" && k.trim().length > 0
      )
    )
  );
}

// Best-effort: ask the server to delete objects that were already PUT to R2
// during a save attempt that ultimately failed, so they don't orphan in the
// bucket. Never throws — a failed cleanup just leaves an orphan, it must not
// block or mask the user-facing error.
export async function cleanupUploadedKeys(keys) {
  const list = normalizeKeys(keys);
  if (list.length === 0) return;
  try {
    await fetch(CLEANUP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ keys: list }),
    });
  } catch {
    // Swallow — best-effort cleanup.
  }
}

// Same as cleanupUploadedKeys but safe to call from `pagehide` while the
// page is being torn down: sendBeacon (same-origin, so the admin cookie is
// sent) with a keepalive fetch as fallback. Returns true when queued.
export function cleanupUploadedKeysOnUnload(keys) {
  const list = normalizeKeys(keys);
  if (list.length === 0) return false;
  const body = JSON.stringify({ keys: list });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(CLEANUP_URL, new Blob([body], { type: "application/json" }))) {
        return true;
      }
    }
  } catch {
    // Some older browsers reject non-CORS-safelisted Blob types — fall back.
  }
  try {
    fetch(CLEANUP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body,
      keepalive: true,
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
