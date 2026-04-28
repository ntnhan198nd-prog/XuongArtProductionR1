import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  getPublicFileUrl,
  getR2Client,
  isAllowedContentType,
  isAllowedFolder,
  validateR2Config,
} from "@/lib/r2";

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
    return NextResponse.json(
      {
        error: `R2 is not configured. Missing: ${validation.missing.join(", ")}`,
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const filename = sanitizeFileName(body?.filename);
    const contentType = String(body?.contentType || "").trim();
    const folder = String(body?.folder || "uploads").toLowerCase();

    if (!filename) {
      return NextResponse.json({ error: "filename is required." }, { status: 400 });
    }

    // Reject anything outside the allowlist so the bucket can never serve
    // arbitrary HTML / SVG with embedded scripts / executables under our
    // public R2 domain — even if an admin session is compromised.
    if (!isAllowedContentType(contentType)) {
      return NextResponse.json(
        { error: `contentType "${contentType}" is not allowed.` },
        { status: 400 }
      );
    }
    if (!isAllowedFolder(folder)) {
      return NextResponse.json(
        { error: `folder "${folder}" is not allowed.` },
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
    console.error("Failed to create upload url:", error);
    return NextResponse.json(
      { error: "Failed to create upload url." },
      { status: 500 }
    );
  }
}
