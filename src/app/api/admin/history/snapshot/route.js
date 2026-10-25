import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import { summarizeStore } from "@/lib/contentHistory";
import { collectAssetKeysFromStore, readHistorySnapshot } from "@/lib/contentStore";
import { findMissingR2Keys } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_MEDIA_CHECKS = 150;

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

// Details of one snapshot: what it contains, and how many of the media
// files it points to have since been deleted from R2 (restoring cannot
// bring those back). Read-only.
export async function GET(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  const key = new URL(request.url).searchParams.get("key") || "";

  try {
    const snapshot = await readHistorySnapshot(key);
    const media = await findMissingR2Keys(collectAssetKeysFromStore(snapshot), {
      limit: MAX_MEDIA_CHECKS,
    });
    return NextResponse.json(
      {
        data: summarizeStore(snapshot),
        missingMedia: media.missing.length,
        checked: media.checked,
        totalMedia: media.total,
        failedChecks: media.failed,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return serverErrorResponse(error, {
      context: "GET /api/admin/history/snapshot",
      prefix: "Không xem được bản lưu —",
    });
  }
}
