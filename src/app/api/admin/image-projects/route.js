import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  getSortedProjects,
  insertAtOrder,
  normalizeImageProjectPayload,
} from "@/lib/contentAdmin";
import { readStore, updateStore } from "@/lib/contentStore";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  const store = await readStore();
  return NextResponse.json({ data: getSortedProjects(store.imageProjects) });
}

export async function POST(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  try {
    const body = await request.json();
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
    console.error("Create image project failed:", error);
    return NextResponse.json(
      { error: "Invalid image project payload." },
      { status: 400 }
    );
  }
}
