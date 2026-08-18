import { NextResponse } from "next/server";
import { GetObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, describeServerError } from "@/lib/apiErrors";
import { STORE_KEY, isMissingObjectError } from "@/lib/contentStore";
import { getR2Client, getR2Config, validateR2Config } from "@/lib/r2";

// Admin-only diagnostics: answers "why is the admin/site not loading data?"
// without needing server logs. Open /api/admin/health in the browser while
// logged in to /admin. Reports which env vars are present (never their
// values) and whether the R2 bucket + content store are actually reachable
// with the credentials the server is running with.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ENV_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ENDPOINT",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_URL",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
];

function envPresence() {
  const result = {};
  for (const key of ENV_KEYS) {
    result[key] = Boolean(process.env[key] && String(process.env[key]).trim());
  }
  return result;
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url ? "(invalid URL)" : "";
  }
}

export async function GET(request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const validation = validateR2Config();
  const config = getR2Config();

  const report = {
    ok: false,
    checkedAt: new Date().toISOString(),
    env: envPresence(),
    missingEnv: validation.missing,
    r2: {
      endpointHost: safeHost(config.endpoint),
      bucket: config.bucket || null,
      publicBaseUrl: config.publicBaseUrl || null,
      storeKey: STORE_KEY,
    },
    checks: {},
    problems: [],
  };

  if (!validation.valid) {
    report.problems.push(
      `Server thiếu biến môi trường R2: ${validation.missing.join(", ")}. Trên Vercel: Settings → Environment Variables → thêm cho Production → Redeploy.`
    );
    return NextResponse.json(report, { headers: NO_STORE_HEADERS });
  }

  const client = getR2Client();

  // 1) Can we reach the bucket with these credentials at all?
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    report.checks.bucket = { ok: true };
  } catch (error) {
    const described = describeServerError(error);
    // HeadBucket has no response body, so a nonexistent bucket surfaces as a
    // bare 404 ("NotFound") rather than "NoSuchBucket" — spell it out.
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === "NotFound") {
      described.message = `Bucket "${config.bucket}" không tồn tại trên account này (HTTP 404)`;
      described.hint =
        "Kiểm tra R2_BUCKET đúng tên bucket, và R2_ACCOUNT_ID / R2_ENDPOINT đúng account Cloudflare chứa bucket đó.";
      described.code = "NoSuchBucket";
    }
    report.checks.bucket = { ok: false, ...described };
    report.problems.push(`Không truy cập được bucket "${config.bucket}": ${described.message}`);
    if (described.hint) report.problems.push(described.hint);
    return NextResponse.json(report, { headers: NO_STORE_HEADERS });
  }

  // 2) Can we read the content store object?
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: STORE_KEY })
    );
    const raw = await result.Body.transformToString("utf-8");
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    report.checks.store = {
      // Reachable but unparseable is NOT ok — the app will wipe it on the
      // next read (see contentStore.readStoreInternal).
      ok: parsed !== null,
      exists: true,
      bytes: raw.length,
      validJson: parsed !== null,
      projects: Array.isArray(parsed?.projects) ? parsed.projects.length : null,
      imageProjects: Array.isArray(parsed?.imageProjects) ? parsed.imageProjects.length : null,
      hasShowreel: Boolean(parsed?.showreel),
      hasSiteContent: Boolean(parsed?.site),
    };
    if (parsed === null) {
      report.problems.push(
        `File ${STORE_KEY} tồn tại nhưng không phải JSON hợp lệ — lần đọc tiếp theo sẽ reset về store trống.`
      );
    }
  } catch (error) {
    if (isMissingObjectError(error)) {
      report.checks.store = {
        ok: true,
        exists: false,
        note: `Chưa có ${STORE_KEY} trong bucket — store đang trống (bình thường với bucket mới; file sẽ được tạo ở lần lưu đầu tiên).`,
      };
    } else {
      const described = describeServerError(error);
      report.checks.store = { ok: false, exists: null, ...described };
      report.problems.push(`Không đọc được ${STORE_KEY}: ${described.message}`);
      if (described.hint) report.problems.push(described.hint);
    }
  }

  report.ok = Boolean(report.checks.bucket?.ok && report.checks.store?.ok);
  return NextResponse.json(report, { headers: NO_STORE_HEADERS });
}
