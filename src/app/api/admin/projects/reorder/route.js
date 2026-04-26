import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { updateStore } from "@/lib/contentStore";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function compareByExistingOrder(a, b) {
  const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
  const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return Number(a.id) - Number(b.id);
}

export async function POST(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderedIds = Array.isArray(body?.orderedIds)
    ? body.orderedIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : null;

  if (!orderedIds) {
    return NextResponse.json(
      { error: "orderedIds must be an array of project IDs." },
      { status: 400 }
    );
  }

  await updateStore((store) => {
    const projects = Array.isArray(store.projects) ? store.projects : [];
    const byId = new Map(projects.map((project) => [Number(project.id), project]));
    const seen = new Set();

    const ordered = [];
    for (const id of orderedIds) {
      if (seen.has(id)) continue;
      const project = byId.get(id);
      if (project) {
        ordered.push(project);
        seen.add(id);
      }
    }

    const rest = projects
      .filter((project) => !seen.has(Number(project.id)))
      .sort(compareByExistingOrder);

    store.projects = [...ordered, ...rest].map((project, index) => ({
      ...project,
      order: index + 1,
    }));

    return store;
  });

  return NextResponse.json({ ok: true });
}
