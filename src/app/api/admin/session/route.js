import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS } from "@/lib/apiErrors";

// IMPORTANT: this must be dynamic. In Next 14.0.x a GET-only route handler
// that only touches `request.cookies` is NOT automatically opted out of
// static generation (only `request.headers` / `request.url` / body readers
// are), so without these exports the route was prerendered at build time as
// {"authenticated":false} and served from the CDN forever — every page
// reload of /admin bounced the user back to the login form.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  return NextResponse.json(
    { authenticated: isAdminAuthenticated(request) },
    { headers: NO_STORE_HEADERS }
  );
}
