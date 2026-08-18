// End-to-end test of the ACTUAL admin upload mechanism (presigned PUT), the
// exact path /api/admin/r2/upload-url + browser XHR use. Proves that, with the
// current .env.local credentials, the new R2 account can: sign a PutObject URL,
// accept a direct PUT with a matching Content-Type, and serve the object back
// via the public URL — for both an image and a video content-type.
//
// Run: `node scripts/verify-upload.mjs`  (or `npm run verify-upload`)

import fs from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const c = { reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", dim: "\x1b[2m" };
const ok = (m) => console.log(`${c.green}✓ ${m}${c.reset}`);
const bad = (m) => console.log(`${c.red}✗ ${m}${c.reset}`);
const info = (m) => console.log(`${c.cyan}i ${m}${c.reset}`);
const dim = (m) => console.log(`${c.dim}${m}${c.reset}`);

async function parseEnvFile(filePath) {
  let content;
  try { content = await fs.readFile(filePath, "utf8"); } catch { return {}; }
  const env = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

async function testOne(r2, bucket, publicBase, { label, key, contentType, bytes }) {
  console.log("");
  info(`Test ${label}  (contentType: ${contentType})`);
  // 1) sign a PutObject URL exactly like /api/admin/r2/upload-url does.
  const uploadUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: 600 }
  );
  ok("  Ký được presigned PUT URL");

  // 2) PUT the bytes directly to the presigned URL, with the SAME Content-Type
  //    the browser sets. A mismatch here would make R2 return 403.
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: bytes });
  if (put.ok) ok(`  PUT trực tiếp lên R2 thành công (HTTP ${put.status})`);
  else { bad(`  PUT thất bại (HTTP ${put.status}) — ${(await put.text()).slice(0, 200)}`); return false; }

  // 3) read it back via the public URL (how the site displays media).
  const publicUrl = `${publicBase}/${key}`;
  const get = await fetch(publicUrl, { cache: "no-store" });
  if (get.ok) ok(`  Public URL đọc được (HTTP ${get.status})`);
  else bad(`  Public URL lỗi (HTTP ${get.status}) — kiểm tra R2_PUBLIC_URL / public access`);

  // 4) cleanup
  await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
  return put.ok && get.ok;
}

async function main() {
  console.log("\n=== XuongArt — Upload Pipeline E2E (presigned PUT) ===\n");
  const env = await parseEnvFile(path.resolve(".env.local"));
  const get = (k) => env[k] || process.env[k] || "";
  const accountId = get("R2_ACCOUNT_ID");
  const bucket = get("R2_BUCKET");
  const endpoint = get("R2_ENDPOINT") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const publicBase = get("R2_PUBLIC_URL").replace(/\/$/, "");
  const accessKeyId = get("R2_ACCESS_KEY_ID");
  const secretAccessKey = get("R2_SECRET_ACCESS_KEY");
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicBase) { bad("Thiếu cấu hình R2."); process.exit(1); }
  info(`bucket: ${bucket}`);

  const r2 = new S3Client({ region: "auto", endpoint, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  const stamp = `${process.pid}-${Math.floor(process.hrtime()[1])}`;

  // 1x1 PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const results = [];
  results.push(await testOne(r2, bucket, publicBase, { label: "ẢNH (image/png)", key: `uploads/_e2e-${stamp}.png`, contentType: "image/png", bytes: png }));
  results.push(await testOne(r2, bucket, publicBase, { label: "VIDEO (video/mp4)", key: `showreel/_e2e-${stamp}.mp4`, contentType: "video/mp4", bytes: Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]) }));

  console.log("");
  if (results.every(Boolean)) ok("Toàn bộ pipeline upload (ảnh + video) hoạt động với account mới. ✅");
  else { bad("Có bước upload thất bại — xem log ở trên."); process.exit(1); }
}

main().catch((e) => { bad(`Lỗi: ${e?.message || e}`); process.exit(1); });
