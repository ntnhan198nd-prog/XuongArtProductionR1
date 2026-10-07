"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/apiClient";
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

export default function FeaturedLayoutPanel({ items, onSaved }) {
  const featuredItems = useMemo(
    () => (items || []).filter((item) => item?.featured),
    [items]
  );

  const itemsById = useMemo(() => {
    const map = new Map();
    (items || []).forEach((item) => map.set(item.id, item));
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
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [hoveringIdx, setHoveringIdx] = useState(null);
  // Click-to-move fallback (touch screens, or browsers where native HTML5
  // drag is flaky): click a card to pick it up, click any cell to place it.
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Mirror of draggingIdx that drop handlers can trust even when the
  // browser hands us an empty dataTransfer (Safari does, intermittently).
  const draggingRef = useRef(null);

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
    setSelectedIdx(null);
  }, [initialSlots]);

  const slides = useMemo(() => chunkFeaturedSlots(slots), [slots]);
  const dirty = useMemo(() => !sameLayout(slots, initialSlots), [slots, initialSlots]);

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

  const handleDragStart = (event, flatIdx) => {
    setSelectedIdx(null);
    draggingRef.current = flatIdx;
    setDraggingIdx(flatIdx);
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      try {
        // Firefox refuses to start a drag without some payload.
        event.dataTransfer.setData("text/plain", String(flatIdx));
      } catch {}
    }
  };
  const handleDragEnd = () => {
    draggingRef.current = null;
    setDraggingIdx(null);
    setHoveringIdx(null);
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
    let sourceIdx = draggingRef.current;
    if (sourceIdx === null) {
      const raw = event?.dataTransfer?.getData("text/plain");
      const parsed = raw === "" || raw === null || raw === undefined ? NaN : Number(raw);
      sourceIdx = Number.isInteger(parsed) ? parsed : null;
    }
    draggingRef.current = null;
    setDraggingIdx(null);
    setHoveringIdx(null);
    if (sourceIdx === null) return;
    moveCard(sourceIdx, targetIdx);
  };

  const handleCellActivate = (flatIdx) => {
    if (draggingIdx !== null) return;
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

  const handleReset = () => {
    setSlots(initialSlots);
    setSelectedIdx(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const slotEntries = [];
      trimFeaturedSlots(slots).forEach((id, slot) => {
        if (isOccupied(id)) slotEntries.push({ id, slot });
      });
      await fetchJson(
        "/api/admin/projects/reorder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedIds: slotEntries.map((entry) => entry.id),
            slots: slotEntries,
          }),
        },
        { fallbackError: "Lưu thất bại" }
      );
      onSaved?.();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  if (featuredItems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 p-5 text-sm text-gray-500">
        Chưa có dự án nào được đánh dấu <strong>featured</strong>. Mở một dự án ở dưới
        và bật cờ <em>featured</em> để hiển thị trên grid trang chủ.
      </div>
    );
  }

  const pickingUp = selectedIdx !== null || draggingIdx !== null;

  return (
    <div className="rounded-2xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Bố cục Dự án nổi bật trang chủ</h2>
          <p className="mt-1 text-xs text-gray-600">
            Kéo thẻ thả vào ô bất kỳ — kể cả ô trống — để đổi vị trí; hoặc bấm chọn thẻ rồi
            bấm ô đích. Mỗi slide 6 ô — ô <strong>a, c</strong> là dọc (portrait), ô{" "}
            <strong>b, d, e, f</strong> là ngang (landscape); slide toàn video vuông dùng lưới
            3×2. Slide không có thẻ nào sẽ tự bị bỏ. Bấm <em>Lưu bố cục</em> để áp dụng.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={!dirty || saving}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Hoàn tác
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu bố cục"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
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
                  Slide {slideIndex + 1}
                </span>
                {isSpareSlide ? (
                  <span className="text-[11px] normal-case tracking-normal text-gray-400">
                    (trống — thả thẻ vào đây để thêm slide mới)
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
                  isSpareSlide && !pickingUp ? "opacity-50" : "",
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
                    draggingIdx !== null && hoveringIdx === flatIdx && draggingIdx !== flatIdx;
                  const shapeMismatch =
                    item && item.orientation && item.orientation !== cell.shape;

                  return (
                    <div
                      key={`${slideIndex}-${cell.key}`}
                      role="button"
                      tabIndex={0}
                      aria-label={
                        item
                          ? `Ô ${cell.key}: #${item.id} ${item.title || ""}`
                          : `Ô ${cell.key}: trống`
                      }
                      aria-pressed={isSelected}
                      style={cell.style}
                      className={[
                        "relative overflow-hidden rounded-xl text-white outline-none transition",
                        item
                          ? "border border-gray-200 bg-gray-900"
                          : "border-2 border-dashed border-gray-300 bg-gray-50",
                        !item && pickingUp ? "border-gray-500 bg-gray-100" : "",
                        isDropTarget ? "ring-2 ring-black" : "",
                        isSelected ? "ring-2 ring-amber-500 ring-offset-2" : "",
                        isDragging ? "opacity-40" : "",
                        "focus-visible:ring-2 focus-visible:ring-black",
                      ].join(" ")}
                      onDragOver={(event) => handleDragOver(event, flatIdx)}
                      onDrop={(event) => handleDrop(event, flatIdx)}
                      onClick={() => handleCellActivate(flatIdx)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleCellActivate(flatIdx);
                        } else if (event.key === "Escape" && selectedIdx !== null) {
                          setSelectedIdx(null);
                        }
                      }}
                    >
                      <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white">
                        {cell.label}
                      </span>
                      {item ? (
                        <div
                          draggable
                          onDragStart={(event) => handleDragStart(event, flatIdx)}
                          onDragEnd={handleDragEnd}
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
                              (chưa có media)
                            </div>
                          )}
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-2">
                            <div className="truncate text-xs font-semibold">
                              #{item.id} {item.title || "(No title)"}
                            </div>
                            {item.client ? (
                              <div className="truncate text-[10px] text-neutral-300">
                                {item.client}
                              </div>
                            ) : null}
                          </div>
                          {shapeMismatch ? (
                            <div className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-yellow-500/90 px-1.5 py-0.5 text-[10px] font-medium text-black">
                              shape lệch
                            </div>
                          ) : null}
                          {isSelected ? (
                            <div className="pointer-events-none absolute inset-x-0 top-8 z-10 text-center text-[10px] font-medium text-amber-300">
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
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
