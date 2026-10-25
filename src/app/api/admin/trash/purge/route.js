import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import {
  purgeExpiredTrashNow,
  removeTrashEntry,
  trashHistoryDetail,
  updateStore,
} from "@/lib/contentStore";
import { deleteR2Keys } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ID_LENGTH = 200;
const NOT_FOUND_CODE = "TRASH_ENTRY_NOT_FOUND";

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

function badRequest(message) {
  return NextResponse.json({ error: message }, { status: 400, headers: NO_STORE_HEADERS });
}

// Deletes trash entries for good.
//   { id }            → that one entry now,
//   { expired: true } → every entry past its 30 days.
// Files are deleted from R2 only AFTER the store write succeeded, and only
// those nothing else in the store (live content or another trash entry)
// still uses.
export async function POST(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Dữ liệu gửi lên không hợp lệ.");
  }

  if (body?.expired === true) {
    try {
      const { purged, deletedFiles } = await purgeExpiredTrashNow();
      return NextResponse.json(
        { ok: true, purged, deletedFiles },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      return serverErrorResponse(error, {
        context: "POST /api/admin/trash/purge (expired)",
        prefix: "Không dọn được Thùng rác —",
      });
    }
  }

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id || id.length > MAX_ID_LENGTH) return badRequest("Thiếu mục cần xoá.");

  try {
    let removed = null;
    await updateStore(
      (store) => {
        removed = removeTrashEntry(store, id);
        if (!removed) {
          const error = new Error(`Trash entry ${id} not found.`);
          error.code = NOT_FOUND_CODE;
          throw error;
        }
        return store;
      },
      { action: "trash.purge", detail: () => trashHistoryDetail(removed?.entry) }
    );

    if (removed.keys.length > 0) {
      await deleteR2Keys(removed.keys);
    }

    return NextResponse.json(
      { ok: true, purged: 1, deletedFiles: removed.keys.length },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error?.code === NOT_FOUND_CODE) {
      return NextResponse.json(
        { error: "Không tìm thấy mục này trong Thùng rác — có thể đã bị xoá rồi." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    return serverErrorResponse(error, {
      context: "POST /api/admin/trash/purge",
      prefix: "Không xoá được mục trong Thùng rác —",
    });
  }
}
