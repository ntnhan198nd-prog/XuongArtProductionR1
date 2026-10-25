import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import { readStore } from "@/lib/contentStore";
import { buildOverview } from "@/lib/healthChecks";

// Data for the admin "Tổng quan" tab: counts, featured-grid usage,
// showreel, last save, records that need attention and recent edits — all
// from one read of the content store. Read-only.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const store = await readStore();
    return NextResponse.json(buildOverview(store), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "GET /api/admin/overview",
      prefix: "Không tải được tổng quan —",
    });
  }
}
