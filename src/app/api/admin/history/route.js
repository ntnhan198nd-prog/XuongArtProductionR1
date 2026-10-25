import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, describeServerError, serverErrorResponse } from "@/lib/apiErrors";
import { getHistoryActionLabel, summarizeStore } from "@/lib/contentHistory";
import { STORE_CORRUPT_CODE, listHistory, readStore } from "@/lib/contentStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

// List of content snapshots (newest first) + a summary of the live store.
export async function GET(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  try {
    const entries = await listHistory();

    // A corrupt live store is exactly when this tab matters most, so it
    // must not hide the list: report it next to the entries instead.
    let current = null;
    let currentError = null;
    try {
      current = summarizeStore(await readStore());
    } catch (error) {
      if (error?.code !== STORE_CORRUPT_CODE) throw error;
      // Where the bad bytes were kept (content.corrupt-*.json), and whether
      // that copy succeeded — the admin UI words its warnings on this.
      currentError = {
        ...describeServerError(error),
        corruptCopyKey: typeof error.corruptCopyKey === "string" ? error.corruptCopyKey : null,
        corruptPreserved: Boolean(error.corruptPreserved),
      };
    }

    return NextResponse.json(
      {
        data: entries.map((entry) => ({
          key: entry.key,
          createdAt: entry.createdAt,
          action: entry.action,
          label: getHistoryActionLabel(entry.action),
          detail: entry.detail,
          size: entry.size,
        })),
        current,
        currentError,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return serverErrorResponse(error, {
      context: "GET /api/admin/history",
      prefix: "Không tải được lịch sử từ R2 —",
    });
  }
}
