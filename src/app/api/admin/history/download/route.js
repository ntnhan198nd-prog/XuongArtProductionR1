import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import { readHistorySnapshotRaw } from "@/lib/contentStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

// "xuongart-2026-10-25_14-32-10.json" (Vietnam time, UTC+7 without DST).
function downloadName(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "xuongart-backup.json";
  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString();
  return `xuongart-${local.slice(0, 10)}_${local.slice(11, 19).replace(/:/g, "-")}.json`;
}

// The snapshot exactly as stored on R2, as a file download (a plain
// <a href> in the admin, so the admin cookie authenticates it).
export async function GET(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  const key = new URL(request.url).searchParams.get("key") || "";

  try {
    const { entry, raw } = await readHistorySnapshotRaw(key);
    return new NextResponse(raw, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${downloadName(entry.createdAt)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "GET /api/admin/history/download",
      prefix: "Không tải về được bản lưu —",
    });
  }
}
