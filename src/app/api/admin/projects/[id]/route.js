import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { compactOrder, normalizeProjectPayload, replaceAtOrder } from "@/lib/contentAdmin";
import { updateStore } from "@/lib/contentStore";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function invalidId() {
  return NextResponse.json({ error: "Invalid project id." }, { status: 400 });
}

export async function PUT(request, { params }) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return invalidId();

  try {
    const body = await request.json();
    let updated = null;

    await updateStore((store) => {
      const index = store.projects.findIndex((item) => Number(item.id) === id);
      if (index === -1) {
        throw new Error("NOT_FOUND");
      }

      updated = {
        id,
        ...normalizeProjectPayload(body, store, store.projects[index]),
      };
      store.projects = replaceAtOrder(store.projects, updated, updated.order);
      updated = store.projects.find((item) => Number(item.id) === id) || updated;
      return store;
    });

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
  await updateStore((store) => {
    const before = store.projects.length;
    store.projects = store.projects.filter((item) => Number(item.id) !== id);
    store.projects = compactOrder(store.projects);
    removed = store.projects.length !== before;
    return store;
  });

  if (!removed) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
