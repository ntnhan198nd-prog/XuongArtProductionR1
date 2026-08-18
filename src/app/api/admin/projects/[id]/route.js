import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import { compactOrder, normalizeProjectPayload, replaceAtOrder } from "@/lib/contentAdmin";
import { collectAssetKeysFromProject, updateStore } from "@/lib/contentStore";
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
  return NextResponse.json({ error: "Invalid project id." }, { status: 400 });
}

// Diff old vs new asset keys so we only delete the ones that have actually
// been removed/replaced. Keys that are still in use must survive cleanup.
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
    return NextResponse.json({ error: "Invalid project payload." }, { status: 400 });
  }

  let oldKeys = [];
  try {
    let updated = null;

    await updateStore((store) => {
      const index = store.projects.findIndex((item) => Number(item.id) === id);
      if (index === -1) {
        throw new Error("NOT_FOUND");
      }

      oldKeys = collectAssetKeysFromProject(store.projects[index]);

      updated = {
        id,
        ...normalizeProjectPayload(body, store, store.projects[index]),
      };
      store.projects = replaceAtOrder(store.projects, updated, updated.order);
      updated = store.projects.find((item) => Number(item.id) === id) || updated;
      return store;
    });

    // Delete only assets the new payload no longer references. Cleanup is
    // best-effort and runs after the store write succeeds so a failed
    // delete cannot corrupt the saved state.
    const orphans = keysToDelete(oldKeys, collectAssetKeysFromProject(updated));
    if (orphans.length > 0) {
      await deleteR2Keys(orphans);
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error?.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    return serverErrorResponse(error, {
      context: `PUT /api/admin/projects/${id}`,
      prefix: "Không cập nhật được dự án trên R2 —",
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
      const before = store.projects.length;
      const target = store.projects.find((item) => Number(item.id) === id);
      if (target) removedKeys = collectAssetKeysFromProject(target);
      store.projects = store.projects.filter((item) => Number(item.id) !== id);
      store.projects = compactOrder(store.projects);
      removed = store.projects.length !== before;
      return store;
    });

    if (!removed) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (removedKeys.length > 0) {
      await deleteR2Keys(removedKeys);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverErrorResponse(error, {
      context: `DELETE /api/admin/projects/${id}`,
      prefix: "Không xoá được dự án trên R2 —",
    });
  }
}
