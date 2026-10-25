import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { collectAssetKeysFromStore, readStore } from "@/lib/contentStore";
import { deleteR2Keys, isAllowedFolder } from "@/lib/r2";

// Upper bound per call — the admin never has more than a few dozen
// unsaved uploads in flight; this just caps a forged/buggy request.
const MAX_KEYS = 500;

// Best-effort cleanup endpoint: the admin client calls this with the keys of
// objects it PUT directly to R2 during a save that then failed (or was
// cancelled / abandoned when the tab closed), so those objects don't orphan
// in the bucket. Restricted to the upload folders the admin actually writes
// to, so a stray/forged call can never delete the content store
// (_admin/content.json) or anything outside the media tree.
//
// Body: {"keys": [...]}. Sent either by fetch (application/json) or by
// navigator.sendBeacon on `pagehide`, which may arrive as text/plain — so the
// body is read as text and parsed regardless of Content-Type. Auth is still
// required: sendBeacon is same-origin, so the admin session cookie is sent.
//
// Safety net: the client decides what is "unsaved" from its own (possibly
// stale) copy of the records — e.g. a save that timed out on the client may
// still have been stored. So the current content store is read first and
// every key a saved record (projects, image projects, showreel, site
// content) still references is skipped. If the store cannot be read,
// nothing is deleted: an orphan is cheap, a deleted live file is not.
export async function POST(request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  const keys = Array.isArray(body?.keys) ? body.keys : [];
  const safeKeys = Array.from(
    new Set(
      keys
        .filter((k) => typeof k === "string" && k.trim().length > 0)
        // No "." / ".." / empty segments, so a key can never be normalised
        // into a path outside its allowed folder.
        .filter((k) => k.split("/").every((seg) => seg && seg !== "." && seg !== ".."))
        .filter((k) => isAllowedFolder(k.split("/")[0]))
    )
  ).slice(0, MAX_KEYS);

  if (safeKeys.length === 0) {
    return NextResponse.json({ deleted: 0, kept: 0 });
  }

  let referenced;
  try {
    referenced = new Set(collectAssetKeysFromStore(await readStore()));
  } catch (error) {
    console.error(
      "[r2/cleanup] content store unreadable — skipping cleanup:",
      error?.message || error
    );
    return NextResponse.json(
      { error: "Chưa dọn được file tạm (không đọc được dữ liệu trang). File vẫn được giữ." },
      { status: 503 }
    );
  }

  const doomed = safeKeys.filter((key) => !referenced.has(key));
  if (doomed.length > 0) {
    await deleteR2Keys(doomed);
  }

  return NextResponse.json({ deleted: doomed.length, kept: safeKeys.length - doomed.length });
}
