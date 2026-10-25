import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import { summarizeStore } from "@/lib/contentHistory";
import { startEmptyAfterCorruption } from "@/lib/contentStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

// Last-resort way out when content.json is corrupt and there is no history
// to restore: the admin explicitly starts over with empty content. Refused
// (409 NOT_CORRUPT) when the store is readable, and (503) when the corrupt
// bytes could not be kept as content.corrupt-*.json first. No media is
// deleted from R2.
export async function POST(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  try {
    const saved = await startEmptyAfterCorruption();
    return NextResponse.json(
      { ok: true, data: summarizeStore(saved) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return serverErrorResponse(error, {
      context: "POST /api/admin/history/start-empty",
      prefix: "Không bắt đầu lại được —",
    });
  }
}
