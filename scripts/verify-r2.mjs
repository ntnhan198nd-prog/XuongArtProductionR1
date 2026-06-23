// Real R2 connectivity check — proves the credentials in .env.local actually
// work against Cloudflare R2, not just that the variables are present.
//
// It mirrors exactly what the running app does:
//   1. PutObject  -> writes the content store / uploads (contentStore.js)
//   2. GetObject  -> reads the content store on every /admin load
//   3. public GET -> how images/videos load on the live site
//   4. DeleteObject -> cleanup (and proves delete perms used on save)
//
// Run locally: `node scripts/verify-r2.mjs`  (or `npm run verify-r2`)
// Reads .env.local for R2 credentials.

import fs from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const c = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};
const ok = (m) => console.log(`${c.green}✓ ${m}${c.reset}`);
const bad = (m) => console.log(`${c.red}✗ ${m}${c.reset}`);
const warn = (m) => console.log(`${c.yellow}! ${m}${c.reset}`);
const info = (m) => console.log(`${c.cyan}i ${m}${c.reset}`);
const dim = (m) => console.log(`${c.dim}${m}${c.reset}`);

async function parseEnvFile(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return {};
  }
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function explain(error) {
  const name = error?.name || error?.Code || "";
  const status = error?.$metadata?.httpStatusCode;
  if (name === "InvalidAccessKeyId")
    return "Access Key ID sai hoặc thuộc account khác. Tạo lại R2 API Token trên account MỚI.";
  if (name === "SignatureDoesNotMatch")
    return "Secret Access Key sai. Copy lại Secret (chỉ hiện 1 lần khi tạo token).";
  if (name === "NoSuchBucket")
    return "Bucket không tồn tại trên account này. Kiểm tra R2_BUCKET có đúng tên bucket vừa tạo không.";
  if (name === "AccessDenied" || status === 403)
    return "Token không đủ quyền. R2 API Token cần quyền 'Object Read & Write' cho bucket này.";
  if (name === "NetworkingError" || name === "TimeoutError")
    return "Không kết nối được tới endpoint. Kiểm tra R2_ACCOUNT_ID / R2_ENDPOINT.";
  return `${name || "Unknown error"}${status ? ` (HTTP ${status})` : ""}`;
}

async function main() {
  console.log("\n=== XuongArt — R2 Connectivity Check ===\n");

  const env = await parseEnvFile(path.resolve(".env.local"));
  const get = (k) => env[k] || process.env[k] || "";

  const accountId = get("R2_ACCOUNT_ID");
  const bucket = get("R2_BUCKET");
  const accessKeyId = get("R2_ACCESS_KEY_ID");
  const secretAccessKey = get("R2_SECRET_ACCESS_KEY");
  const publicUrl = get("R2_PUBLIC_URL").replace(/\/$/, "");
  const endpoint =
    get("R2_ENDPOINT") ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  // ---- Step 1: presence ----------------------------------------------------
  const missing = [];
  if (!endpoint) missing.push("R2_ACCOUNT_ID (hoặc R2_ENDPOINT)");
  if (!bucket) missing.push("R2_BUCKET");
  if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!publicUrl) missing.push("R2_PUBLIC_URL");

  if (missing.length) {
    missing.forEach((m) => bad(`Thiếu ${m}`));
    bad("\nChưa đủ biến môi trường — điền vào .env.local rồi chạy lại.");
    process.exit(1);
  }
  ok("Đủ 5 biến R2 bắt buộc");
  dim(`  endpoint:  ${endpoint}`);
  dim(`  bucket:    ${bucket}`);
  dim(`  publicUrl: ${publicUrl}`);

  const r2 = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  // Temp object lives under uploads/ (an allowed public folder in the app).
  const stamp = `${process.pid}-${Math.floor(process.hrtime()[1])}`;
  const key = `uploads/_r2-healthcheck-${stamp}.txt`;
  const body = `r2-healthcheck ${new Date().toISOString()}`;
  let wrote = false;

  // ---- Step 2: authenticated write (PutObject) -----------------------------
  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "text/plain; charset=utf-8",
        CacheControl: "no-store",
      })
    );
    wrote = true;
    ok("Ghi được vào bucket (PutObject) — credentials hợp lệ");
  } catch (error) {
    bad(`Ghi thất bại (PutObject): ${explain(error)}`);
    process.exit(1);
  }

  // ---- Step 3: authenticated read (GetObject) — what /admin does ----------
  try {
    const res = await r2.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    const got = await res.Body.transformToString("utf-8");
    if (got === body) ok("Đọc lại được (GetObject) — /admin sẽ load được");
    else warn("Đọc được nhưng nội dung không khớp (lạ, nhưng auth ổn)");
  } catch (error) {
    bad(`Đọc thất bại (GetObject): ${explain(error)}`);
  }

  // ---- Step 4: public URL — how images load on the live site --------------
  const publicTarget = `${publicUrl}/${key}`;
  try {
    const res = await fetch(publicTarget, { cache: "no-store" });
    if (res.ok) {
      ok("Public URL truy cập được — ảnh/video sẽ hiển thị trên web");
    } else if (res.status === 401 || res.status === 403) {
      warn(
        "Public URL bị chặn (403/401): bucket CHƯA bật Public Access. " +
          "Vào R2 → bucket → Settings → bật r2.dev subdomain. " +
          "Ảnh upload sẽ không hiển thị cho tới khi bật."
      );
    } else {
      warn(`Public URL trả về HTTP ${res.status} — kiểm tra lại R2_PUBLIC_URL.`);
    }
  } catch (error) {
    warn(
      `Không fetch được public URL (${error?.message || error}). ` +
        "Kiểm tra R2_PUBLIC_URL có đúng domain r2.dev / custom domain không."
    );
  }

  // ---- Step 5: cleanup -----------------------------------------------------
  if (wrote) {
    try {
      await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      ok("Xóa file test (DeleteObject) — dọn dẹp xong");
    } catch (error) {
      warn(`Không xóa được file test (${explain(error)}). Bỏ qua: ${key}`);
    }
  }

  console.log(
    `\n${c.green}Hoàn tất.${c.reset} Nếu các bước trên đều ✓ (public URL có thể chỉ là cảnh báo), ` +
      "account Cloudflare mới đã kết nối đúng. Dùng đúng các giá trị này cho Vercel."
  );
}

main().catch((error) => {
  bad(`Lỗi không mong đợi: ${error?.message || error}`);
  process.exit(1);
});
