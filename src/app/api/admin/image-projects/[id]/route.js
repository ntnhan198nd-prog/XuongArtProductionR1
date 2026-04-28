import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  compactOrder,
  normalizeImageProjectPayload,
  replaceAtOrder,
} from "@/lib/contentAdmin";
import { collectAssetKeysFromImageProject, updateStore } from "@/lib/contentStore";
import { deleteR2Keys } from "@/lib/r2";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  let oldKeys = [];
  try {
    const body = await request.json();
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

    console.error("Update image project failed:", error);
    return NextResponse.json(
      { error: "Invalid image project payload." },
      { status: 400 }
    );
  }
}

export async function DELETE(request, { params }) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return invalidId();

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
}
