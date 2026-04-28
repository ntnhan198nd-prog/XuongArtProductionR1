import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  collectAssetKeysFromSite,
  readStore,
  updateStore,
} from "@/lib/contentStore";
import { deleteR2Keys } from "@/lib/r2";
import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from "@/lib/siteContent";

export const revalidate = 0;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function keysToDelete(oldKeys, nextKeys) {
  const stillUsed = new Set(nextKeys);
  return oldKeys.filter((key) => !stillUsed.has(key));
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

  return NextResponse.json({ data: next });
}

export async function DELETE(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  let oldKeys = [];
  await updateStore((store) => {
    oldKeys = collectAssetKeysFromSite(store.site);
    store.site = null;
    return store;
  });

  if (oldKeys.length > 0) {
    await deleteR2Keys(oldKeys);
  }

  return NextResponse.json({ data: DEFAULT_SITE_CONTENT });
}
