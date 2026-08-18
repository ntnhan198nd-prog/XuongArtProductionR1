// Checks whether the R2 bucket has a CORS policy that allows the browser to
// PUT directly to presigned URLs. After switching Cloudflare accounts a fresh
// bucket has NO CORS config, which silently breaks ALL admin image/video
// uploads (the browser PUT to *.r2.cloudflarestorage.com is blocked by CORS),
// even though server-side presigning and public reads work fine.
//
// Run: `node scripts/check-r2-cors.mjs`  (or `npm run check-r2-cors`)

import fs from "node:fs/promises";
import path from "node:path";
import { S3Client, GetBucketCorsCommand } from "@aws-sdk/client-s3";

const c = { reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", dim: "\x1b[2m" };
const ok = (m) => console.log(`${c.green}✓ ${m}${c.reset}`);
const bad = (m) => console.log(`${c.red}✗ ${m}${c.reset}`);
const warn = (m) => console.log(`${c.yellow}! ${m}${c.reset}`);
const info = (m) => console.log(`${c.cyan}i ${m}${c.reset}`);

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

function evaluate(rules) {
  // The browser needs a rule whose AllowedMethods includes PUT and whose
  // AllowedOrigins covers our site / localhost (or "*").
  const putRule = rules.find((r) => (r.AllowedMethods || []).map((m) => m.toUpperCase()).includes("PUT"));
  if (!putRule) {
    bad("Có CORS nhưng KHÔNG rule nào cho method PUT → upload từ trình duyệt vẫn bị chặn.");
    return;
  }
  const origins = putRule.AllowedOrigins || [];
  ok(`Có rule cho PUT. AllowedOrigins: ${JSON.stringify(origins)}`);
  const covers = (o) => origins.includes("*") || origins.some((x) => o.startsWith(x.replace(/\/$/, "")));
  for (const o of ["https://xuongart.com", "https://www.xuongart.com", "http://localhost:3000", "http://localhost:3001"]) {
    if (covers(o)) ok(`  origin ${o} được phép`);
    else warn(`  origin ${o} CHƯA nằm trong AllowedOrigins → upload từ origin này sẽ lỗi CORS`);
  }
  const headers = putRule.AllowedHeaders || [];
  if (headers.includes("*") || headers.map((h) => h.toLowerCase()).includes("content-type")) {
    ok("  AllowedHeaders cho phép Content-Type");
  } else {
    warn(`  AllowedHeaders=${JSON.stringify(headers)} — nên thêm "*" hoặc "content-type" (PUT có gửi header này)`);
  }
}

async function main() {
  console.log("\n=== XuongArt — R2 CORS Check (cho upload trình duyệt) ===\n");
  const env = await parseEnvFile(path.resolve(".env.local"));
  const get = (k) => env[k] || process.env[k] || "";
  const accountId = get("R2_ACCOUNT_ID");
  const bucket = get("R2_BUCKET");
  const endpoint = get("R2_ENDPOINT") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const accessKeyId = get("R2_ACCESS_KEY_ID");
  const secretAccessKey = get("R2_SECRET_ACCESS_KEY");

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    bad("Thiếu cấu hình R2 trong .env.local."); process.exit(1);
  }
  info(`bucket: ${bucket}`);

  const r2 = new S3Client({ region: "auto", endpoint, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });

  let apiReadOk = false;
  try {
    const res = await r2.send(new GetBucketCorsCommand({ Bucket: bucket }));
    const rules = res.CORSRules || [];
    apiReadOk = true;
    if (!rules.length) {
      bad("Bucket KHÔNG có CORS rule nào → upload ảnh/video từ trình duyệt sẽ bị chặn.");
    } else {
      ok(`Tìm thấy ${rules.length} CORS rule.`);
      console.log(`${c.dim}${JSON.stringify(rules, null, 2)}${c.reset}`);
      evaluate(rules);
    }
  } catch (error) {
    const name = error?.name || error?.Code || "";
    if (name === "NoSuchCORSConfiguration" || /cors configuration does not exist/i.test(error?.message || "")) {
      apiReadOk = true;
      bad("Bucket CHƯA có CORS policy (NoSuchCORSConfiguration).");
      bad("→ ĐÂY là nguyên nhân upload ảnh/video sẽ thất bại từ trình duyệt.");
    } else if (name === "AccessDenied" || error?.$metadata?.httpStatusCode === 403) {
      warn("Token R2 không đủ quyền đọc cấu hình CORS qua API (token Object R/W, không phải Admin).");
    } else {
      warn(`Không đọc được CORS qua API (${name || error?.message}).`);
    }
  }

  // Empirical fallback: send the exact CORS preflight (OPTIONS) the browser
  // sends before a PUT. R2 reflects the bucket CORS policy in the response
  // headers — this needs no special token permission and is browser-truth.
  console.log("");
  info("Phép thử thực nghiệm — preflight OPTIONS (giống hệt trình duyệt gửi trước khi PUT):");
  const probeUrl = `${endpoint.replace(/\/$/, "")}/${bucket}/uploads/_cors-probe.txt`;
  for (const origin of ["http://localhost:3000", "https://xuongart.com"]) {
    try {
      const res = await fetch(probeUrl, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      const allowOrigin = res.headers.get("access-control-allow-origin");
      const allowMethods = res.headers.get("access-control-allow-methods");
      if (allowOrigin) {
        ok(`[${origin}] CORS OK — Allow-Origin: ${allowOrigin}${allowMethods ? `, Allow-Methods: ${allowMethods}` : ""}`);
      } else {
        bad(`[${origin}] KHÔNG có Access-Control-Allow-Origin (HTTP ${res.status}) → trình duyệt sẽ CHẶN upload từ origin này.`);
      }
    } catch (e) {
      warn(`[${origin}] Không gửi được preflight: ${e?.message || e}`);
    }
  }

  console.log("");
  if (!apiReadOk) info("Không đọc được CORS qua API, nhưng phép thử preflight ở trên phản ánh đúng thực tế trình duyệt.");
  info("Nếu thiếu CORS: cần policy cho phép PUT + GET/HEAD từ origin của web (script apply sẽ in ra sau khi xác nhận).");
}

main().catch((e) => { bad(`Lỗi: ${e?.message || e}`); process.exit(1); });
