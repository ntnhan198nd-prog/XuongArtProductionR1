import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import {
  getSortedProjects,
  insertAtOrder,
  normalizeProjectPayload,
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
      { data: getSortedProjects(store.projects) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    // Previously unhandled → empty 500 body → "Unexpected end of JSON input"
    // in the admin. Now the real cause (usually R2 credentials/env) is shown.
    return serverErrorResponse(error, {
      context: "GET /api/admin/projects",
      prefix: "Không đọc được danh sách dự án từ R2 —",
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
    return NextResponse.json({ error: "Invalid project payload." }, { status: 400 });
  }

  try {
    let created = null;

    await updateStore((store) => {
      const payload = normalizeProjectPayload(body, store);
      const id = store.nextProjectId;
      store.nextProjectId += 1;
      created = { id, ...payload };
      store.projects = insertAtOrder(store.projects, created, payload.order);
      created = store.projects.find((item) => Number(item.id) === id) || created;
      return store;
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    // The old handler answered 400 "Invalid project payload." for *any*
    // failure here — including R2 being down — which sent the admin hunting
    // for a form mistake that didn't exist.
    return serverErrorResponse(error, {
      context: "POST /api/admin/projects",
      prefix: "Không lưu được dự án lên R2 —",
    });
  }
}
