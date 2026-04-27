import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { readStore, updateStore } from "@/lib/contentStore";

export const revalidate = 0;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();
  const store = await readStore();
  return NextResponse.json({ data: store.showreel || null });
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

  let saved = null;
  await updateStore((store) => {
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
    return store;
  });

  const fresh = await readStore();
  saved = fresh.showreel;
  return NextResponse.json({ data: saved });
}

export async function DELETE(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();
  await updateStore((store) => {
    store.showreel = null;
    return store;
  });
  return NextResponse.json({ ok: true });
}
