import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  getPublicFileUrl,
  getR2Client,
  getR2Config,
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

function parseNumber(input) {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Server-relayed upload kept as a fallback for small assets where presigned
// URLs are not desirable (e.g. when a future feature wants the server to
// validate or transform the file). The primary admin upload path is the
// presigned-URL flow in /api/admin/r2/upload-url, which is faster, cheaper,
// and free of body-size / timeout limits.
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
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    const filename = sanitizeFileName(file.name);
    const folder = String(formData.get("folder") || "uploads").toLowerCase();
    const contentType = file.type || "application/octet-stream";

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

    // This relay path buffers the whole file into memory (below), so cap it.
    // Large media must use the presigned-URL flow (/api/admin/r2/upload-url),
    // which streams the client straight to R2 and has no server-side buffering.
    const MAX_RELAY_BYTES = 25 * 1024 * 1024; // 25 MB
    if (file.size && file.size > MAX_RELAY_BYTES) {
      return NextResponse.json(
        { error: "File too large for server upload; use the presigned upload flow." },
        { status: 413 }
      );
    }

    const now = new Date();
    const datePrefix = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = `${folder}/${datePrefix}/${unique}-${filename}`;

    const body = Buffer.from(await file.arrayBuffer());
    const { bucket } = getR2Config();
    const r2Client = getR2Client();

    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );

    return NextResponse.json({
      data: {
        key,
        url: getPublicFileUrl(key),
        previewUrl: null,
        name: filename,
        mime: contentType,
        size: file.size || body.length,
        previewSize: null,
        width: parseNumber(formData.get("width")),
        height: parseNumber(formData.get("height")),
        duration: parseNumber(formData.get("duration")),
      },
    });
  } catch (error) {
    console.error("Server upload failed:", error);
    return NextResponse.json({ error: "Server upload failed." }, { status: 500 });
  }
}
