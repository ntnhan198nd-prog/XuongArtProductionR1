import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import { parseHistoryKey, summarizeStore } from "@/lib/contentHistory";
import { restoreHistorySnapshot } from "@/lib/contentStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

// Put the whole content back to one snapshot. The current content is
// snapshotted first (so this can be undone from the same tab) and no R2
// media is deleted.
export async function POST(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const key = typeof body?.key === "string" ? body.key : "";
  if (!parseHistoryKey(key)) {
    return NextResponse.json(
      { error: "Bản lưu không hợp lệ.", code: "BAD_KEY" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const saved = await restoreHistorySnapshot(key);
    return NextResponse.json(
      { ok: true, data: summarizeStore(saved) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return serverErrorResponse(error, {
      context: "POST /api/admin/history/restore",
      prefix: "Không khôi phục được —",
    });
  }
}
