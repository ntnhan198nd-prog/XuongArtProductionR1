import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { deleteR2Keys, isAllowedFolder } from "@/lib/r2";

// Best-effort cleanup endpoint: the admin client calls this with the keys of
// objects it PUT directly to R2 during a save that then failed, so those
// objects don't orphan in the bucket. Restricted to the upload folders the
// admin actually writes to, so a stray/forged call can never delete the
// content store (_admin/content.json) or anything outside the media tree.
export async function POST(request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const keys = Array.isArray(body?.keys) ? body.keys : [];
  const safeKeys = keys
    .filter((k) => typeof k === "string" && k.trim().length > 0)
    .filter((k) => isAllowedFolder(k.split("/")[0]));

  if (safeKeys.length > 0) {
    await deleteR2Keys(safeKeys);
  }

  return NextResponse.json({ deleted: safeKeys.length });
}
