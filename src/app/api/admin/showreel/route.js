import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import { readStore, updateStore } from "@/lib/contentStore";
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
    let oldKey = null;
    await updateStore((store) => {
      if (store.showreel?.key && store.showreel.key !== body.key) {
        oldKey = store.showreel.key;
      }
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
      return store;
    });

    // Replace, not append: drop the previous showreel video from R2 once the
    // store has switched over.
    if (oldKey) {
      await deleteR2Keys([oldKey]);
    }

    return NextResponse.json({ data: saved });
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
    let oldKey = null;
    await updateStore((store) => {
      if (store.showreel?.key) oldKey = store.showreel.key;
      store.showreel = null;
      return store;
    });

    if (oldKey) {
      await deleteR2Keys([oldKey]);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "DELETE /api/admin/showreel",
      prefix: "Không xoá được showreel trên R2 —",
    });
  }
}
