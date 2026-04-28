import "server-only";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

function buildEndpoint() {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT;
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) return "";
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function getR2Config() {
  const endpoint = buildEndpoint();
  return {
    endpoint,
    bucket: process.env.R2_BUCKET || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    publicBaseUrl: (process.env.R2_PUBLIC_URL || "").replace(/\/$/, ""),
  };
}

export function validateR2Config() {
  const config = getR2Config();
  const missing = [];

  if (!config.endpoint) missing.push("R2_ACCOUNT_ID (or R2_ENDPOINT)");
  if (!config.bucket) missing.push("R2_BUCKET");
  if (!config.accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!config.secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!config.publicBaseUrl) missing.push("R2_PUBLIC_URL");

  return { valid: missing.length === 0, missing, config };
}

let cachedClient = null;

export function getR2Client() {
  if (cachedClient) return cachedClient;

  const { endpoint, accessKeyId, secretAccessKey } = getR2Config();

  cachedClient = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return cachedClient;
}

export function getPublicFileUrl(key) {
  const { publicBaseUrl } = getR2Config();
  if (!publicBaseUrl) return "";
  return `${publicBaseUrl}/${String(key || "").replace(/^\/+/, "")}`;
}

// Allowlist for files that the admin can upload. Anything outside this set
// is rejected at the presign / direct-upload layer so the bucket cannot
// host arbitrary HTML/SVG/script payloads even if the admin cookie leaks.
const ALLOWED_CONTENT_TYPES = new Set([
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

export function isAllowedContentType(contentType) {
  if (!contentType) return false;
  // Trim charset / boundary parameters before comparing.
  const base = String(contentType).split(";")[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.has(base);
}

// Folder allowlist matches the directories the admin UI actually writes
// to. Everything else is rejected so a compromised session can't scatter
// files across arbitrary prefixes (or under "_admin/" where the content
// store lives).
const ALLOWED_FOLDERS = new Set([
  "projects",
  "image-projects",
  "thumbnails",
  "brands",
  "services",
  "showreel",
  "uploads",
]);

export function isAllowedFolder(folder) {
  return ALLOWED_FOLDERS.has(String(folder || "").toLowerCase());
}

// Delete a list of R2 keys, ignoring missing objects. We swallow individual
// failures here because orphan cleanup is best-effort — losing a delete
// just leaves a stale file, while throwing would block the user-facing
// admin save that triggered cleanup. Errors are logged for ops follow-up.
export async function deleteR2Keys(keys) {
  const list = (Array.isArray(keys) ? keys : [keys])
    .filter((key) => typeof key === "string" && key.trim().length > 0);
  if (list.length === 0) return;

  const validation = validateR2Config();
  if (!validation.valid) return;
  const client = getR2Client();
  const { bucket } = getR2Config();

  await Promise.all(
    list.map((key) =>
      client
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
        .catch((error) => {
          console.error(`R2 delete failed for key ${key}:`, error?.message || error);
        })
    )
  );
}
