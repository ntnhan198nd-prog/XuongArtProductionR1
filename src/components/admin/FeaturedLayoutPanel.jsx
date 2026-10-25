"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/apiClient";
import { useToast } from "@/components/admin/ToastProvider";
import {
  FEATURED_SLOTS_PER_SLIDE,
  FEATURED_SLOT_KEYS,
  FEATURED_SLOT_SHAPES,
  chunkFeaturedSlots,
  compactFeaturedSlides,
  resolveFeaturedSlots,
  trimFeaturedSlots,
} from "@/lib/featuredLayout";

const isVideoUrl = (url = "") => /\.(mp4|webm|ogg|mov|avi)(\?|$)/i.test(url);

// Cell geometry mirrors SLIDE_PATTERNS in components/ProjectsGallery.jsx so
// the preview here is exactly what visitors see. The homepage switches to
// a 3×2 squares grid when every occupied cell of a slide is a square
// project; the panel does the same (cell index === area index on both).
const MIXED_GRID_STYLE = {
  gridTemplateColumns: "1.35fr 1fr 1fr 1.35fr 1fr 1fr",
  gridTemplateRows: "repeat(2, minmax(120px, 1fr))",
  gridTemplateAreas: '"a b b c d d" "a e e c f f"',
};
const MIXED_CELLS = FEATURED_SLOT_KEYS.map((key) => ({
  key,
  shape: FEATURED_SLOT_SHAPES[key],
  label: `${key} · ${FEATURED_SLOT_SHAPES[key] === "portrait" ? "dọc" : "ngang"}`,
  style: { gridArea: key },
}));
const SQUARE_GRID_STYLE = {
  gridTemplateColumns: "repeat(3, 1fr)",
  gridTemplateRows: "repeat(2, minmax(120px, 1fr))",
};
const SQUARE_CELLS = Array.from({ length: FEATURED_SLOTS_PER_SLIDE }, (_, index) => ({
  key: String(index + 1),
  shape: "square",
  label: `${index + 1} · vuông`,
  style: {
    gridColumn: `${(index % 3) + 1} / ${(index % 3) + 2}`,
    gridRow: `${Math.floor(index / 3) + 1} / ${Math.floor(index / 3) + 2}`,
  },
}));

const isOccupied = (id) => id !== null && id !== undefined;

const hasFile = (asset) => typeof asset?.url === "string" && asset.url.trim() !== "";

const ORIENTATION_SHORT = { portrait: "dọc", square: "vuông", landscape: "ngang" };

// Layout state is a dense array of project ids (null = empty cell). Fully
// empty slides are collapsed (they would be blank pages on the homepage)
// and one empty "spare" slide is appended so a card can be dropped onto a
// brand-new slide. The spare slide is trimmed again before saving.
const withSpareSlide = (ids) => [
  ...compactFeaturedSlides(ids),
  ...Array(FEATURED_SLOTS_PER_SLIDE).fill(null),
];

const sameLayout = (a, b) => {
  const ta = trimFeaturedSlots(a);
  const tb = trimFeaturedSlots(b);
  return ta.length === tb.length && ta.every((value, index) => value === tb[index]);
};

// Put video `id` (from the "Video chưa nổi bật" strip) into cell
// `targetIdx`. A video already in that cell moves to the first empty cell,
// so nothing is dropped from the grid by accident. Returns `slots` itself
// when nothing changes.
export function placeVideoInSlots(slots, id, targetIdx) {
  if (!isOccupied(id) || !Number.isInteger(targetIdx) || targetIdx < 0) return slots;
  if (targetIdx >= slots.length) return slots;
  const from = slots.indexOf(id);
  if (from === targetIdx) return slots;
  const next = [...slots];
  if (from >= 0) {
    // Already in the grid: same as moving its card (swap).
    [next[from], next[targetIdx]] = [next[targetIdx], next[from]];
    return withSpareSlide(next);
  }
  const occupant = next[targetIdx];
  next[targetIdx] = id;
  if (isOccupied(occupant)) {
    let free = next.findIndex((value) => !isOccupied(value));
    if (free === -1) {
      next.push(...Array(FEATURED_SLOTS_PER_SLIDE).fill(null));
      free = next.findIndex((value) => !isOccupied(value));
    }
    next[free] = occupant;
  }
  return withSpareSlide(next);
}

