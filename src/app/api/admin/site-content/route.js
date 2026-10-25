import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import {
  collectAssetRefsFromSite,
  readStore,
  trashUnreferencedAssets,
  updateStore,
} from "@/lib/contentStore";
import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from "@/lib/siteContent";

// Never prerender / cache: every response depends on the admin cookie and on
// the live content store.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

export async function GET(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  try {
    const store = await readStore();
    return NextResponse.json(
      {
        data: normalizeSiteContent(store.site),
        defaults: DEFAULT_SITE_CONTENT,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    // Without this catch the exception escaped the handler and the client
    // received a 500 with an empty body → "Unexpected end of JSON input".
    return serverErrorResponse(error, {
      context: "GET /api/admin/site-content",
      prefix: "Không đọc được kho nội dung trên R2 —",
    });
  }
}

export async function PUT(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const next = normalizeSiteContent(body);

  try {
    // Brand logos / services image / founder photo this save stopped using
    // go to "Thùng rác" (kept 30 days so "Lịch sử" can bring the old
    // content back with its images, then deleted) instead of piling up as
    // dead files in R2. Files still used elsewhere are left alone.
    let trashedFiles = 0;
    await updateStore((store) => {
      const previous = store.site;
      store.site = next;
      trashedFiles = trashUnreferencedAssets(store, collectAssetRefsFromSite(previous)).length;
      return store;
    }, { action: "site.update" });

    return NextResponse.json({ data: next, trashedFiles }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "PUT /api/admin/site-content",
      prefix: "Không lưu được nội dung lên R2 —",
    });
  }
}
