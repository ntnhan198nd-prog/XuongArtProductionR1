import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import {
  ORPHANS_UNDECIDABLE_CODE,
  ORPHAN_DELETE_MAX_KEYS,
  checkMediaKeyExists,
  deleteOrphanMedia,
  scanOrphanMedia,
} from "@/lib/healthChecks";

// "File thừa trên R2" (admin "Hệ thống" tab).
//
// GET  → lists every upload folder of the bucket (capped, see
//        lib/healthChecks ORPHAN_SCAN_CAP) and reports as orphans only the
//        files that are not used by the live content (records, showreel,
//        site content, trash), are older than 24 h, and are not used by any
//        recent history snapshot. When history cannot be read the orphans
//        are reported as unknown and deletion is refused.
// POST {"keys": [...]} → re-runs the same scan and deletes only the keys
//        that still qualify: { deleted, skipped, failed, freedBytes }.
// GET ?check=<key> → { key, exists } (true / false / null = unknown):
//        read-only HEAD of one upload-folder key, used by the "Thử upload"
//        test to confirm its test image is really gone.
// Nothing under "_admin/" is ever listed or deleted.
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Every request re-runs the full scan (listing, history snapshots, HEADs).
export const maxDuration = 60;

function searchParamsOf(request) {
  if (request?.nextUrl?.searchParams) return request.nextUrl.searchParams;
  try {
    return new URL(request?.url).searchParams;
  } catch {
    return new URLSearchParams();
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

export async function GET(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();
  const checkKey = searchParamsOf(request).get("check");
  if (checkKey !== null) {
    try {
      const exists = await checkMediaKeyExists(checkKey);
      return NextResponse.json({ key: checkKey, exists }, { headers: NO_STORE_HEADERS });
    } catch (error) {
      if (error?.code === "INVALID_KEY") return badRequest(error.message);
      return serverErrorResponse(error, {
        context: "GET /api/admin/r2/orphans?check",
        prefix: "Không kiểm tra được file trên R2 —",
      });
    }
  }
  try {
    const report = await scanOrphanMedia();
    return NextResponse.json(report, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "GET /api/admin/r2/orphans",
      prefix: "Không quét được file trên R2 —",
    });
  }
}

export async function POST(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Dữ liệu gửi lên không hợp lệ.");
  }
  const keys = body?.keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.some((key) => typeof key !== "string")) {
    return badRequest("Thiếu danh sách file cần xoá.");
  }
  if (keys.length > ORPHAN_DELETE_MAX_KEYS) {
    return badRequest(`Mỗi lần chỉ xoá tối đa ${ORPHAN_DELETE_MAX_KEYS} file.`);
  }

  try {
    const result = await deleteOrphanMedia(keys);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error?.code === ORPHANS_UNDECIDABLE_CODE) {
      const detail = error.detail || {};
      return NextResponse.json(
        {
          error: `Chưa xoá file nào để an toàn: ${detail.message || "không xác định được file thừa."}`,
          hint: detail.hint || "Thử quét lại sau ít phút.",
          code: ORPHANS_UNDECIDABLE_CODE,
        },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    return serverErrorResponse(error, {
      context: "POST /api/admin/r2/orphans",
      prefix: "Không xoá được file thừa —",
    });
  }
}
