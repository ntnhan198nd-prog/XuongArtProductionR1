import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import {
  TRASH_ASSET_RESTORE_CODE,
  TRASH_NOT_FOUND_CODE,
  restoreRecordFromTrash,
} from "@/lib/contentAdmin";
import {
  collectAssetKeysFromTrashEntry,
  readStore,
  trashHistoryDetail,
  updateStore,
} from "@/lib/contentStore";
import { findMissingR2Keys } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ID_LENGTH = 200;

const ASSET_RESTORE_MESSAGE =
  "File này không khôi phục riêng được — dùng tab Lịch sử để đưa nội dung về lúc trước, file vẫn còn trong 30 ngày.";
const NOT_FOUND_MESSAGE =
  "Không tìm thấy mục này trong Thùng rác — có thể đã được khôi phục hoặc đã bị xoá hẳn.";

function missingFilesMessage(count) {
  return `Không khôi phục được: ${count} file của mục này đã bị xoá hẳn khỏi kho lưu trữ, nếu khôi phục video/ảnh trên trang sẽ bị hỏng. Hãy xoá vĩnh viễn mục này rồi tạo lại với file mới.`;
}

// Files of a deleted record that are gone from R2 (e.g. an entry a history
// restore brought back after its files were purged). Best effort: a failed
// check never blocks a restore.
async function countMissingFiles(id) {
  try {
    const store = await readStore();
    const entry = (Array.isArray(store.trash) ? store.trash : []).find((item) => item?.id === id);
    if (!entry || entry.type === "asset") return 0;
    const keys = collectAssetKeysFromTrashEntry(entry);
    if (keys.length === 0) return 0;
    const check = await findMissingR2Keys(keys, { limit: keys.length });
    return check.missing.length;
  } catch (error) {
    console.warn("[trash/restore] missing-file check skipped:", error?.message || error);
    return 0;
  }
}

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

function badRequest(message) {
  return NextResponse.json({ error: message }, { status: 400, headers: NO_STORE_HEADERS });
}

// Body { id }: puts a deleted video / image project back where it was
// (see restoreRecordFromTrash). Replaced files ("asset" entries) answer 400:
// they come back with their content through the "Lịch sử" tab. A record
// whose files are no longer in R2 answers 409 instead of putting a broken
// video / image project back on the public site.
export async function POST(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Dữ liệu gửi lên không hợp lệ.");
  }
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id || id.length > MAX_ID_LENGTH) return badRequest("Thiếu mục cần khôi phục.");

  const missing = await countMissingFiles(id);
  if (missing > 0) {
    return NextResponse.json(
      { error: missingFilesMessage(missing), missing },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  }

  try {
    let result = null;
    await updateStore(
      (store) => {
        result = restoreRecordFromTrash(store, id, { now: new Date() });
        return store;
      },
      { action: "trash.restore", detail: () => trashHistoryDetail(result?.entry) }
    );

    const isVideo = result.collection === "projects";
    return NextResponse.json(
      {
        ok: true,
        type: result.entry.type,
        data: result.record,
        // Admin tab that lists the record (for an "open" link).
        tab: isVideo
          ? result.record.featured
            ? "showreel-featured"
            : "other-videos"
          : "images",
        slugChanged: result.slugChanged,
        previousSlug: result.previousSlug,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error?.code === TRASH_NOT_FOUND_CODE) {
      return NextResponse.json(
        { error: NOT_FOUND_MESSAGE },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    if (error?.code === TRASH_ASSET_RESTORE_CODE) {
      return badRequest(ASSET_RESTORE_MESSAGE);
    }
    return serverErrorResponse(error, {
      context: "POST /api/admin/trash/restore",
      prefix: "Không khôi phục được từ Thùng rác —",
    });
  }
}
