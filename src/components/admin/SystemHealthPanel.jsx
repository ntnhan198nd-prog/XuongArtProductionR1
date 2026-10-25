"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/apiClient";
import { formatRelativeVi, formatVnDateTime } from "@/lib/contentHistory";
import { cleanupUploadedKeys, formatBytes, uploadFile } from "@/lib/uploadClient";
import { useToast } from "@/components/admin/ToastProvider";

// Admin "Hệ thống" tab, in three parts:
//   1. Traffic-light rows from GET /api/admin/health (R2 settings, bucket,
//      content file, one media file, public access to the content file).
//      Runs once when the tab is first opened, then only on "Kiểm tra lại".
//   2. "Thử upload từ trình duyệt": a real round trip from THIS browser —
//      upload a 1×1 PNG to uploads/, open it through its public URL, delete
//      it — with the exact CORS JSON to paste into Cloudflare when the
//      browser is blocked.
//   3. "File thừa trên R2": GET /api/admin/r2/orphans, deletion behind a
//      typed confirmation (POST, the server re-checks every key).

// Must not exceed ORPHAN_DELETE_MAX_KEYS in lib/healthChecks.js (server-only).
const ORPHAN_DELETE_BATCH = 200;
const ORPHAN_LIST_LIMIT = 300;
const IMAGE_PROBE_TIMEOUT_MS = 10000;

// Smallest valid PNG (1×1 pixel).
export const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
export const TEST_UPLOAD_FOLDER = "uploads";
const TEST_FILE_NAME = "xuongart-upload-test.png";

// CORS policy for the R2 bucket (Cloudflare → R2 → bucket → Settings →
// CORS Policy), allowing the admin on `origin` to upload (PUT) and read.
export function buildR2CorsJson(origin) {
  const cleanOrigin = String(origin || "").trim().replace(/\/+$/, "");
  return JSON.stringify(
    [
      {
        AllowedOrigins: [cleanOrigin],
        AllowedMethods: ["GET", "PUT", "HEAD"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3600,
      },
    ],
    null,
    2
  );
}

// "XOA", "xoa", "Xoá", " XOÁ " all confirm.
export function isDeleteConfirmText(value) {
  return (
    String(value || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toUpperCase() === "XOA"
  );
}

export function makeTestPngFile() {
  const binary = atob(TEST_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], TEST_FILE_NAME, { type: "image/png" });
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url || "";
  }
}

// Can the browser display the image at all? (An <img> needs no CORS.)
function loadImageProbe(url) {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), IMAGE_PROBE_TIMEOUT_MS);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

// Step 2 of the upload test. { level, message, hint, cors }.
export async function checkPublicFile(
  url,
  { fetchImpl = globalThis.fetch, loadImage = loadImageProbe, signal } = {}
) {
  const host = hostOf(url);
  let status;
  try {
    const response = await fetchImpl(url, { cache: "no-store", signal });
    status = Number(response.status) || 0;
  } catch (error) {
    if (signal?.aborted) throw error;
    // Blocked by CORS or the network: can it at least be displayed?
    const shown = await loadImage(url);
    if (shown) {
      return {
        level: "warn",
        cors: true,
        message: `Ảnh hiện được qua ${host}, nhưng trình duyệt chặn đọc trực tiếp (CORS chưa cho phép GET).`,
        hint: "Website vẫn chạy bình thường. Nên thêm cấu hình CORS bên dưới để mọi chức năng admin hoạt động đầy đủ.",
      };
    }
    return {
      level: "error",
      cors: true,
      message: `Không mở được ảnh qua ${host}.`,
      hint: "Kiểm tra R2_PUBLIC_URL là tên miền công khai của bucket và bucket đã bật truy cập công khai.",
    };
  }
  if (status === 200) {
    return { level: "ok", message: `Mở được ảnh qua ${host} (HTTP 200).`, hint: "" };
  }
  if (status === 404) {
    return {
      level: "error",
      message: `Không thấy ảnh qua ${host} (HTTP 404).`,
      hint: "R2_PUBLIC_URL có thể đang trỏ tới một bucket khác với bucket đang lưu file.",
    };
  }
  if (status === 401 || status === 403) {
    return {
      level: "error",
      message: `${host} từ chối cho xem ảnh (HTTP ${status}).`,
      hint: "Bật truy cập công khai cho bucket (Public access hoặc Custom domain) trên Cloudflare.",
    };
  }
  return {
    level: "error",
    message: `${host} trả về lỗi HTTP ${status} khi mở ảnh.`,
    hint: "Thử lại sau ít phút.",
  };
}

