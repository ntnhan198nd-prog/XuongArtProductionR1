"use client";
import { useEffect, useState } from "react";
import { resolveContentType, cleanupUploadedKeys } from "@/lib/uploadClient";
import { fetchJson } from "@/lib/apiClient";

// Watchdog: some videos fire neither onloadedmetadata nor onerror (codec the
// browser can't decode). Without a timeout the awaited read deadlocks the
// whole upload, so resolve with nulls (metadata is optional) and continue.
async function readVideoMetadata(file) {
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
    timer = setTimeout(() => finish({ width: null, height: null, duration: null }), 12000);
    video.src = objectUrl;
  });
}

async function uploadShowreelToR2(file, onProgress) {
  const meta = await readVideoMetadata(file);
  const contentType = resolveContentType(file, "video/mp4");

  // fetchJson tolerates empty / non-JSON error bodies and always yields a
  // message that includes the HTTP status.
  const presignPayload = await fetchJson(
    "/api/admin/r2/upload-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType, folder: "showreel" }),
    },
    { fallbackError: "Không lấy được upload URL" }
  );
  const { key, uploadUrl, publicUrl } = presignPayload.data || {};
  if (!uploadUrl) throw new Error("Server did not return an upload URL.");

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);

    // Stall watchdog: onerror does not fire on a black-holed connection, so a
    // stalled upload (common for 200-500MB showreels on slow links) would hang
    // forever. Reset on each progress tick; abort only when truly stuck.
    const STALL_MS = 60000;
    let stallTimer = null;
    const clearStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const armStall = () => {
      clearStall();
      stallTimer = setTimeout(() => {
        try {
          xhr.abort();
        } catch {}
        reject(new Error("Upload stalled (no progress). Check your connection and try again."));
      }, STALL_MS);
    };

    xhr.upload.onprogress = (event) => {
      armStall();
      if (event.lengthComputable && typeof onProgress === "function") {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      clearStall();
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`R2 upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => {
      clearStall();
      reject(new Error("Network error during upload."));
    };
    xhr.onabort = () => {
      clearStall();
      reject(new Error("Upload was aborted."));
    };
    armStall();
    xhr.send(file);
  });

  return {
    key,
    url: publicUrl,
    name: file.name,
    mime: contentType,
    size: file.size,
    width: meta.width,
    height: meta.height,
    duration: meta.duration,
  };
}

export default function ShowreelPanel() {
  const [showreel, setShowreel] = useState(null);
  const [loading, setLoading] = useState(true);
  // True when the initial GET failed: we then don't know whether a showreel
  // exists, so the "Chưa có showreel" empty state must not be shown.
  const [loadFailed, setLoadFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const payload = await fetchJson(
          "/api/admin/showreel",
          { cache: "no-store" },
          { fallbackError: "Không tải được showreel" }
        );
        if (alive) {
          setShowreel(payload?.data || null);
          setLoadFailed(false);
        }
      } catch (loadError) {
        // Surface the load failure (previously swallowed) so a broken R2
        // config is visible here too instead of looking like "no showreel".
        if (alive) {
          setLoadFailed(true);
          setError(loadError.message);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleChoose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setError("");
    try {
      const asset = await uploadShowreelToR2(file, setProgress);
      let payload;
      try {
        payload = await fetchJson(
          "/api/admin/showreel",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(asset),
          },
          { fallbackError: "Lưu thất bại" }
        );
      } catch (saveError) {
        // Upload succeeded but the save didn't persist — delete the orphaned
        // object so it doesn't linger in the bucket.
        await cleanupUploadedKeys(asset?.key ? [asset.key] : []);
        throw saveError;
      }
      setShowreel(payload?.data || null);
      setLoadFailed(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleClear = async () => {
    if (!window.confirm("Xoá showreel hiện tại? Trang chủ sẽ rơi về video mặc định.")) return;
    setError("");
    try {
      await fetchJson(
        "/api/admin/showreel",
        { method: "DELETE" },
        { fallbackError: "Xoá thất bại" }
      );
      setShowreel(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Showreel trang chủ</h2>
          <p className="mt-1 text-xs text-gray-600">
            Video phát loop ở hero banner trang chủ. Nên dùng mp4/webm, dài
            tối đa ~30s, độ phân giải 1080p.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label
            className={`cursor-pointer rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 ${
              uploading ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {uploading
              ? `Đang tải... ${Math.round(progress * 100)}%`
              : showreel
              ? "Thay video"
              : "Upload showreel"}
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleChoose}
              disabled={uploading}
            />
          </label>
          {showreel && !uploading ? (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
            >
              Xoá
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Đang tải...</p>
      ) : showreel ? (
        <div className="mt-4">
          <video
            src={showreel.url}
            className="max-h-72 w-full rounded-lg bg-black object-contain"
            controls
            playsInline
            preload="metadata"
          />
          <div className="mt-2 break-all text-xs text-gray-600">
            {showreel.name ? <span className="font-medium">{showreel.name}</span> : null}
            {showreel.duration ? <span> · {showreel.duration}s</span> : null}
            {showreel.width && showreel.height ? (
              <span>
                {" "}
                · {showreel.width}×{showreel.height}
              </span>
            ) : null}
          </div>
        </div>
      ) : loadFailed ? (
        <div className="mt-4 rounded-lg border border-dashed border-red-200 p-6 text-center text-sm text-gray-500">
          Không kiểm tra được showreel hiện tại (xem lỗi ở trên). Upload vẫn
          có thể thử lại sau khi sửa kết nối R2.
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Chưa có showreel — trang chủ đang dùng <code>/showreel.mp4</code> mặc định trong codebase.
        </div>
      )}
    </div>
  );
}
