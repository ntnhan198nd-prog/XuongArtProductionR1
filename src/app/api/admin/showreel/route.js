import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import {
  collectAssetRefsFromShowreel,
  purgeExpiredTrash,
  readStore,
  trashUnreferencedAssets,
  updateStore,
} from "@/lib/contentStore";
import { deleteR2Keys } from "@/lib/r2";

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
      { data: store.showreel || null },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return serverErrorResponse(error, {
      context: "GET /api/admin/showreel",
      prefix: "Không đọc được showreel từ R2 —",
    });
  }
}

export async function POST(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    let saved = null;
    let trashedFiles = 0;
    await updateStore((store) => {
      const previous = store.showreel;
      store.showreel = {
        url,
        key: body.key || null,
        name: body.name || null,
        mime: body.mime || null,
        size: Number(body.size) || null,
        width: Number(body.width) || null,
        height: Number(body.height) || null,
        duration: Number(body.duration) || null,
        updatedAt: new Date().toISOString(),
      };
      saved = store.showreel;
      // Replace, not append: the previous video goes to "Thùng rác" (kept
      // 30 days, so "Lịch sử" can bring it back) instead of being deleted.
      // Skipped when the same file is kept or still used elsewhere.
      trashedFiles = trashUnreferencedAssets(store, collectAssetRefsFromShowreel(previous)).length;
      return store;
    }, { action: "showreel.update" });

    return NextResponse.json({ data: saved, trashedFiles });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "POST /api/admin/showreel",
      prefix: "Không lưu được showreel lên R2 —",
    });
  }
}

export async function DELETE(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  try {
    let trashedFiles = 0;
    let expiredKeys = [];
    await updateStore((store) => {
      const previous = store.showreel;
      const now = Date.now();
      store.showreel = null;
      // The video goes to "Thùng rác" for 30 days; expired trash entries
      // are purged on the way (their files deleted after the write).
      trashedFiles = trashUnreferencedAssets(store, collectAssetRefsFromShowreel(previous), {
        now,
      }).length;
      expiredKeys = purgeExpiredTrash(store, now);
      return store;
    }, { action: "showreel.delete" });

    if (expiredKeys.length > 0) {
      await deleteR2Keys(expiredKeys);
    }

    return NextResponse.json({ ok: true, trashedFiles });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "DELETE /api/admin/showreel",
      prefix: "Không xoá được showreel trên R2 —",
    });
  }
}
