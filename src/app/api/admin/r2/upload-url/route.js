import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getPublicFileUrl, getR2Client, validateR2Config } from "@/lib/r2";

function sanitizeFileName(name) {
  return String(name || "file")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function normalizeFolder(input) {
  const folder = String(input || "projects")
    .toLowerCase()
    .replace(/[^a-z0-9/_-]/g, "")
    .replace(/^\/+|\/+$/g, "");
  return folder || "projects";
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
    const contentType = String(body?.contentType || "application/octet-stream");
    const folder = normalizeFolder(body?.folder);

    if (!filename) {
      return NextResponse.json({ error: "filename is required." }, { status: 400 });
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

    const uploadUrl = await getSignedUrl(getR2Client(), command, {
      expiresIn: 60 * 5,
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
