"use client";
import { useEffect, useState } from "react";

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

async function uploadShowreelToR2(file, onProgress) {
  const meta = await readVideoMetadata(file);
  const contentType = file.type || "video/mp4";

  const presignRes = await fetch("/api/admin/r2/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType, folder: "showreel" }),
  });
  const presignPayload = await presignRes.json().catch(() => ({}));
  if (!presignRes.ok) {
    throw new Error(presignPayload?.error || `Failed to obtain upload URL (${presignRes.status}).`);
  }
  const { key, uploadUrl, publicUrl } = presignPayload.data || {};
  if (!uploadUrl) throw new Error("Server did not return an upload URL.");

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    if (typeof onProgress === "function") {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`R2 upload failed (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new Error("Upload was aborted."));
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
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/showreel", { cache: "no-store" });
        const payload = await res.json();
        if (alive && res.ok) setShowreel(payload?.data || null);
      } catch {
        // Swallow — error UI not needed for initial load.
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
      const res = await fetch("/api/admin/showreel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(asset),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Lưu thất bại (${res.status}).`);
      setShowreel(payload?.data || null);
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
      const res = await fetch("/api/admin/showreel", { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Xoá thất bại.");
      }
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
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Chưa có showreel — trang chủ đang dùng <code>/showreel.mp4</code> mặc định trong codebase.
        </div>
      )}
    </div>
  );
}
