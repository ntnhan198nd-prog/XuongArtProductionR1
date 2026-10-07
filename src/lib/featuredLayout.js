// Shared featured-grid layout rules. Imported by BOTH the public homepage
// gallery (client) and the admin layout panel / reorder API (server), so
// this file must stay free of "server-only" and of any browser globals.
//
// The homepage featured grid is a sequence of *slots*: 6 per slide, laid
// out as 2 portraits framing 4 landscapes (a..f). A project can pin itself
// to a specific slot via `featuredSlot` (0-based absolute index — slot 6 is
// cell "a" of slide 2). Projects without a pin fill the lowest empty slots
// in `order` sequence, which keeps content that pre-dates `featuredSlot`
// rendering exactly as before (sequential by order).
//
// Pins only exist when the admin's layout has gaps: the reorder API writes
// `featuredSlot: null` for every project whenever the layout is dense, so
// the create/edit form's `order` field keeps driving the grid in the common
// case and a later delete never leaves an unexpected hole.

export const FEATURED_SLOTS_PER_SLIDE = 6;
export const FEATURED_SLOT_KEYS = ["a", "b", "c", "d", "e", "f"];
export const FEATURED_SLOT_SHAPES = {
  a: "portrait",
  b: "landscape",
  c: "portrait",
  d: "landscape",
  e: "landscape",
  f: "landscape",
};

// Hard ceiling on a pin so a bad value (typo, hand-edited store JSON) can
// never make resolveFeaturedSlots allocate a giant array and crash the
// public homepage. 50 slides is far beyond any real featured set.
export const FEATURED_MAX_SLIDES = 50;
export const FEATURED_MAX_SLOT = FEATURED_SLOTS_PER_SLIDE * FEATURED_MAX_SLIDES - 1;

export function compareByOrderThenId(a, b) {
  const ao = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
  const bo = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return Number(a?.id) - Number(b?.id);
}

// Accepts anything the store / API may hand us (number, numeric string,
// null) and returns a slot index within [0, FEATURED_MAX_SLOT], or null.
// Out-of-range values are treated as "unpinned" by every consumer.
export function toSlotIndex(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > FEATURED_MAX_SLOT) return null;
  return parsed;
}

const isOccupied = (slot) => slot !== null && slot !== undefined;

// Resolve featured items into a dense slot array (`item | null` per slot).
// Length is always a multiple of FEATURED_SLOTS_PER_SLIDE and trailing
// empty slides are trimmed. Returns [] when there are no items.
//
// Rules, in priority order:
//   1. Items with a valid `featuredSlot` keep that slot. On a conflict the
//      item that sorts first (order, then id) wins; the other is treated
//      as unpinned.
//   2. Unpinned items fill the lowest empty slots in order/id sequence.
export function resolveFeaturedSlots(items = [], getSlot = (item) => item?.featuredSlot) {
  const sorted = [...(items || [])].filter(Boolean).sort(compareByOrderThenId);
  const placed = new Map();
  const unpinned = [];

  for (const item of sorted) {
    const slot = toSlotIndex(getSlot(item));
    if (slot !== null && !placed.has(slot)) {
      placed.set(slot, item);
    } else {
      unpinned.push(item);
    }
  }

  let cursor = 0;
  for (const item of unpinned) {
    while (placed.has(cursor)) cursor += 1;
    placed.set(cursor, item);
    cursor += 1;
  }

  if (placed.size === 0) return [];

  const maxSlot = Math.max(...placed.keys());
  const length = Math.ceil((maxSlot + 1) / FEATURED_SLOTS_PER_SLIDE) * FEATURED_SLOTS_PER_SLIDE;
  return Array.from({ length }, (_, index) => placed.get(index) ?? null);
}

// Split a slot array into slides of FEATURED_SLOTS_PER_SLIDE entries.
export function chunkFeaturedSlots(slots = []) {
  const slides = [];
  for (let i = 0; i < slots.length; i += FEATURED_SLOTS_PER_SLIDE) {
    slides.push(slots.slice(i, i + FEATURED_SLOTS_PER_SLIDE));
  }
  return slides;
}

// Drop trailing fully-empty slides so a layout never carries dead slides.
// Keeps at least one slide when any slot is occupied; returns [] otherwise.
export function trimFeaturedSlots(slots = []) {
  let lastOccupied = -1;
  slots.forEach((slot, index) => {
    if (isOccupied(slot)) lastOccupied = index;
  });
  if (lastOccupied === -1) return [];
  const length = Math.ceil((lastOccupied + 1) / FEATURED_SLOTS_PER_SLIDE) * FEATURED_SLOTS_PER_SLIDE;
  return Array.from({ length }, (_, index) => slots[index] ?? null);
}

// Drop EVERY fully-empty slide (leading, middle or trailing). A slide with
// nothing in it is never meaningful — on the homepage it would be a blank
// carousel page — so both the admin panel and the gallery collapse them.
// Cells inside a kept slide are untouched. Returns [] when nothing is
// occupied.
export function compactFeaturedSlides(slots = []) {
  return chunkFeaturedSlots(trimFeaturedSlots(slots))
    .filter((slide) => slide.some(isOccupied))
    .flat();
}

// Indices of occupied slots, ascending. Used by the reorder API to keep
// the gaps of an existing layout while re-flowing items in a new order.
export function occupiedSlotIndexes(slots = []) {
  const indexes = [];
  slots.forEach((slot, index) => {
    if (isOccupied(slot)) indexes.push(index);
  });
  return indexes;
}

// A layout is dense when its occupied cells are exactly 0..n-1 — i.e. the
// same thing sequential-by-order rendering produces. Dense layouts are
// stored WITHOUT pins (see header comment).
export function isDenseLayout(occupiedIndexes = []) {
  return occupiedIndexes.every((slot, index) => slot === index);
}
