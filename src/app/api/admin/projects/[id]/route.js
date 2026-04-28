import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { compactOrder, normalizeProjectPayload, replaceAtOrder } from "@/lib/contentAdmin";
import { collectAssetKeysFromProject, updateStore } from "@/lib/contentStore";
import { deleteR2Keys } from "@/lib/r2";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  let oldKeys = [];
  try {
    const body = await request.json();
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

    console.error("Update project failed:", error);
    return NextResponse.json({ error: "Invalid project payload." }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return invalidId();

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
}
