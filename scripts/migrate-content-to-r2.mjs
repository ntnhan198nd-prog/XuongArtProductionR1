// One-time migration: upload data/content.json to R2 at _admin/content.json.
// Run locally: `node scripts/migrate-content-to-r2.mjs`
// Reads .env.local for R2 credentials.

import fs from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const STORE_KEY = "_admin/content.json";

function parseEnvFile(filePath) {
  return fs.readFile(filePath, "utf8").then((content) => {
    const env = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
  });
}

async function main() {
  const env = await parseEnvFile(path.resolve(".env.local"));

  const accountId = env.R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  const bucket = env.R2_BUCKET || process.env.R2_BUCKET;
  const accessKeyId = env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey =
    env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    console.error("Missing R2 credentials in .env.local");
    process.exit(1);
  }

  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  // Read local content.json
  const localPath = path.resolve("data/content.json");
  const raw = await fs.readFile(localPath, "utf8");
  // Validate it's valid JSON before uploading
  JSON.parse(raw);

  // Optional: warn if R2 already has content (don't overwrite without confirmation)
  let exists = false;
  try {
    await r2.send(new GetObjectCommand({ Bucket: bucket, Key: STORE_KEY }));
    exists = true;
  } catch (err) {
    if (err.$metadata?.httpStatusCode !== 404 && err.name !== "NoSuchKey") {
      throw err;
    }
  }

  if (exists && !process.argv.includes("--force")) {
    console.log(
      `R2 already has ${STORE_KEY}. Re-run with --force to overwrite.`
    );
    process.exit(0);
  }

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: STORE_KEY,
      Body: raw,
      ContentType: "application/json; charset=utf-8",
      CacheControl: "no-store",
    })
  );

  const sizeKb = (Buffer.byteLength(raw, "utf8") / 1024).toFixed(2);
  console.log(`Uploaded ${localPath} -> r2://${bucket}/${STORE_KEY} (${sizeKb} KB)`);
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
