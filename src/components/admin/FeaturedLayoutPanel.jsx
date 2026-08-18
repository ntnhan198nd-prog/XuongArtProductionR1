"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/apiClient";

const SLOT_KEYS = ["a", "b", "c", "d", "e", "f"];
const SLOT_SHAPES = {
  a: "portrait",
  b: "landscape",
  c: "portrait",
  d: "landscape",
  e: "landscape",
  f: "landscape",
};
const GRID_AREAS = '"a b b c d d" "a e e c f f"';
const SLOTS_PER_SLIDE = 6;

const isVideoUrl = (url = "") => /\.(mp4|webm|ogg|mov|avi)(\?|$)/i.test(url);

const compareByExistingOrder = (a, b) => {
  const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
  const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return Number(a.id) - Number(b.id);
};

export default function FeaturedLayoutPanel({ items, onSaved }) {
  const initialOrderedIds = useMemo(
    () =>
      [...(items || [])]
        .filter((item) => item.featured)
        .sort(compareByExistingOrder)
        .map((item) => item.id),
    [items]
  );

  const itemsById = useMemo(() => {
    const map = new Map();
    (items || []).forEach((item) => map.set(item.id, item));
    return map;
  }, [items]);

  const [orderedIds, setOrderedIds] = useState(initialOrderedIds);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [hoveringIdx, setHoveringIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setOrderedIds(initialOrderedIds);
  }, [initialOrderedIds]);

  const slides = useMemo(() => {
    const count = Math.max(1, Math.ceil(orderedIds.length / SLOTS_PER_SLIDE));
    return Array.from({ length: count }, (_, i) =>
      orderedIds.slice(i * SLOTS_PER_SLIDE, i * SLOTS_PER_SLIDE + SLOTS_PER_SLIDE)
    );
  }, [orderedIds]);

  const dirty = useMemo(() => {
    if (orderedIds.length !== initialOrderedIds.length) return true;
    return orderedIds.some((id, i) => id !== initialOrderedIds[i]);
  }, [orderedIds, initialOrderedIds]);

  const handleDragStart = (event, flatIdx) => {
    setDraggingIdx(flatIdx);
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(flatIdx));
    }
  };
  const handleDragEnd = () => {
    setDraggingIdx(null);
    setHoveringIdx(null);
  };
  const handleDragOver = (event, flatIdx) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    if (hoveringIdx !== flatIdx) setHoveringIdx(flatIdx);
  };
  const handleDrop = (event, targetIdx) => {
    event.preventDefault();
    const dataIdx = Number(event?.dataTransfer?.getData("text/plain"));
    const sourceIdx = Number.isFinite(dataIdx) && dataIdx >= 0 ? dataIdx : draggingIdx;
    setHoveringIdx(null);
    setDraggingIdx(null);
    if (sourceIdx == null || sourceIdx === targetIdx) return;
    if (targetIdx >= orderedIds.length || sourceIdx >= orderedIds.length) return;
    const next = [...orderedIds];
    [next[sourceIdx], next[targetIdx]] = [next[targetIdx], next[sourceIdx]];
    setOrderedIds(next);
  };

  const handleReset = () => setOrderedIds(initialOrderedIds);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await fetchJson(
        "/api/admin/projects/reorder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedIds }),
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

  if (initialOrderedIds.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 p-5 text-sm text-gray-500">
        Chưa có dự án nào được đánh dấu <strong>featured</strong>. Mở một dự án ở dưới
        và bật cờ <em>featured</em> để hiển thị trên grid trang chủ.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Bố cục Dự án nổi bật trang chủ</h2>
          <p className="mt-1 text-xs text-gray-600">
            Kéo thả thẻ để hoán đổi vị trí. Mỗi slide 6 ô — ô <strong>a, c</strong> là dọc
            (portrait), ô <strong>b, d, e, f</strong> là ngang (landscape). Bấm <em>Lưu bố cục</em> để áp dụng.
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
        {slides.map((slideIds, slideIndex) => (
          <div key={slideIndex}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Slide {slideIndex + 1}
              </span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: "1.35fr 1fr 1fr 1.35fr 1fr 1fr",
                gridTemplateRows: "repeat(2, minmax(120px, 1fr))",
                gridTemplateAreas: GRID_AREAS,
              }}
            >
              {SLOT_KEYS.map((slotKey, slotIdx) => {
                const flatIdx = slideIndex * SLOTS_PER_SLIDE + slotIdx;
                const id = slideIds[slotIdx];
                const item = id != null ? itemsById.get(id) : null;
                const shape = SLOT_SHAPES[slotKey];
                const url = item?.media?.url || "";
                const showVideo = url && isVideoUrl(url);
                const isDragging = draggingIdx === flatIdx;
                const isHovering = hoveringIdx === flatIdx;
                const shapeMismatch =
                  item && item.orientation && item.orientation !== shape;

                return (
                  <div
                    key={`${slideIndex}-${slotKey}`}
                    style={{ gridArea: slotKey }}
                    className={[
                      "relative overflow-hidden rounded-xl text-white transition",
                      item
                        ? "border border-gray-200 bg-gray-900"
                        : "border-2 border-dashed border-gray-300 bg-gray-50",
                      isHovering && draggingIdx != null && draggingIdx !== flatIdx
                        ? "ring-2 ring-black"
                        : "",
                      isDragging ? "opacity-40" : "",
                    ].join(" ")}
                    onDragOver={(event) => handleDragOver(event, flatIdx)}
                    onDrop={(event) => handleDrop(event, flatIdx)}
                  >
                    <span className="absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white">
                      {slotKey} · {shape === "portrait" ? "dọc" : "ngang"}
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
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-2">
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
                          <div className="absolute right-2 top-2 z-10 rounded bg-yellow-500/90 px-1.5 py-0.5 text-[10px] font-medium text-black">
                            shape lệch
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center text-gray-400">
                        <div className="text-[11px]">trống</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
