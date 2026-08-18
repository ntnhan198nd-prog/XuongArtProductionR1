import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import {
  collectAssetKeysFromSite,
  readStore,
  updateStore,
} from "@/lib/contentStore";
import { deleteR2Keys } from "@/lib/r2";
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

function keysToDelete(oldKeys, nextKeys) {
  const stillUsed = new Set(nextKeys);
  return oldKeys.filter((key) => !stillUsed.has(key));
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
    // Diff brand logos / services image so swapped images don't accumulate
    // dead files in R2 over time.
    let oldKeys = [];
    await updateStore((store) => {
      oldKeys = collectAssetKeysFromSite(store.site);
      store.site = next;
      return store;
    });

    const orphans = keysToDelete(oldKeys, collectAssetKeysFromSite(next));
    if (orphans.length > 0) {
      await deleteR2Keys(orphans);
    }

    return NextResponse.json({ data: next }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "PUT /api/admin/site-content",
      prefix: "Không lưu được nội dung lên R2 —",
    });
  }
}

export async function DELETE(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  try {
    let oldKeys = [];
    await updateStore((store) => {
      oldKeys = collectAssetKeysFromSite(store.site);
      store.site = null;
      return store;
    });

    if (oldKeys.length > 0) {
      await deleteR2Keys(oldKeys);
    }

    return NextResponse.json(
      { data: DEFAULT_SITE_CONTENT },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return serverErrorResponse(error, {
      context: "DELETE /api/admin/site-content",
      prefix: "Không reset được nội dung trên R2 —",
    });
  }
}
