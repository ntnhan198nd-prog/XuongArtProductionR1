import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import { updateStore } from "@/lib/contentStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

function compareByExistingOrder(a, b) {
  const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
  const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return Number(a.id) - Number(b.id);
}

export async function POST(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderedIds = Array.isArray(body?.orderedIds)
    ? body.orderedIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : null;

  if (!orderedIds) {
    return NextResponse.json(
      { error: "orderedIds must be an array of image project IDs." },
      { status: 400 }
    );
  }

  try {
    await updateStore((store) => {
      const items = Array.isArray(store.imageProjects) ? store.imageProjects : [];
      const byId = new Map(items.map((item) => [Number(item.id), item]));
      const seen = new Set();

      const ordered = [];
      for (const id of orderedIds) {
        if (seen.has(id)) continue;
        const item = byId.get(id);
        if (item) {
          ordered.push(item);
          seen.add(id);
        }
      }

      const rest = items
        .filter((item) => !seen.has(Number(item.id)))
        .sort(compareByExistingOrder);

      store.imageProjects = [...ordered, ...rest].map((item, index) => ({
        ...item,
        order: index + 1,
      }));

      return store;
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "POST /api/admin/image-projects/reorder",
      prefix: "Không lưu được thứ tự dự án ảnh lên R2 —",
    });
  }
}
