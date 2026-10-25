import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import { runHealthChecks } from "@/lib/healthChecks";

// Admin-only diagnostics: answers "why is the admin/site not loading data?"
// without needing server logs. Shown as traffic-light rows in the admin
// "Hệ thống" tab; can still be opened directly at /api/admin/health while
// logged in. Reports which env vars are present (never their values),
// whether the R2 bucket + content store are reachable with the server's
// credentials, whether one media file opens through its public URL, and
// whether _admin/content.json is publicly readable (informational).
// The checks themselves live in lib/healthChecks.js.
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Two public probes of up to 8 s each on top of the R2 calls.
export const maxDuration = 60;

export async function GET(request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const report = await runHealthChecks();
    return NextResponse.json(report, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "GET /api/admin/health",
      prefix: "Không kiểm tra được hệ thống —",
    });
  }
}
