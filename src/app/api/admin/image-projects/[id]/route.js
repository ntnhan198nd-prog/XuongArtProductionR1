import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  compactOrder,
  normalizeImageProjectPayload,
  replaceAtOrder,
} from "@/lib/contentAdmin";
import { updateStore } from "@/lib/contentStore";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function invalidId() {
  return NextResponse.json({ error: "Invalid image project id." }, { status: 400 });
}

export async function PUT(request, { params }) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return invalidId();

  try {
    const body = await request.json();
    let updated = null;

    await updateStore((store) => {
      const index = store.imageProjects.findIndex((item) => Number(item.id) === id);
      if (index === -1) {
        throw new Error("NOT_FOUND");
      }

      updated = {
        id,
        ...normalizeImageProjectPayload(body, store, store.imageProjects[index]),
      };
      store.imageProjects = replaceAtOrder(store.imageProjects, updated, updated.order);
      updated = store.imageProjects.find((item) => Number(item.id) === id) || updated;
      return store;
    });

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
  await updateStore((store) => {
    const before = store.imageProjects.length;
    store.imageProjects = store.imageProjects.filter((item) => Number(item.id) !== id);
    store.imageProjects = compactOrder(store.imageProjects);
    removed = store.imageProjects.length !== before;
    return store;
  });

  if (!removed) {
    return NextResponse.json({ error: "Image project not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
