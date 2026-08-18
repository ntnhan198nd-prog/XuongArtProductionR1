import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import {
  getSortedProjects,
  insertAtOrder,
  normalizeImageProjectPayload,
} from "@/lib/contentAdmin";
import { readStore, updateStore } from "@/lib/contentStore";

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
      { data: getSortedProjects(store.imageProjects) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return serverErrorResponse(error, {
      context: "GET /api/admin/image-projects",
      prefix: "Không đọc được danh sách dự án ảnh từ R2 —",
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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Invalid image project payload." },
      { status: 400 }
    );
  }

  try {
    let created = null;

    await updateStore((store) => {
      const payload = normalizeImageProjectPayload(body, store);
      const id = store.nextImageProjectId;
      store.nextImageProjectId += 1;
      created = { id, ...payload };
      store.imageProjects = insertAtOrder(store.imageProjects, created, payload.order);
      created = store.imageProjects.find((item) => Number(item.id) === id) || created;
      return store;
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "POST /api/admin/image-projects",
      prefix: "Không lưu được dự án ảnh lên R2 —",
    });
  }
}
