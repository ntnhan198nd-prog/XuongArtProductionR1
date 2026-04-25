import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

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
