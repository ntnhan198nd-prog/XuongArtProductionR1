// Shared client-side helpers for the admin R2 upload flow.
// (Imported only by client components — no server-only code here.)

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

// Best-effort: ask the server to delete objects that were already PUT to R2
// during a save attempt that ultimately failed, so they don't orphan in the
// bucket. Never throws — a failed cleanup just leaves an orphan, it must not
// block or mask the user-facing error.
export async function cleanupUploadedKeys(keys) {
  const list = (Array.isArray(keys) ? keys : []).filter(
    (k) => typeof k === "string" && k.trim().length > 0
  );
  if (list.length === 0) return;
  try {
    await fetch("/api/admin/r2/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ keys: list }),
    });
  } catch {
    // Swallow — best-effort cleanup.
  }
}
