import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import {
  compactOrder,
  normalizeImageProjectPayload,
  replaceAtOrder,
} from "@/lib/contentAdmin";
import { collectAssetKeysFromImageProject, updateStore } from "@/lib/contentStore";
import { deleteR2Keys } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

function invalidId() {
  return NextResponse.json({ error: "Invalid image project id." }, { status: 400 });
}

function keysToDelete(oldKeys, nextKeys) {
  const stillUsed = new Set(nextKeys);
  return oldKeys.filter((key) => !stillUsed.has(key));
}

export async function PUT(request, { params }) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return invalidId();

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

  let oldKeys = [];
  try {
    let updated = null;

    await updateStore((store) => {
      const index = store.imageProjects.findIndex((item) => Number(item.id) === id);
      if (index === -1) {
        throw new Error("NOT_FOUND");
      }

      oldKeys = collectAssetKeysFromImageProject(store.imageProjects[index]);

      updated = {
        id,
        ...normalizeImageProjectPayload(body, store, store.imageProjects[index]),
      };
      store.imageProjects = replaceAtOrder(store.imageProjects, updated, updated.order);
      updated = store.imageProjects.find((item) => Number(item.id) === id) || updated;
      return store;
    });

    const orphans = keysToDelete(oldKeys, collectAssetKeysFromImageProject(updated));
    if (orphans.length > 0) {
      await deleteR2Keys(orphans);
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error?.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Image project not found." }, { status: 404 });
    }
    return serverErrorResponse(error, {
      context: `PUT /api/admin/image-projects/${id}`,
      prefix: "Không cập nhật được dự án ảnh trên R2 —",
    });
  }
}

export async function DELETE(request, { params }) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return invalidId();

  try {
    let removed = false;
    let removedKeys = [];
    await updateStore((store) => {
      const before = store.imageProjects.length;
      const target = store.imageProjects.find((item) => Number(item.id) === id);
      if (target) removedKeys = collectAssetKeysFromImageProject(target);
      store.imageProjects = store.imageProjects.filter((item) => Number(item.id) !== id);
      store.imageProjects = compactOrder(store.imageProjects);
      removed = store.imageProjects.length !== before;
      return store;
    });

    if (!removed) {
      return NextResponse.json({ error: "Image project not found." }, { status: 404 });
    }

    if (removedKeys.length > 0) {
      await deleteR2Keys(removedKeys);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverErrorResponse(error, {
      context: `DELETE /api/admin/image-projects/${id}`,
      prefix: "Không xoá được dự án ảnh trên R2 —",
    });
  }
}