// Empty cell `idx` (its video goes back to the strip = no longer featured).
export function removeFromSlots(slots, idx) {
  if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length || !isOccupied(slots[idx])) {
    return slots;
  }
  const next = [...slots];
  next[idx] = null;
  return withSpareSlide(next);
}

// Body for POST /api/admin/projects/reorder: every placed video with its
// cell, plus the videos featured on the server that are no longer placed
// (they go back to "not featured"). `expectedFeaturedIds` = the featured
// set this draft was built from: the server refuses the save (409) when
// the stored set changed meanwhile (★ switched in the "Video" tab).
export function layoutSavePayload(slots, featuredIds = []) {
  const slotEntries = [];
  trimFeaturedSlots(slots).forEach((id, slot) => {
    if (isOccupied(id)) slotEntries.push({ id, slot });
  });
  const placed = new Set(slotEntries.map((entry) => Number(entry.id)));
  const unfeatureIds = [];
  (featuredIds || []).forEach((id) => {
    if (isOccupied(id) && !placed.has(Number(id)) && !unfeatureIds.includes(id)) {
      unfeatureIds.push(id);
    }
  });
  return {
    orderedIds: slotEntries.map((entry) => entry.id),
    slots: slotEntries,
    unfeatureIds,
    expectedFeaturedIds: (featuredIds || []).filter(isOccupied),
  };
}

// Save failures that mean "the list on screen is out of date": retrying the
// same draft cannot work, the list has to be re-read first.
const isOutdatedListError = (error) =>
  error?.status === 409 || (error?.status === 400 && error?.code === "NOT_VIDEOS");

// Small picture of a video for the strip: thumbnail, else a frame of the
// video, else a placeholder.
function VideoThumb({ item }) {
  const thumbUrl = hasFile(item?.thumbnail) ? item.thumbnail.url : "";
  const mediaUrl = hasFile(item?.media) ? item.media.url : "";
  if (thumbUrl || (mediaUrl && !isVideoUrl(mediaUrl))) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbUrl || mediaUrl}
        alt=""
        draggable={false}
        loading="lazy"
        className="pointer-events-none h-full w-full object-cover"
      />
    );
  }
  if (mediaUrl) {
    return (
      <video
        src={`${mediaUrl}#t=0.5`}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        className="pointer-events-none h-full w-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-full items-center justify-center text-[10px] text-gray-400">
      (chưa có file)
    </div>
  );
}

