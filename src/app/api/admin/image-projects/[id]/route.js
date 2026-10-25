import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import {
  compactOrder,
  normalizeImageProjectPayload,
  replaceAtOrder,
} from "@/lib/contentAdmin";
import {
  addRecordToTrash,
  collectAssetRefsFromImageProject,
  purgeExpiredTrash,
  trashUnreferencedAssets,
  updateStore,
} from "@/lib/contentStore";
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

  try {
    let updated = null;
    let trashedFiles = 0;

    await updateStore((store) => {
      const index = store.imageProjects.findIndex((item) => Number(item.id) === id);
      if (index === -1) {
        throw new Error("NOT_FOUND");
      }

      const previous = store.imageProjects[index];

      // Unique slug among the OTHER image projects; returned in the response.
      updated = {
        id,
        ...normalizeImageProjectPayload(body, store, previous, { id }),
      };
      store.imageProjects = replaceAtOrder(store.imageProjects, updated, updated.order);
      updated = store.imageProjects.find((item) => Number(item.id) === id) || updated;

      // Photos / thumbnail this edit stopped using go to the trash (kept 30
      // days so "Lịch sử" can bring the old version back with its photos);
      // files still used elsewhere in the store are left alone.
      trashedFiles = trashUnreferencedAssets(
        store,
        collectAssetRefsFromImageProject(previous)
      ).length;
      return store;
    }, { action: "image-project.update", detail: id });

    return NextResponse.json({ data: updated, trashedFiles });
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

// Moves the image project into "Thùng rác" (restorable for 30 days) —
// nothing is deleted from R2 here. Trash entries past their 30 days are
// purged on the way; their files are deleted after the store write.
export async function DELETE(request, { params }) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return invalidId();

  try {
    let entry = null;
    let expiredKeys = [];
    await updateStore((store) => {
      const target = store.imageProjects.find((item) => Number(item.id) === id);
      if (!target) throw new Error("NOT_FOUND");
      const now = Date.now();
      store.imageProjects = compactOrder(
        store.imageProjects.filter((item) => Number(item.id) !== id)
      );
      // `target` still carries its old `order` (compactOrder made copies).
      entry = addRecordToTrash(store, "imageProject", target, { now });
      expiredKeys = purgeExpiredTrash(store, now);
      return store;
    }, { action: "image-project.delete", detail: id });

    if (expiredKeys.length > 0) {
      await deleteR2Keys(expiredKeys);
    }

    return NextResponse.json({
      ok: true,
      trashId: entry.id,
      trash: { id: entry.id, label: entry.label, expiresAt: entry.expiresAt },
    });
  } catch (error) {
    if (error?.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Image project not found." }, { status: 404 });
    }
    return serverErrorResponse(error, {
      context: `DELETE /api/admin/image-projects/${id}`,
      prefix: "Không xoá được dự án ảnh trên R2 —",
    });
  }
}
