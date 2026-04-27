import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { readStore, updateStore } from "@/lib/contentStore";
import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from "@/lib/siteContent";

export const revalidate = 0;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();
  const store = await readStore();
  return NextResponse.json({
    data: normalizeSiteContent(store.site),
    defaults: DEFAULT_SITE_CONTENT,
  });
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

  await updateStore((store) => {
    store.site = next;
    return store;
  });

  return NextResponse.json({ data: next });
}

export async function DELETE(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();
  await updateStore((store) => {
    store.site = null;
    return store;
  });
  return NextResponse.json({ data: DEFAULT_SITE_CONTENT });
}
