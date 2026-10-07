import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/apiErrors";
import { sortByOrderThenId, updateStore } from "@/lib/contentStore";
import {
  compareByOrderThenId,
  isDenseLayout,
  occupiedSlotIndexes,
  resolveFeaturedSlots,
  toSlotIndex,
} from "@/lib/featuredLayout";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: NO_STORE_HEADERS }
  );
}

// Optional `slots` payload sent by the featured layout panel:
//   [{ id, slot }] — every featured project with its 0-based cell index.
// Returns Map(id → slot), or null when the field is absent (plain list
// reorder). Throws on malformed input so the route can answer 400.
// toSlotIndex also enforces the FEATURED_MAX_SLOT ceiling.
function parseSlots(input) {
  if (input === undefined || input === null) return null;
  if (!Array.isArray(input)) throw new Error("INVALID_SLOTS");
  const map = new Map();
  const usedSlots = new Set();
  for (const entry of input) {
    const id = Number(entry?.id);
    const slot = toSlotIndex(entry?.slot);
    if (!Number.isInteger(id) || id <= 0 || slot === null) {
      throw new Error("INVALID_SLOTS");
    }
    if (map.has(id) || usedSlots.has(slot)) throw new Error("INVALID_SLOTS");
    map.set(id, slot);
    usedSlots.add(slot);
  }
  return map;
}

const sameSequence = (a, b) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

export async function POST(request) {
  if (!isAdminAuthenticated(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requestedIds = Array.isArray(body?.orderedIds)
    ? body.orderedIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : null;

  if (!requestedIds) {
    return NextResponse.json(
      { error: "orderedIds must be an array of project IDs." },
      { status: 400 }
    );
  }

  let slotMap;
  try {
    slotMap = parseSlots(body?.slots);
  } catch {
    return NextResponse.json(
      {
        error:
          "slots must be an array of { id, slot } with unique ids and cells (slot 0..299).",
      },
      { status: 400 }
    );
  }

  // With an explicit layout, `order` must follow cell order so that a dense
  // layout (stored without pins) renders identically to the panel preview.
  // Pinned ids come first in cell order, then whatever else was sent.
  const orderedIds = slotMap
    ? [
        ...[...slotMap.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id),
        ...requestedIds.filter((id) => !slotMap.has(id)),
      ]
    : requestedIds;

  try {
    const saved = await updateStore((store) => {
      const projects = Array.isArray(store.projects) ? store.projects : [];

      // Snapshot the featured layout *before* re-ordering: the reading
      // order of featured projects and the cells they occupy.
      const previousFeatured = projects
        .filter((project) => project.featured)
        .sort(compareByOrderThenId);
      const previousSequence = previousFeatured.map((project) => Number(project.id));
      const previousOccupied = occupiedSlotIndexes(resolveFeaturedSlots(previousFeatured));

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
        .sort(compareByOrderThenId);

      const reordered = [...ordered, ...rest].map((project, index) => ({
        ...project,
        order: index + 1,
      }));

      // Pins exist only when the layout has gaps (see lib/featuredLayout.js).
      const withPins = (pinFor) =>
        reordered.map((project) => ({
          ...project,
          featuredSlot: project.featured ? pinFor(project) : null,
        }));

      if (slotMap) {
        // Explicit layout from the panel. The panel always sends the full
        // featured set, so anything missing was un-featured → released.
        const occupied = [...slotMap.values()].sort((a, b) => a - b);
        store.projects = isDenseLayout(occupied)
          ? withPins(() => null)
          : withPins((project) => slotMap.get(Number(project.id)) ?? null);
      } else {
        // Plain reorder (↑/↓ buttons, list drag — possibly of non-featured
        // items only). Leave the layout alone unless the featured reading
        // order actually changed; then re-flow through the cells already in
        // use so manual gaps survive. A dense layout stays unpinned, which
        // is exactly the legacy sequential-by-order behaviour.
        const nextSequence = reordered
          .filter((project) => project.featured)
          .map((project) => Number(project.id));

        if (sameSequence(previousSequence, nextSequence)) {
          store.projects = reordered;
        } else if (isDenseLayout(previousOccupied)) {
          store.projects = withPins(() => null);
        } else {
          let cursor = 0;
          store.projects = withPins(() => {
            const slot = previousOccupied[cursor] ?? null;
            cursor += 1;
            return slot;
          });
        }
      }

      return store;
    });

    // Return the saved list so the admin can refresh its optimistic state
    // (pins may have changed) without a second round-trip.
    return NextResponse.json(
      { ok: true, data: sortByOrderThenId(saved?.projects || []) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return serverErrorResponse(error, {
      context: "POST /api/admin/projects/reorder",
      prefix: "Không lưu được thứ tự dự án lên R2 —",
    });
  }
}
