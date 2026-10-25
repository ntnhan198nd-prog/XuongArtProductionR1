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
//   A non-featured video placed in a cell becomes featured.
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

// Optional `unfeatureIds` (only together with `slots`): videos the layout
// panel sent back to its "Video chưa nổi bật" strip. Returns a Set of ids
// (empty when absent). Throws on malformed input, duplicates, or an id that
// is also placed in `slots`. An id that is not a stored video (deleted
// meanwhile) is skipped later: un-featuring it changes nothing.
function parseUnfeatureIds(input, slotMap) {
  if (input === undefined || input === null) return new Set();
  if (!Array.isArray(input) || !slotMap) throw new Error("INVALID_UNFEATURE");
  const ids = new Set();
  for (const value of input) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0 || ids.has(id) || slotMap.has(id)) {
      throw new Error("INVALID_UNFEATURE");
    }
    ids.add(id);
  }
  return ids;
}

// Optional `expectedFeaturedIds` (only together with `slots`): the videos
// that were "Nổi bật" when the panel built its draft. When the stored set
// differs (★ switched in the "Video" tab or another browser meanwhile), the
// save is refused with 409 so an old draft cannot undo those changes.
// Returns a Set, or null when absent (older clients: no check).
function parseExpectedFeatured(input, slotMap) {
  if (input === undefined || input === null) return null;
  if (!Array.isArray(input) || !slotMap) throw new Error("INVALID_EXPECTED");
  const ids = new Set();
  for (const value of input) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new Error("INVALID_EXPECTED");
    ids.add(id);
  }
  return ids;
}

const NOT_VIDEOS = "NOT_VIDEOS";
const STALE_FEATURED = "STALE_FEATURED";

const sameIdSet = (a, b) => a.size === b.size && [...a].every((id) => b.has(id));

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

  let unfeatureIds;
  try {
    unfeatureIds = parseUnfeatureIds(body?.unfeatureIds, slotMap);
  } catch {
    return NextResponse.json(
      {
        error:
          "unfeatureIds must be an array of unique project IDs, sent with slots and not placed in slots.",
      },
      { status: 400 }
    );
  }

  let expectedFeatured;
  try {
    expectedFeatured = parseExpectedFeatured(body?.expectedFeaturedIds, slotMap);
  } catch {
    return NextResponse.json(
      { error: "expectedFeaturedIds must be an array of project IDs, sent with slots." },
      { status: 400 }
    );
  }

  // Ids of the layout in cell order.
  const slotIdsByCell = slotMap
    ? [...slotMap.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)
    : [];

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

      // Every id the layout places must be a stored video (store.projects);
      // anything else (an image project id, a video deleted meanwhile)
      // rejects the whole save.
      const unknown = slotIdsByCell.filter((id) => !byId.has(id));
      if (unknown.length > 0) {
        const error = new Error(NOT_VIDEOS);
        error.ids = unknown;
        throw error;
      }

      // The draft was built from another "Nổi bật" set than the stored one.
      if (
        expectedFeatured &&
        !sameIdSet(expectedFeatured, new Set(previousSequence))
      ) {
        throw new Error(STALE_FEATURED);
      }

      const current = [...projects].sort(compareByOrderThenId);
      const featuredOutsideLayout = current.filter((project) => {
        const id = Number(project.id);
        return project.featured && !slotMap?.has(id) && !unfeatureIds.has(id);
      });

      let sequence;
      if (slotMap && featuredOutsideLayout.length === 0) {
        // Layout save: the placed videos, in cell order, take the places in
        // the manual order that these same videos hold now. Every other
        // video keeps its place (the "Video" page order barely moves), and
        // the featured reading order matches the cells, so a dense layout
        // (stored without pins) renders exactly like the panel preview.
        const positions = [];
        current.forEach((project, index) => {
          if (slotMap.has(Number(project.id))) positions.push(index);
        });
        sequence = [...current];
        positions.forEach((position, index) => {
          sequence[position] = byId.get(slotIdsByCell[index]);
        });
      } else {
        // Plain reorder, or (older clients without the featured check) a
        // layout that left out a featured video: the requested ids first —
        // a layout's own ids in cell order — then the rest by order.
        const orderedIds = slotMap
          ? [...slotIdsByCell, ...requestedIds.filter((id) => !slotMap.has(id))]
          : requestedIds;
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
        sequence = [...ordered, ...current.filter((project) => !seen.has(Number(project.id)))];
      }

      // Layout saves also switch "Nổi bật": a video placed in a cell becomes
      // featured, one sent back to the strip (unfeatureIds) stops being
      // featured and releases its cell.
      const now = new Date().toISOString();
      const reordered = sequence.map((project, index) => {
        const id = Number(project.id);
        const next = { ...project, order: index + 1 };
        if (slotMap && slotMap.has(id) && !project.featured) {
          next.featured = true;
          next.updatedAt = now;
        } else if (unfeatureIds.has(id)) {
          if (project.featured) next.updatedAt = now;
          next.featured = false;
          next.featuredSlot = null;
        }
        return next;
      });

      // Pins exist only when the layout has gaps (see lib/featuredLayout.js).
      const withPins = (pinFor) =>
        reordered.map((project) => ({
          ...project,
          featuredSlot: project.featured ? pinFor(project) : null,
        }));

      if (slotMap) {
        // Explicit layout from the panel: every featured video it shows,
        // with its cell. A featured video it did not send (e.g. featured in
        // another tab meanwhile) stays featured, unpinned.
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
    }, { action: slotMap ? "projects.featured-layout" : "projects.reorder" });

    // Return the saved list so the admin can refresh its optimistic state
    // (pins may have changed) without a second round-trip.
    return NextResponse.json(
      { ok: true, data: sortByOrderThenId(saved?.projects || []) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error?.message === NOT_VIDEOS) {
      const ids = Array.isArray(error.ids) ? error.ids : [];
      return NextResponse.json(
        {
          error: `Không tìm thấy video #${ids.join(", #")} — có thể đã bị xoá. Tải lại danh sách rồi xếp lại.`,
          code: NOT_VIDEOS,
          ids,
        },
        { status: 400 }
      );
    }
    if (error?.message === STALE_FEATURED) {
      return NextResponse.json(
        {
          error:
            "Danh sách video Nổi bật đã đổi ở nơi khác (thẻ “Video” hoặc một trình duyệt khác) nên bố cục này chưa được lưu. Tải lại danh sách rồi xếp lại.",
          code: STALE_FEATURED,
        },
        { status: 409 }
      );
    }
    return serverErrorResponse(error, {
      context: "POST /api/admin/projects/reorder",
      prefix: "Không lưu được thứ tự dự án lên R2 —",
    });
  }
}