const LEVELS = {
  ok: {
    icon: "✓",
    text: "Ổn",
    badge: "bg-green-100 text-green-800 ring-green-300",
    row: "border-green-200",
  },
  warn: {
    icon: "!",
    text: "Lưu ý",
    badge: "bg-amber-100 text-amber-900 ring-amber-300",
    row: "border-amber-300",
  },
  error: {
    icon: "✕",
    text: "Lỗi",
    badge: "bg-red-100 text-red-800 ring-red-300",
    row: "border-red-300",
  },
  skip: {
    icon: "–",
    text: "Chưa kiểm tra",
    badge: "bg-gray-100 text-gray-600 ring-gray-300",
    row: "border-gray-200",
  },
  running: {
    icon: "…",
    text: "Đang chạy",
    badge: "bg-blue-50 text-blue-800 ring-blue-200",
    row: "border-gray-200",
  },
  pending: {
    icon: "·",
    text: "Chờ",
    badge: "bg-gray-50 text-gray-500 ring-gray-200",
    row: "border-gray-200",
  },
};

function LevelBadge({ level }) {
  const info = LEVELS[level] || LEVELS.skip;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${info.badge}`}
    >
      <span aria-hidden="true">{info.icon}</span>
      {info.text}
    </span>
  );
}

function ErrorBox({ message, hint, children }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p className="break-words">{message}</p>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-red-800">💡 {hint}</p> : null}
      {children}
    </div>
  );
}

function StatusRow({ level, label, message, hint }) {
  const info = LEVELS[level] || LEVELS.skip;
  return (
    <li className={`rounded-xl border p-3 ${info.row}`}>
      <div className="flex flex-wrap items-center gap-2">
        <LevelBadge level={level} />
        <span className="text-sm font-medium text-gray-900">{label}</span>
      </div>
      {message ? <p className="mt-1.5 break-words text-sm text-gray-700">{message}</p> : null}
      {hint ? (
        <p className="mt-1 break-words text-xs leading-relaxed text-gray-600">💡 {hint}</p>
      ) : null}
    </li>
  );
}

function summaryText(report) {
  const items = Array.isArray(report?.items) ? report.items : [];
  const errors = items.filter((item) => item.level === "error").length;
  const warns = items.filter((item) => item.level === "warn").length;
  if (errors > 0) return `Có ${errors} lỗi cần sửa${warns ? ` và ${warns} lưu ý` : ""}.`;
  if (warns > 0) return `Mọi thứ đang chạy được — có ${warns} lưu ý.`;
  return "Mọi thứ đều ổn ✓";
}

async function copyText(text, fallbackNode) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the selection fallback.
  }
  try {
    fallbackNode?.focus();
    fallbackNode?.select();
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

function CorsHelp({ origin, bucket, onCopy }) {
  const textareaRef = useRef(null);
  const json = buildR2CorsJson(origin);
  const cleanOrigin = String(origin || "").trim().replace(/\/+$/, "");
  return (
    <div className="space-y-2 text-sm text-gray-700">
      <p>
        Cách sửa: vào Cloudflare → <strong>R2</strong> → bucket{" "}
        <strong>{bucket ? `“${bucket}”` : "đang dùng"}</strong> → <strong>Settings</strong> →{" "}
        <strong>CORS Policy</strong> → <strong>Add / Edit</strong>, rồi:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Nếu ô đang trống:</strong> dán cả đoạn dưới đây → <strong>Save</strong>.
        </li>
        <li>
          <strong>Nếu ô đã có sẵn nội dung: đừng xoá.</strong> Chỉ thêm{" "}
          <code className="break-all rounded bg-gray-100 px-1 font-mono text-xs">
            &quot;{cleanOrigin}&quot;
          </code>{" "}
          vào danh sách <code className="font-mono text-xs">AllowedOrigins</code> (ngăn cách
          bằng dấu phẩy), kiểm tra <code className="font-mono text-xs">AllowedMethods</code> có
          đủ GET, PUT, HEAD → <strong>Save</strong>. Xoá nội dung cũ có thể làm hỏng việc upload
          từ những địa chỉ khác đang chạy tốt (ví dụ bản có www hoặc bản .vercel.app).
        </li>
      </ul>
      <p>Đợi khoảng 1 phút rồi bấm “Thử upload” lại.</p>
      <textarea
        ref={textareaRef}
        readOnly
        value={json}
        rows={json.split("\n").length}
        onFocus={(event) => event.target.select()}
        aria-label="Cấu hình CORS cho bucket R2"
        className="block w-full resize-none rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-900"
      />
      <button
        type="button"
        onClick={async () => onCopy(await copyText(json, textareaRef.current))}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
      >
        Chép đoạn cấu hình
      </button>
    </div>
  );
}

const UPLOAD_STEPS = [
  { id: "upload", label: "Tải ảnh thử (1×1 điểm ảnh) lên R2" },
  { id: "public", label: "Mở ảnh qua đường dẫn công khai" },
  { id: "cleanup", label: "Xoá ảnh thử" },
];

function freshSteps() {
  return UPLOAD_STEPS.map((step) => ({ ...step, status: "pending", message: "", hint: "" }));
}

const smallButton =
  "shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50";

export default function SystemHealthPanel({ active = true }) {
  const toast = useToast();
  const mountedRef = useRef(true);
  const startedRef = useRef(false);
  const [origin, setOrigin] = useState("");

  // --- 1. Health ----------------------------------------------------------
  const [health, setHealth] = useState({ loading: false, data: null, error: null });
  const healthRequestRef = useRef(0);
  const runHealth = useCallback(async () => {
    const requestId = healthRequestRef.current + 1;
    healthRequestRef.current = requestId;
    setHealth((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetchJson(
        "/api/admin/health",
        { cache: "no-store" },
        { fallbackError: "Không kiểm tra được hệ thống" }
      );
      if (!mountedRef.current || healthRequestRef.current !== requestId) return;
      setHealth({ loading: false, data, error: null });
    } catch (error) {
      if (!mountedRef.current || healthRequestRef.current !== requestId) return;
      setHealth((prev) => ({
        ...prev,
        loading: false,
        error: { message: error.message, hint: error.hint || "" },
      }));
    }
  }, []);

  // --- 3. Orphans -----------------------------------------------------------
  const [orphans, setOrphans] = useState({ loading: false, data: null, error: null });
  const orphanRequestRef = useRef(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(null); // { done, total } while deleting
  const confirmTriggerRef = useRef(null);
  const returnFocusRef = useRef(false);
  // Closing the typed confirmation returns focus to "Xoá các file thừa"
  // (when it is still there) instead of dropping it to <body>.
  useEffect(() => {
    if (confirmOpen || !returnFocusRef.current) return;
    returnFocusRef.current = false;
    confirmTriggerRef.current?.focus();
  }, [confirmOpen]);
  const scanOrphans = useCallback(async () => {
    const requestId = orphanRequestRef.current + 1;
    orphanRequestRef.current = requestId;
    setOrphans((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetchJson(
        "/api/admin/r2/orphans",
        { cache: "no-store" },
        { fallbackError: "Không quét được file trên R2" }
      );
      if (!mountedRef.current || orphanRequestRef.current !== requestId) return;
      setOrphans({ loading: false, data, error: null });
    } catch (error) {
      if (!mountedRef.current || orphanRequestRef.current !== requestId) return;
      setOrphans((prev) => ({
        ...prev,
        loading: false,
        error: { message: error.message, hint: error.hint || "" },
      }));
    }
  }, []);

  // Bucket checks run once, when the tab is first opened; after that only
  // on demand ("Kiểm tra lại" / "Quét lại").
  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    runHealth();
    scanOrphans();
  }, [active, runHealth, scanOrphans]);

  // --- 2. Upload round trip -----------------------------------------------
  const [steps, setSteps] = useState(freshSteps);
  const [uploadRunning, setUploadRunning] = useState(false);
  const [uploadRan, setUploadRan] = useState(false);
  const [corsOpen, setCorsOpen] = useState(false);
  const uploadAbortRef = useRef(null);
  const pendingKeyRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    setOrigin(window.location.origin);
    return () => {
      mountedRef.current = false;
      uploadAbortRef.current?.abort();
      // Panel unmounted mid-test (logout): best-effort delete of the file.
      if (pendingKeyRef.current) cleanupUploadedKeys([pendingKeyRef.current]);
      pendingKeyRef.current = null;
    };
  }, []);

  const patchStep = (id, patch) => {
    if (!mountedRef.current) return;
    setSteps((prev) => prev.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  };

  const removeTestFile = async (key) => {
    patchStep("cleanup", { status: "running" });
    try {
      // Same endpoint as cleanupUploadedKeys(), read here so the step can
      // show whether the file is really gone.
      const payload = await fetchJson(
        "/api/admin/r2/cleanup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ keys: [key] }),
        },
        { fallbackError: "Không xoá được ảnh thử" }
      );
      pendingKeyRef.current = null;
      if (Number(payload?.deleted) >= 1) {
        // The cleanup route only reports what it asked R2 to delete (failed
        // deletes are swallowed): ask the server whether the key is gone.
        let exists = null;
        try {
          const check = await fetchJson(
            `/api/admin/r2/orphans?check=${encodeURIComponent(key)}`,
            { cache: "no-store" },
            { fallbackError: "Không kiểm tra được ảnh thử" }
          );
          exists = typeof check?.exists === "boolean" ? check.exists : null;
        } catch {
          exists = null;
        }
        if (exists === false) {
          patchStep("cleanup", { status: "ok", message: "Đã xoá ảnh thử khỏi R2 (đã kiểm tra lại)." });
        } else if (exists === true) {
          patchStep("cleanup", {
            status: "warn",
            message: "Ảnh thử vẫn còn trên R2 — server chưa xoá được.",
            hint: "Có thể khoá truy cập R2 chưa có quyền xoá. Ảnh chỉ vài chục byte; mục “File thừa trên R2” sẽ dọn nó sau 24 giờ.",
          });
        } else {
          patchStep("cleanup", {
            status: "warn",
            message: "Đã yêu cầu xoá ảnh thử, nhưng chưa kiểm tra được ảnh đã mất hẳn chưa.",
            hint: "Ảnh chỉ vài chục byte; nếu còn sót, mục “File thừa trên R2” sẽ dọn nó sau 24 giờ.",
          });
        }
      } else {
        patchStep("cleanup", {
          status: "warn",
          message: "Server giữ lại ảnh thử.",
          hint: "Ảnh chỉ vài chục byte; mục “File thừa trên R2” sẽ dọn nó sau 24 giờ.",
        });
      }
    } catch (error) {
      pendingKeyRef.current = null;
      patchStep("cleanup", {
        status: "warn",
        message: error.message,
        hint: "Ảnh chỉ vài chục byte; mục “File thừa trên R2” sẽ dọn nó sau 24 giờ.",
      });
    }
  };

  const runUploadTest = async () => {
    if (uploadRunning) return;
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setUploadRunning(true);
    setUploadRan(true);
    setCorsOpen(false);
    setSteps(freshSteps());
    let key = null;
    try {
      patchStep("upload", { status: "running" });
      let asset;
      try {
        asset = await uploadFile(makeTestPngFile(), TEST_UPLOAD_FOLDER, {
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const blocked = error?.code === "cors" || error?.code === "network";
        patchStep("upload", {
          status: "error",
          message: error?.message || "Tải ảnh thử lên thất bại.",
          hint: blocked
            ? "Trình duyệt không gửi được file thẳng tới R2 — nếu mạng vẫn tốt, gần như chắc chắn do cấu hình CORS của bucket. Làm theo hướng dẫn bên dưới."
            : error?.hint || "",
        });
        patchStep("public", { status: "skip" });
        patchStep("cleanup", { status: "skip" });
        if (blocked && mountedRef.current) setCorsOpen(true);
        return;
      }
      key = asset.key;
      pendingKeyRef.current = key;
      patchStep("upload", { status: "ok", message: `Đã tải lên: ${asset.key}` });

      patchStep("public", { status: "running" });
      try {
        const result = await checkPublicFile(asset.url, { signal: controller.signal });
        patchStep("public", { status: result.level, message: result.message, hint: result.hint });
        if (result.cors && mountedRef.current) setCorsOpen(true);
      } catch {
        // Aborted (panel unmounted) — the cleanup below still runs.
      }
    } finally {
      if (key && mountedRef.current) await removeTestFile(key);
      if (mountedRef.current) setUploadRunning(false);
    }
  };

  // --- 3. Orphan deletion -------------------------------------------------
  const orphanData = orphans.data;
  const orphanList = Array.isArray(orphanData?.orphans) ? orphanData.orphans : [];

  const deleteOrphans = async () => {
    if (deleting || !isDeleteConfirmText(confirmText) || orphanList.length === 0) return;
    const keys = orphanList.map((item) => item.key);
    const totals = { deleted: 0, failed: 0, skipped: 0, freedBytes: 0 };
    setDeleting({ done: 0, total: keys.length });
    let failure = null;
    for (let index = 0; index < keys.length; index += ORPHAN_DELETE_BATCH) {
      const batch = keys.slice(index, index + ORPHAN_DELETE_BATCH);
      try {
        const result = await fetchJson(
          "/api/admin/r2/orphans",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keys: batch }),
          },
          { fallbackError: "Không xoá được file thừa" }
        );
        totals.deleted += Array.isArray(result?.deleted) ? result.deleted.length : 0;
        totals.failed += Array.isArray(result?.failed) ? result.failed.length : 0;
        totals.skipped += Array.isArray(result?.skipped) ? result.skipped.length : 0;
        totals.freedBytes += Number(result?.freedBytes) || 0;
      } catch (error) {
        failure = error;
        break;
      }
      if (!mountedRef.current) return;
      setDeleting({ done: Math.min(keys.length, index + batch.length), total: keys.length });
    }
    if (!mountedRef.current) return;
    setDeleting(null);
    setConfirmOpen(false);
    setConfirmText("");

    if (totals.deleted > 0) {
      const notes = [];
      if (totals.skipped > 0) {
        notes.push(`${totals.skipped} file được giữ lại vì vừa được dùng hoặc mới tải lên.`);
      }
      toast.success(
        `Đã xoá ${totals.deleted} file thừa${
          totals.freedBytes ? ` (giải phóng ${formatBytes(totals.freedBytes)})` : ""
        }.`,
        { hint: notes.join(" ") }
      );
    } else if (!failure && totals.failed === 0) {
      toast.info("Không có file nào bị xoá — các file đã được dùng lại hoặc không còn trên R2.");
    }
    if (totals.failed > 0) {
      toast.error(`${totals.failed} file chưa xoá được.`, {
        hint: "Bấm “Quét lại” rồi thử xoá lần nữa sau ít phút.",
      });
    }
    if (failure) {
      toast.error(failure.message, { hint: failure.hint || "" });
    }
    scanOrphans();
  };

  // --- Render ---------------------------------------------------------------
  const report = health.data;
  const items = Array.isArray(report?.items) ? report.items : [];
  const bucket = report?.r2?.bucket || "";
  const totalText = orphanData?.count
    ? `${orphanData.count} file · ${formatBytes(orphanData.totalBytes || 0)}`
    : "";

  return (
    <div className="space-y-8 pt-4">
      <div>
        <h2 className="text-lg font-semibold">Hệ thống</h2>
        <p className="mt-1 text-sm text-gray-600">
          Kiểm tra kết nối tới kho lưu trữ R2 (nơi chứa video, ảnh và nội dung website) và dọn
          file không còn dùng.
        </p>
      </div>

      {/* 1. Health */}
      <section aria-labelledby="system-health-title" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="system-health-title" className="text-base font-semibold">
              Tình trạng kết nối
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Xanh = ổn · Vàng = nên xem qua · Đỏ = cần sửa
              {report?.checkedAt ? ` · kiểm tra lúc ${formatVnDateTime(report.checkedAt)}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={runHealth}
            disabled={health.loading}
            className={`${smallButton} self-start`}
          >
            {health.loading ? "Đang kiểm tra…" : "Kiểm tra lại"}
          </button>
        </div>

        {health.error ? (
          <ErrorBox message={health.error.message} hint={health.error.hint}>
            <button
              type="button"
              onClick={runHealth}
              disabled={health.loading}
              className="mt-2 rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Thử lại
            </button>
          </ErrorBox>
        ) : null}

        {!report && health.loading ? (
          <p role="status" className="text-sm text-gray-500">
            Đang kiểm tra kết nối…
          </p>
        ) : null}

        {report ? (
          <>
            <p
              role="status"
              className={`text-sm font-medium ${
                report.level === "error"
                  ? "text-red-700"
                  : report.level === "warn"
                  ? "text-amber-800"
                  : "text-green-700"
              }`}
            >
              {summaryText(report)}
            </p>
            <ul className="space-y-2">
              {items.map((item) => (
                <StatusRow
                  key={item.id}
                  level={item.level}
                  label={item.label}
                  message={item.message}
                  hint={item.hint}
                />
              ))}
            </ul>
            <details className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600">
              <summary className="cursor-pointer select-none font-medium text-gray-700">
                Chi tiết kỹ thuật (cho người hỗ trợ)
              </summary>
              <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                <dt>Bucket</dt>
                <dd className="break-all">{report.r2?.bucket || "—"}</dd>
                <dt>Endpoint</dt>
                <dd className="break-all">{report.r2?.endpointHost || "—"}</dd>
                <dt>Đường dẫn công khai</dt>
                <dd className="break-all">{report.r2?.publicBaseUrl || "—"}</dd>
                {Object.entries(report.env || {}).map(([name, present]) => (
                  <div key={name} className="contents">
                    <dt className="font-mono">{name}</dt>
                    <dd>{present ? "✓ có" : "✕ chưa có"}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </>
        ) : null}
      </section>

      {/* 2. Upload round trip */}
      <section aria-labelledby="system-upload-title" className="space-y-3">
        <div>
          <h3 id="system-upload-title" className="text-base font-semibold">
            Thử tải file từ trình duyệt này
          </h3>
          <p className="mt-0.5 text-sm text-gray-600">
            Gửi một ảnh nhỏ 1×1 điểm ảnh lên R2, mở lại qua đường dẫn công khai rồi xoá ngay.
            Dùng khi tải video lên bị lỗi ngay từ đầu.
          </p>
        </div>
        <button
          type="button"
          onClick={runUploadTest}
          disabled={uploadRunning}
          className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploadRunning ? "Đang thử…" : "Thử upload từ trình duyệt"}
        </button>
        {uploadRan ? (
          <ol className="space-y-2" aria-live="polite">
            {steps.map((step, index) => (
              <StatusRow
                key={step.id}
                level={step.status}
                label={`${index + 1}. ${step.label}`}
                message={step.message}
                hint={step.hint}
              />
            ))}
          </ol>
        ) : null}
        <details
          open={corsOpen}
          onToggle={(event) => setCorsOpen(event.currentTarget.open)}
          className="rounded-lg border border-gray-200 px-3 py-2"
        >
          <summary className="cursor-pointer select-none text-sm font-medium text-gray-800">
            Cấu hình CORS cần có trên bucket R2
          </summary>
          <div className="mt-2">
            {origin ? (
              <CorsHelp
                origin={origin}
                bucket={bucket}
                onCopy={(copied) =>
                  copied
                    ? toast.success("Đã chép cấu hình CORS.")
                    : toast.info("Chưa chép được — hãy bôi đen đoạn trên rồi chép bằng tay.")
                }
              />
            ) : null}
          </div>
        </details>
      </section>

      {/* 3. Orphans */}
      <section aria-labelledby="system-orphans-title" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="system-orphans-title" className="text-base font-semibold">
              File thừa trên R2
            </h3>
            <p className="mt-0.5 text-sm text-gray-600">
              Video, ảnh đã tải lên nhưng không còn dùng ở đâu — kể cả trong Thùng rác và các
              bản Lịch sử gần đây. Chỉ tính file đã tải lên hơn 24 giờ.
            </p>
          </div>
          <button
            type="button"
            onClick={scanOrphans}
            disabled={orphans.loading || Boolean(deleting)}
            className={`${smallButton} self-start`}
          >
            {orphans.loading ? "Đang quét…" : "Quét lại"}
          </button>
        </div>

        {orphans.error ? (
          <ErrorBox message={orphans.error.message} hint={orphans.error.hint}>
            <button
              type="button"
              onClick={scanOrphans}
              disabled={orphans.loading}
              className="mt-2 rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Thử lại
            </button>
          </ErrorBox>
        ) : null}

        {!orphanData && orphans.loading ? (
          <p role="status" className="text-sm text-gray-500">
            Đang quét file trên R2…
          </p>
        ) : null}

        {orphanData ? (
          <div className="space-y-3">
            {orphanData.status === "unknown" ? (
              <div
                role="status"
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                <p>
                  Chưa xác định được file thừa
                  {orphanData.unknownReason?.message ? `: ${orphanData.unknownReason.message}` : "."}
                </p>
                <p className="mt-1 text-xs">
                  💡 Để an toàn, chưa cho xoá file nào.{" "}
                  {orphanData.unknownReason?.hint || "Thử quét lại sau ít phút."}
                </p>
              </div>
            ) : orphanList.length === 0 ? (
              <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Không có file thừa ✓
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-900">
                  <span className="font-semibold">{totalText}</span> không còn được dùng.
                </p>
                <details className="rounded-lg border border-gray-200 px-3 py-2">
                  <summary className="cursor-pointer select-none text-sm text-gray-700">
                    Xem danh sách
                  </summary>
                  <ul className="mt-2 max-h-80 divide-y divide-gray-100 overflow-y-auto">
                    {orphanList.slice(0, ORPHAN_LIST_LIMIT).map((item) => (
                      <li key={item.key} className="py-1.5">
                        <p className="break-all font-mono text-xs text-gray-900">{item.key}</p>
                        <p className="text-xs text-gray-500">
                          {formatBytes(item.size || 0)}
                          {item.lastModified
                            ? ` · tải lên ${formatVnDateTime(item.lastModified)}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {orphanList.length > ORPHAN_LIST_LIMIT ? (
                    <p className="mt-1 text-xs text-gray-500">
                      … và {orphanList.length - ORPHAN_LIST_LIMIT} file nữa.
                    </p>
                  ) : null}
                </details>

                {confirmOpen ? (
                  <form
                    role="alertdialog"
                    aria-labelledby="orphan-confirm-title"
                    onSubmit={(event) => {
                      event.preventDefault();
                      deleteOrphans();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && !deleting) {
                        setConfirmOpen(false);
                        setConfirmText("");
                      }
                    }}
                    className="space-y-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
                  >
                    <p id="orphan-confirm-title">
                      Xoá vĩnh viễn {totalText} khỏi R2? Không lấy lại được — kể cả từ Lịch sử hay
                      Thùng rác.
                    </p>
                    <label htmlFor="orphan-confirm-input" className="block text-xs">
                      Gõ <strong>XOA</strong> để xác nhận:
                    </label>
                    <input
                      id="orphan-confirm-input"
                      type="text"
                      value={confirmText}
                      onChange={(event) => setConfirmText(event.target.value)}
                      autoFocus
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      disabled={Boolean(deleting)}
                      className="w-40 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm text-black focus:border-red-600 focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmOpen(false);
                          setConfirmText("");
                        }}
                        disabled={Boolean(deleting)}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Huỷ
                      </button>
                      <button
                        type="submit"
                        disabled={Boolean(deleting) || !isDeleteConfirmText(confirmText)}
                        className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deleting
                          ? `Đang xoá… (${deleting.done}/${deleting.total})`
                          : `Xoá ${orphanList.length} file`}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    ref={confirmTriggerRef}
                    type="button"
                    onClick={() => {
                      returnFocusRef.current = true;
                      setConfirmOpen(true);
                    }}
                    disabled={!orphanData.canDelete || orphans.loading}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Xoá các file thừa
                  </button>
                )}
              </>
            )}

            <p className="text-xs text-gray-500">
              Đã quét {orphanData.scanned} file
              {orphanData.folders?.length ? ` trong ${orphanData.folders.join(", ")}` : ""}
              {orphanData.scannedAt ? ` · ${formatRelativeVi(orphanData.scannedAt)}` : ""}.
              {orphanData.tooNewCount
                ? ` ${orphanData.tooNewCount} file mới tải lên trong 24 giờ chưa được tính.`
                : ""}
              {orphanData.truncated
                ? ` Bucket có nhiều hơn ${orphanData.cap} file — mới quét ${orphanData.cap} file đầu.`
                : ""}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
