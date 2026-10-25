import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import { TRASH_KEEP_DAYS, listTrashEntries, purgeExpiredTrashNow } from "@/lib/contentStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

// "Thùng rác" tab: deleted videos / image projects and replaced files,
// newest first, each with the days left before it is deleted for good.
// Entries already past their 30 days are purged first (their R2 files are
// deleted after that store write), so the list never shows them.
export async function GET(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  try {
    const now = Date.now();
    const { store, purged } = await purgeExpiredTrashNow({ now });
    return NextResponse.json(
      { data: listTrashEntries(store, now), keepDays: TRASH_KEEP_DAYS, purged },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return serverErrorResponse(error, {
      context: "GET /api/admin/trash",
      prefix: "Không đọc được Thùng rác từ R2 —",
    });
  }
}
