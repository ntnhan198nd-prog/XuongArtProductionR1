import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getPublicFileUrl, getR2Client, getR2Config, validateR2Config } from "@/lib/r2";

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

function parseNumber(input) {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function runFfmpeg(args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timeout = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      reject(new Error("ffmpeg timeout"));
    }, timeoutMs);

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

async function createVideoPreviewBuffer(originalBuffer) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "xuongart-r2-preview-"));
  const inputPath = path.join(tempDir, "input.mp4");
  const outputPath = path.join(tempDir, "preview.mp4");

  try {
    await writeFile(inputPath, originalBuffer);
    await runFfmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-vf",
      "scale=1280:-2:force_original_aspect_ratio=decrease",
      "-r",
      "24",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "29",
      "-maxrate",
      "1800k",
      "-bufsize",
      "3600k",
      "-movflags",
      "+faststart",
      "-pix_fmt",
      "yuv420p",
      "-an",
      outputPath,
    ]);

    const outputStats = await stat(outputPath);
    const previewBuffer = await readFile(outputPath);

    if (!previewBuffer.length || outputStats.size <= 0) {
      return null;
    }

    return {
      body: previewBuffer,
      size: outputStats.size,
      mime: "video/mp4",
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    const filename = sanitizeFileName(file.name);
    const folder = normalizeFolder(formData.get("folder"));
    const contentType = file.type || "application/octet-stream";

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

    let previewUrl = null;
    let previewSize = null;

    if (contentType.startsWith("video/")) {
      try {
        const preview = await createVideoPreviewBuffer(body);
        if (preview) {
          const previewName = filename.replace(/\.[a-z0-9]+$/i, "") || "preview";
          const previewKey = `${folder}/${datePrefix}/${unique}-${previewName}-preview.mp4`;

          await r2Client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: previewKey,
              Body: preview.body,
              ContentType: preview.mime,
            })
          );

          previewUrl = getPublicFileUrl(previewKey);
          previewSize = preview.size;
        }
      } catch (previewError) {
        console.warn("Video preview generation failed. Falling back to original media.", previewError);
      }
    }

    return NextResponse.json({
      data: {
        key,
        url: getPublicFileUrl(key),
        previewUrl,
        name: filename,
        mime: contentType,
        size: file.size || body.length,
        previewSize,
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
