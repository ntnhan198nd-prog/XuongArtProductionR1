import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { describeServerError, serverErrorResponse } from "@/lib/apiErrors";
import {
  getPublicFileUrl,
  getR2Client,
  isAllowedContentType,
  isAllowedFolder,
  validateR2Config,
} from "@/lib/r2";

// Shown to the admin (Vietnamese UI). Keep in sync with the format list in
// src/lib/uploadClient.js / ALLOWED_CONTENT_TYPES in src/lib/r2.js.
const ALLOWED_FORMATS_HINT =
  "Chỉ nhận ảnh PNG, JPG, WebP, GIF, AVIF, video MP4, WebM, MOV, MKV và PDF.";

function sanitizeFileName(name) {
  return String(name || "file")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

export async function POST(request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const validation = validateR2Config();
  if (!validation.valid) {
    // describeServerError keys its Vercel-env hint off this English phrase.
    const { hint } = describeServerError(
      new Error(`R2 is not configured. Missing: ${validation.missing.join(", ")}`)
    );
    return NextResponse.json(
      {
        error: `Server chưa cấu hình kho lưu trữ R2 (thiếu: ${validation.missing.join(", ")}).`,
        hint,
        code: "r2-not-configured",
      },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Dữ liệu gửi lên không hợp lệ.", code: "invalid-json" },
      { status: 400 }
    );
  }

  try {
    const filename = sanitizeFileName(body?.filename);
    const contentType = String(body?.contentType || "").trim();
    const folder = String(body?.folder || "uploads").toLowerCase();

    if (!filename) {
      return NextResponse.json(
        { error: "Thiếu tên file.", code: "filename-required" },
        { status: 400 }
      );
    }

    // Reject anything outside the allowlist so the bucket can never serve
    // arbitrary HTML / SVG with embedded scripts / executables under our
    // public R2 domain — even if an admin session is compromised.
    // `code` lets the client map this to its "type" UploadError.
    if (!isAllowedContentType(contentType)) {
      return NextResponse.json(
        {
          error: `Định dạng file "${contentType || "không rõ"}" không được phép tải lên.`,
          hint: ALLOWED_FORMATS_HINT,
          code: "type-not-allowed",
        },
        { status: 400 }
      );
    }
    if (!isAllowedFolder(folder)) {
      return NextResponse.json(
        {
          error: `Thư mục "${folder}" không được phép tải lên.`,
          hint: "Đây là lỗi của trang admin, không phải do file — báo người hỗ trợ kỹ thuật.",
          code: "folder-not-allowed",
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const datePrefix = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = `${folder}/${datePrefix}/${unique}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: validation.config.bucket,
      Key: key,
      ContentType: contentType,
    });

    // 30-minute TTL: large videos (showreel reels can be 200-500MB) over
    // a slow VN connection routinely take longer than the previous 5-min
    // window, causing silent 403s mid-upload.
    const uploadUrl = await getSignedUrl(getR2Client(), command, {
      expiresIn: 60 * 30,
    });

    return NextResponse.json({
      data: {
        key,
        uploadUrl,
        publicUrl: getPublicFileUrl(key),
      },
    });
  } catch (error) {
    // Always-JSON 500 with the R2 cause + an actionable hint (bad keys etc.).
    return serverErrorResponse(error, {
      context: "POST /api/admin/r2/upload-url",
      prefix: "Không tạo được link tải lên —",
    });
  }
}