// `items` = every video (GET /api/admin/projects). The grid shows the
// featured ones; the strip below it ("Video chưa nổi bật") the others.
// Dragging a video from the strip into a cell (or clicking it, then a
// cell) features it; "Bỏ khỏi lưới" on a card sends it back. All of it is
// part of the draft saved by "Lưu bố cục".
// `onSaved()` runs after a successful save (the parent re-reads the list).
// `onDirtyChange(dirty)` (optional) reports while the arrangement on screen
// differs from the saved one (false again on unmount).
// `onListOutdated()` (optional) runs when a save is refused because the
// list on screen is out of date (featured set changed elsewhere, a placed
// video was deleted): the parent offers "Tải lại danh sách".
export default function FeaturedLayoutPanel({ items, onSaved, onDirtyChange, onListOutdated }) {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  const notify = (kind, message, opts) => {
    const api = toastRef.current;
    return api && typeof api[kind] === "function" ? api[kind](message, opts) : null;
  };
  // Last "Lưu bố cục thất bại" toast: closed when the next save starts so it
  // never sits next to a later "Đã lưu bố cục trang chủ".
  const errorToastIdRef = useRef(null);

  const featuredItems = useMemo(
    () => (items || []).filter((item) => item?.featured),
    [items]
  );

  const itemsById = useMemo(() => {
    const map = new Map();
    (items || []).forEach((item) => {
      if (item) map.set(item.id, item);
    });
    return map;
  }, [items]);

  // Same resolver the homepage uses (pinned cells + unpinned items flowing
  // into gaps).
  const initialSlots = useMemo(
    () =>
      withSpareSlide(
        resolveFeaturedSlots(featuredItems).map((item) => (item ? item.id : null))
      ),
    [featuredItems]
  );

  const [slots, setSlots] = useState(initialSlots);
  // What is being dragged: { kind: "cell", idx } (a card in the grid) or
  // { kind: "video", id } (a video from the strip).
  const [drag, setDrag] = useState(null);
  const [hoveringIdx, setHoveringIdx] = useState(null);
  const [paletteHover, setPaletteHover] = useState(false);
  // Click-to-move fallback (keyboard, touch screens, or browsers where
  // native HTML5 drag is flaky): click a card (or a video in the strip) to
  // pick it up, click any cell to place it.
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [saving, setSaving] = useState(false);
  // Mirror of `drag` that drop handlers can trust even when the browser
  // hands us an empty dataTransfer (Safari does, intermittently).
  const draggingRef = useRef(null);
  // The arrangement just saved, used as the "saved" baseline until the
  // parent's re-read brings a different server layout. Without it a failed
  // re-read (loadItems keeps the old list) would leave the saved layout
  // looking unsaved.
  const [savedSlots, setSavedSlots] = useState(null);

  // Re-sync from the server layout only when it actually changed. The
  // parent re-fetches `items` after every save / reorder elsewhere on the
  // page; if the featured layout is the same as before, keep whatever the
  // admin is still arranging instead of silently wiping it.
  const baseRef = useRef(initialSlots);
  useEffect(() => {
    const baseChanged = !sameLayout(baseRef.current, initialSlots);
    baseRef.current = initialSlots;
    if (!baseChanged) return;
    setSlots(initialSlots);
    setSavedSlots(null);
    setSelectedIdx(null);
    setSelectedVideoId(null);
  }, [initialSlots]);

  // A video placed from the strip that is gone from the list (deleted in
  // another tab) leaves the draft: saving it would be refused.
  useEffect(() => {
    setSlots((current) =>
      current.every((id) => !isOccupied(id) || itemsById.has(id))
        ? current
        : withSpareSlide(current.map((id) => (isOccupied(id) && !itemsById.has(id) ? null : id)))
    );
    setSelectedVideoId((current) => (current !== null && !itemsById.has(current) ? null : current));
  }, [itemsById]);

  const baselineSlots = savedSlots || initialSlots;
  const slides = useMemo(() => chunkFeaturedSlots(slots), [slots]);
  const dirty = useMemo(() => !sameLayout(slots, baselineSlots), [slots, baselineSlots]);

  // Videos in the grid that are not featured on the server yet, and the
  // strip: every other video, in list order.
  const placedIds = useMemo(() => new Set(slots.filter(isOccupied)), [slots]);
  const paletteItems = useMemo(
    () => (items || []).filter((item) => item && !placedIds.has(item.id)),
    [items, placedIds]
  );
  const newlyFeatured = useMemo(
    () =>
      [...placedIds]
        .map((id) => itemsById.get(id))
        .filter((item) => item && !item.featured),
    [placedIds, itemsById]
  );
  const newlyFeaturedNoWebm = newlyFeatured.filter(
    (item) => hasFile(item.media) && !hasFile(item.preview)
  );
  const newlyFeaturedNoMedia = newlyFeatured.filter((item) => !hasFile(item.media));
  const unfeaturedCount = featuredItems.filter((item) => !placedIds.has(item.id)).length;

  const onDirtyChangeRef = useRef(onDirtyChange);
  const onListOutdatedRef = useRef(onListOutdated);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
    onListOutdatedRef.current = onListOutdated;
  }, [onDirtyChange, onListOutdated]);
  useEffect(() => {
    if (typeof onDirtyChangeRef.current === "function") onDirtyChangeRef.current(dirty);
  }, [dirty]);
  useEffect(
    () => () => {
      if (typeof onDirtyChangeRef.current === "function") onDirtyChangeRef.current(false);
    },
    []
  );

  // Swap the contents of two cells. Either side may be empty, which is
  // how a card moves into a free cell (or out of the way of another).
  const moveCard = useCallback((sourceIdx, targetIdx) => {
    setSlots((current) => {
      if (sourceIdx === null || targetIdx === null || sourceIdx === targetIdx) return current;
      if (sourceIdx < 0 || targetIdx < 0) return current;
      if (sourceIdx >= current.length || targetIdx >= current.length) return current;
      if (!isOccupied(current[sourceIdx])) return current;
      const next = [...current];
      [next[sourceIdx], next[targetIdx]] = [next[targetIdx], next[sourceIdx]];
      return withSpareSlide(next);
    });
  }, []);

  const placeVideo = useCallback((id, targetIdx) => {
    setSlots((current) => placeVideoInSlots(current, id, targetIdx));
  }, []);

  const removeCard = useCallback((idx) => {
    setSlots((current) => removeFromSlots(current, idx));
  }, []);

  // Grid cells (the role="button" element) by flat index, and the cell to
  // focus once a removal re-rendered: the remove button itself is gone, so
  // keyboard focus would otherwise drop to the top of the page.
  const cellRefs = useRef(new Map());
  const pendingFocusRef = useRef(null);
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null) return;
    pendingFocusRef.current = null;
    const map = cellRefs.current;
    // An emptied slide is collapsed, so the index may now be past the end.
    const last = Math.max(-1, ...map.keys());
    const target = map.get(Math.min(pending, last));
    target?.focus?.();
  }, [slots]);

  const clearSelection = () => {
    setSelectedIdx(null);
    setSelectedVideoId(null);
  };

  const startDrag = (event, source) => {
    clearSelection();
    draggingRef.current = source;
    setDrag(source);
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      try {
        // Firefox refuses to start a drag without some payload.
        event.dataTransfer.setData(
          "text/plain",
          source.kind === "cell" ? `cell:${source.idx}` : `video:${source.id}`
        );
      } catch {}
    }
  };
  const endDrag = () => {
    draggingRef.current = null;
    setDrag(null);
    setHoveringIdx(null);
    setPaletteHover(false);
  };
  // What is being dropped: the ref first, else the dataTransfer payload.
  const dropSource = (event) => {
    if (draggingRef.current) return draggingRef.current;
    const raw = String(event?.dataTransfer?.getData("text/plain") || "");
    const match = /^(cell|video):(\d+)$/.exec(raw);
    if (!match) return null;
    const value = Number(match[2]);
    if (match[1] === "cell") return { kind: "cell", idx: value };
    return itemsById.has(value) ? { kind: "video", id: value } : null;
  };
  const handleDragOver = (event, flatIdx) => {
    // Only accept our own cards — ignore files dragged in from the OS.
    if (draggingRef.current === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    if (hoveringIdx !== flatIdx) setHoveringIdx(flatIdx);
  };
  const handleDrop = (event, targetIdx) => {
    event.preventDefault();
    const source = dropSource(event);
    endDrag();
    if (!source) return;
    if (source.kind === "cell") moveCard(source.idx, targetIdx);
    else placeVideo(source.id, targetIdx);
  };
  // A grid card dropped on the strip leaves the grid.
  const handlePaletteDragOver = (event) => {
    if (draggingRef.current?.kind !== "cell") return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    if (!paletteHover) setPaletteHover(true);
  };
  const handlePaletteDrop = (event) => {
    event.preventDefault();
    const source = dropSource(event);
    endDrag();
    if (source?.kind === "cell") removeCard(source.idx);
  };

  const handleCellActivate = (flatIdx) => {
    if (drag !== null) return;
    if (selectedVideoId !== null) {
      placeVideo(selectedVideoId, flatIdx);
      setSelectedVideoId(null);
      return;
    }
    if (selectedIdx === null) {
      if (isOccupied(slots[flatIdx])) setSelectedIdx(flatIdx);
      return;
    }
    if (selectedIdx === flatIdx) {
      setSelectedIdx(null);
      return;
    }
    moveCard(selectedIdx, flatIdx);
    setSelectedIdx(null);
  };

  const handlePaletteActivate = (id) => {
    if (drag !== null) return;
    setSelectedIdx(null);
    setSelectedVideoId((current) => (current === id ? null : id));
  };

  // `refocus`: the action came from a control that disappears with it.
  const handleRemove = (flatIdx, { refocus = true } = {}) => {
    if (!isOccupied(slots[flatIdx])) return;
    if (selectedIdx === flatIdx) setSelectedIdx(null);
    if (refocus) pendingFocusRef.current = flatIdx;
    removeCard(flatIdx);
  };

  const handleReset = () => {
    setSlots(baselineSlots);
    clearSelection();
  };

  const handleSave = async () => {
    if (saving || !dirty) return;
    if (errorToastIdRef.current !== null) {
      toastRef.current?.dismiss?.(errorToastIdRef.current);
      errorToastIdRef.current = null;
    }
    setSaving(true);
    try {
      const body = layoutSavePayload(
        slots,
        featuredItems.map((item) => item.id)
      );
      const switchedOn = body.slots.filter((entry) => !itemsById.get(entry.id)?.featured).length;
      const noMediaCount = body.slots.filter(
        (entry) => !hasFile(itemsById.get(entry.id)?.media)
      ).length;
      const switchedOff = body.unfeatureIds.length;
      await fetchJson(
        "/api/admin/projects/reorder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        { fallbackError: "Lưu bố cục thất bại" }
      );
      setSavedSlots(withSpareSlide(slots));
      const changes = [
        switchedOn > 0 ? `bật Nổi bật cho ${switchedOn} video` : "",
        switchedOff > 0 ? `tắt Nổi bật cho ${switchedOff} video` : "",
      ].filter(Boolean);
      notify("success", "Đã lưu bố cục trang chủ", {
        href: "/",
        hrefLabel: "Xem trang chủ ↗",
        hint: [
          changes.length > 0 ? `Đã ${changes.join(", ")}.` : "",
          noMediaCount > 0
            ? `${noMediaCount} ô trong lưới chưa có file video — ô đó sẽ trống trên trang chủ.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
      // Stay in "Đang lưu…" until the parent has re-read the list, so the
      // "chưa lưu" note does not flash before the saved layout comes back.
      await Promise.resolve(onSaved?.()).catch(() => {});
    } catch (saveError) {
      // The arrangement stays on screen, so "Thử lại" saves it again —
      // except when the list itself is out of date: the same draft would be
      // refused again, so the parent shows "Tải lại danh sách" instead.
      const status = saveError?.status ?? null;
      const outdated = isOutdatedListError(saveError);
      errorToastIdRef.current = notify("error", saveError?.message || "Lưu bố cục thất bại.", {
        hint:
          saveError?.hint ||
          (outdated
            ? "Bấm “Tải lại danh sách” ở khung vàng phía trên, rồi xếp lại các ô."
            : ""),
        ...(status === 401
          ? {
              actionLabel: "Tải lại trang để đăng nhập",
              onAction: () => window.location.reload(),
            }
          : outdated
          ? {}
          : { actionLabel: "Thử lại", onAction: () => saveRef.current?.() }),
      });
      if (outdated) onListOutdatedRef.current?.();
    } finally {
      setSaving(false);
    }
  };
  // Latest handleSave for the toast's "Thử lại" (the slots it saves are
  // whatever is on screen when it is pressed).
  const saveRef = useRef(null);
  useEffect(() => {
    saveRef.current = handleSave;
  });

  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 p-5 text-sm text-gray-500">
        Chưa có video nào. Thêm video ở thẻ <strong>Video</strong> (bấm <em>+ Tạo mới</em>), rồi
        quay lại đây để xếp video vào lưới trang chủ.
      </div>
    );
  }

  const pickingUp = selectedIdx !== null || selectedVideoId !== null || drag !== null;
  const draggingIdx = drag?.kind === "cell" ? drag.idx : null;
  const draggingVideoId = drag?.kind === "video" ? drag.id : null;
  const selectedVideo = selectedVideoId !== null ? itemsById.get(selectedVideoId) : null;
  const selectedCard =
    selectedIdx !== null && isOccupied(slots[selectedIdx]) ? itemsById.get(slots[selectedIdx]) : null;

  return (
    <div className="rounded-2xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Lưới video nổi bật trang chủ</h2>
          <p className="mt-1 text-xs text-gray-600">
            Kéo thẻ thả vào ô bất kỳ — kể cả ô trống — để đổi vị trí; hoặc bấm chọn thẻ rồi
            bấm ô đích. Kéo video từ dải <strong>Video chưa nổi bật</strong> bên dưới vào lưới
            để bật Nổi bật; bấm ✕ trên thẻ (hoặc bấm chọn thẻ rồi bấm <em>Bỏ khỏi lưới</em>) để
            tắt. Mỗi trang 6 ô — ô{" "}
            <strong>a, c</strong> là khung dọc, ô <strong>b, d, e, f</strong> là khung ngang;
            trang chỉ có video vuông dùng lưới 3×2. Trang không có thẻ nào sẽ tự bị bỏ. Bấm{" "}
            <em>Lưu bố cục</em> để áp dụng.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={!dirty || saving}
            className="min-h-[36px] rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Hoàn tác
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="min-h-[36px] rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu bố cục"}
          </button>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[36px] items-center rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            Xem trang chủ ↗
          </a>
        </div>
      </div>

      {dirty && !saving ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Bố cục đã đổi nhưng chưa lưu — bấm <em>Lưu bố cục</em> để trang chủ hiện như trên.
          {newlyFeatured.length > 0 || unfeaturedCount > 0 ? (
            <>
              {" "}
              Khi lưu sẽ
              {newlyFeatured.length > 0 ? ` bật Nổi bật cho ${newlyFeatured.length} video` : ""}
              {newlyFeatured.length > 0 && unfeaturedCount > 0 ? "," : ""}
              {unfeaturedCount > 0 ? ` tắt Nổi bật cho ${unfeaturedCount} video` : ""}.
            </>
          ) : null}
        </p>
      ) : null}

      {newlyFeaturedNoMedia.length > 0 ? (
        <ul
          role="alert"
          className="mt-3 space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
        >
          {newlyFeaturedNoMedia.map((item) => (
            <li key={item.id}>
              ⚠ “{item.title || `#${item.id}`}”: Chưa có file video — ô này sẽ trống trên trang
              chủ. Thêm file ở thẻ “Video”.
            </li>
          ))}
        </ul>
      ) : null}

      {newlyFeaturedNoWebm.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {newlyFeaturedNoWebm.map((item) => (
            <li key={item.id}>
              ⚠ “{item.title || `#${item.id}`}”: Chưa có bản WebM — lưới trang chủ sẽ dùng video
              gốc (nặng hơn). Thêm bản WebM ở thẻ “Video”.
            </li>
          ))}
        </ul>
      ) : null}

      {selectedCard ? (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <p className="min-w-0 flex-1">
            Đang chọn “{selectedCard.title || `#${selectedCard.id}`}” — bấm ô đích để chuyển
            (Esc để bỏ chọn).
          </p>
          <button
            type="button"
            onClick={() => handleRemove(selectedIdx)}
            disabled={saving}
            className="min-h-[36px] rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Bỏ khỏi lưới
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="min-h-[36px] rounded-md border border-amber-300 bg-white px-3 py-1 text-xs text-amber-900 hover:bg-amber-100"
          >
            Bỏ chọn
          </button>
        </div>
      ) : null}

      {selectedVideo ? (
        <p
          role="status"
          className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          Đang chọn “{selectedVideo.title || `#${selectedVideo.id}`}” — bấm một ô trong lưới để
          đặt video vào (Esc để bỏ chọn).
        </p>
      ) : null}

      <div className="mt-5 space-y-6">
        {slides.map((slideIds, slideIndex) => {
          const slideItems = slideIds
            .filter(isOccupied)
            .map((id) => itemsById.get(id))
            .filter(Boolean);
          const isSpareSlide = slideIndex === slides.length - 1 && slideItems.length === 0;
          // Mirrors pickPatternForSlide on the homepage.
          const isSquareSlide =
            slideItems.length > 0 && slideItems.every((item) => item.orientation === "square");
          const cells = isSquareSlide ? SQUARE_CELLS : MIXED_CELLS;
          const gridStyle = isSquareSlide ? SQUARE_GRID_STYLE : MIXED_GRID_STYLE;

          return (
            <div key={slideIndex}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Trang {slideIndex + 1}
                </span>
                {isSpareSlide ? (
                  <span className="text-[11px] normal-case tracking-normal text-gray-400">
                    (trống — thả thẻ vào đây để thêm trang mới)
                  </span>
                ) : isSquareSlide ? (
                  <span className="text-[11px] normal-case tracking-normal text-gray-400">
                    (toàn video vuông — lưới 3×2)
                  </span>
                ) : null}
                <span className="h-px flex-1 bg-gray-200" />
              </div>
              <div
                className={[
                  "grid gap-3 transition-opacity",
                  isSpareSlide && !pickingUp && slides.length > 1 ? "opacity-50" : "",
                ].join(" ")}
                style={gridStyle}
              >
                {cells.map((cell, cellIdx) => {
                  const flatIdx = slideIndex * FEATURED_SLOTS_PER_SLIDE + cellIdx;
                  const id = slideIds[cellIdx];
                  const item = isOccupied(id) ? itemsById.get(id) : null;
                  const url = item?.media?.url || "";
                  const showVideo = url && isVideoUrl(url);
                  const isDragging = draggingIdx === flatIdx;
                  const isSelected = selectedIdx === flatIdx;
                  const isDropTarget =
                    drag !== null && hoveringIdx === flatIdx && draggingIdx !== flatIdx;
                  const shapeMismatch =
                    item && item.orientation && item.orientation !== cell.shape;
                  const isNew = Boolean(item) && !item.featured;

                  const itemName = item ? item.title || `#${item.id}` : "";

                  // The cell is a plain box; the role="button" layer (pick
                  // up / drop) and the ✕ "Bỏ khỏi lưới" button are siblings
                  // inside it, so screen readers announce both.
                  return (
                    <div
                      key={`${slideIndex}-${cell.key}`}
                      style={cell.style}
                      className={[
                        "relative overflow-hidden rounded-xl text-white transition",
                        item
                          ? "border border-gray-200 bg-gray-900"
                          : "border-2 border-dashed border-gray-300 bg-gray-50",
                        !item && pickingUp ? "border-gray-500 bg-gray-100" : "",
                        isDropTarget ? "ring-2 ring-black" : "",
                        isSelected ? "ring-2 ring-amber-500 ring-offset-2" : "",
                        isDragging ? "opacity-40" : "",
                      ].join(" ")}
                      onDragOver={(event) => handleDragOver(event, flatIdx)}
                      onDrop={(event) => handleDrop(event, flatIdx)}
                    >
                      <div
                        ref={(node) => {
                          if (node) cellRefs.current.set(flatIdx, node);
                          else cellRefs.current.delete(flatIdx);
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={
                          item ? `Ô ${cell.key}: #${item.id} ${item.title || ""}` : `Ô ${cell.key}: trống`
                        }
                        aria-pressed={isSelected}
                        className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
                        onClick={() => handleCellActivate(flatIdx)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleCellActivate(flatIdx);
                          } else if (event.key === "Escape" && pickingUp) {
                            clearSelection();
                          }
                        }}
                      >
                        <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white">
                          {cell.label}
                        </span>
                        {item ? (
                          <div
                            draggable
                            onDragStart={(event) => startDrag(event, { kind: "cell", idx: flatIdx })}
                            onDragEnd={endDrag}
                            className="absolute inset-0 cursor-grab select-none active:cursor-grabbing"
                          >
                            {showVideo ? (
                              <video
                                src={url}
                                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={url}
                                alt={item.title || ""}
                                draggable={false}
                                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center bg-neutral-800 text-xs text-neutral-300">
                                (chưa có video)
                              </div>
                            )}
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-2">
                              <div className="truncate text-xs font-semibold">
                                #{item.id} {item.title || "(Chưa có tiêu đề)"}
                              </div>
                              {isNew ? (
                                <div className="truncate text-[10px] text-amber-300">
                                  mới — chưa lưu
                                </div>
                              ) : item.client ? (
                                <div className="truncate text-[10px] text-neutral-300">
                                  {item.client}
                                </div>
                              ) : null}
                            </div>
                            {shapeMismatch ? (
                              <div
                                className="pointer-events-none absolute right-2 top-11 z-10 rounded bg-yellow-500/90 px-1.5 py-0.5 text-[10px] font-medium text-black"
                                title="Hướng khung của video khác với ô này — video sẽ bị cắt bớt"
                              >
                                lệch khung
                              </div>
                            ) : null}
                            {isSelected ? (
                              <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center text-[10px] font-medium text-amber-300">
                                đang chọn — bấm ô đích
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center text-gray-400">
                            <div className="text-[11px]">{pickingUp ? "thả vào đây" : "trống"}</div>
                          </div>
                        )}
                      </div>
                      {item ? (
                        // Icon-only from `md` up, where a portrait cell
                        // (~115 px) fits it beside the cell label. Below
                        // that the cells are too small for a safe tap
                        // target: "Bỏ khỏi lưới" is in the bar shown once
                        // the card is picked.
                        <button
                          type="button"
                          draggable={false}
                          disabled={saving}
                          onClick={() => handleRemove(flatIdx)}
                          aria-label={`Bỏ “${itemName}” khỏi lưới (tắt Nổi bật)`}
                          title="Bỏ khỏi lưới — video về dải “Video chưa nổi bật” (tắt Nổi bật khi lưu)"
                          className="absolute right-1.5 top-1.5 z-20 hidden h-8 w-8 items-center justify-center rounded-full bg-white/90 text-sm font-semibold leading-none text-black shadow hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 md:flex"
                        >
                          <span aria-hidden="true">✕</span>
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <section
        aria-label="Video chưa nổi bật"
        onDragOver={handlePaletteDragOver}
        onDragLeave={() => setPaletteHover(false)}
        onDrop={handlePaletteDrop}
        className={[
          "mt-6 rounded-xl border p-3 transition-colors",
          paletteHover ? "border-black bg-gray-50" : "border-gray-200",
        ].join(" ")}
      >
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Video chưa nổi bật
          </h3>
          <span className="text-[11px] text-gray-500">
            ({paletteItems.length}) — kéo vào ô bất kỳ, hoặc bấm chọn rồi bấm ô.
            {draggingIdx !== null ? " Thả thẻ vào đây để bỏ khỏi lưới." : ""}
          </span>
        </div>
        {paletteItems.length === 0 ? (
          <p className="text-xs text-gray-500">Mọi video đều đang ở trong lưới.</p>
        ) : (
          <ul className="flex gap-3 overflow-x-auto pb-2">
            {paletteItems.map((item) => {
              const selected = selectedVideoId === item.id;
              const noWebm = !hasFile(item.preview);
              return (
                <li key={item.id} className="w-36 shrink-0">
                  {/* A div, not a <button>: Firefox cannot start a drag
                      from a button. Keyboard: Enter / Space picks it up. */}
                  <div
                    role="button"
                    tabIndex={saving ? -1 : 0}
                    draggable={!saving}
                    aria-disabled={saving || undefined}
                    onDragStart={(event) => startDrag(event, { kind: "video", id: item.id })}
                    onDragEnd={endDrag}
                    onClick={() => {
                      if (!saving) handlePaletteActivate(item.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (!saving) handlePaletteActivate(item.id);
                      } else if (event.key === "Escape" && pickingUp) {
                        event.preventDefault();
                        clearSelection();
                      }
                    }}
                    aria-pressed={selected}
                    aria-label={`Chọn “${item.title || `#${item.id}`}” để đặt vào lưới`}
                    title={item.title || `#${item.id}`}
                    className={[
                      "block w-full select-none overflow-hidden rounded-lg border bg-white text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black",
                      saving ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing",
                      selected ? "border-amber-500 ring-2 ring-amber-500" : "border-gray-200 hover:border-gray-400",
                      draggingVideoId === item.id ? "opacity-40" : "",
                    ].join(" ")}
                  >
                    <div className="relative aspect-video bg-gray-100">
                      <VideoThumb item={item} />
                      <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
                        {ORIENTATION_SHORT[item.orientation] || "ngang"}
                      </span>
                      {noWebm ? (
                        <span className="pointer-events-none absolute right-1 top-1 rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-medium text-black">
                          chưa có WebM
                        </span>
                      ) : null}
                    </div>
                    <span className="block truncate px-2 py-1.5 text-xs font-medium text-gray-900">
                      {item.title || "(Chưa có tiêu đề)"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
