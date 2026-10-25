"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/apiClient";
import { formatRelativeVi, formatVnDateTime } from "@/lib/contentHistory";
import { formatBytes, formatClockDuration } from "@/lib/uploadClient";

// Admin "Tổng quan" tab (the tab /admin opens on): what is on the website
// right now, what needs attention, and shortcuts to the other tabs. Data
// comes from GET /api/admin/overview (one read of the content store) and is
// refetched every time the tab is opened again.
//
// onOpenTab(tabKey, params?) is provided by the admin shell; params.edit
// opens that record in the tab's form (/admin?tab=…&edit=<id>).

const ISSUES_VISIBLE = 8;

const TAB_KIND_LABELS = {
  "showreel-featured": "Video nổi bật",
  "other-videos": "Video",
  images: "Dự án ảnh",
};

const ISSUE_REASONS = {
  "no-showreel": () => "Trang chủ chưa có showreel.",
  "no-media": () => "Chưa có file video chính — video này chưa phát được trên website.",
  "image-no-media": () => "Chưa có ảnh nào — dự án này đang trống trên trang Ảnh.",
  "slug-collision": (issue) =>
    issue.tab === "images"
      ? `Trùng đường dẫn “${issue.slug}” với “${issue.otherTitle || `#${issue.otherId}`}”.`
      : `Trùng đường dẫn xuongart.com/videos/${issue.slug} với “${
          issue.otherTitle || `#${issue.otherId}`
        }” — trang chi tiết của video này không mở được.`,
  "featured-no-preview": () =>
    "Chưa có bản WebM nhẹ — lưới trang chủ phải dùng video gốc (tải chậm hơn).",
  "no-thumbnail": () => "Chưa có ảnh đại diện (thumbnail).",
};

// Plain-language reason for one issue from GET /api/admin/overview.
export function describeIssue(issue) {
  const reason = ISSUE_REASONS[issue?.type];
  return reason ? reason(issue) : "Cần kiểm tra lại.";
}

// One row per record (a video can have several issues), in the order the
// server ranked them (most serious first).
export function groupIssues(issues) {
  const groups = [];
  const byKey = new Map();
  for (const issue of Array.isArray(issues) ? issues : []) {
    if (!issue || typeof issue !== "object") continue;
    const key = issue.id === null || issue.id === undefined ? `type:${issue.type}` : `${issue.tab}:${issue.id}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        id: issue.id ?? null,
        tab: issue.tab,
        title: issue.title || "",
        kind: issue.type === "no-showreel" ? "Showreel" : TAB_KIND_LABELS[issue.tab] || "",
        reasons: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.reasons.push(describeIssue(issue));
  }
  return groups;
}

function recordName(title, id, fallback) {
  const text = typeof title === "string" ? title.trim() : "";
  if (text) return text;
  return id !== null && id !== undefined ? `${fallback} #${id}` : fallback;
}

function ErrorBox({ message, hint, children }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p className="break-words">{message}</p>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-red-800">💡 {hint}</p> : null}
      {children}
    </div>
  );
}

function StatCard({ label, value, note, onClick, title }) {
  if (typeof onClick !== "function") {
    return (
      <div className="flex min-w-0 flex-col items-start rounded-xl border border-gray-200 p-4 text-left">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="mt-1 text-2xl font-semibold tabular-nums text-black">{value}</span>
        {note ? <span className="mt-0.5 text-xs text-gray-500">{note}</span> : null}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex min-w-0 flex-col items-start rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
    >
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <span className="mt-1 text-2xl font-semibold tabular-nums text-black">{value}</span>
      {note ? <span className="mt-0.5 text-xs text-gray-500">{note}</span> : null}
    </button>
  );
}

const smallButton =
  "shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50";

export default function OverviewPanel({ active = true, onOpenTab, pendingTabLabels = [] }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJson(
        "/api/admin/overview",
        { cache: "no-store" },
        { fallbackError: "Không tải được tổng quan" }
      );
      if (requestIdRef.current !== requestId) return;
      setData(payload);
      setNow(Date.now());
    } catch (loadError) {
      if (requestIdRef.current !== requestId) return;
      setError({ message: loadError.message, hint: loadError.hint || "" });
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  // Fetch on first open and every time the tab is opened again: saves in
  // the other tabs change the numbers while this panel stays mounted.
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  // Keep "5 phút trước" labels fresh while the tab is visible.
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, [active]);

  const openTab = (tabKey, params) => {
    if (typeof onOpenTab === "function") onOpenTab(tabKey, params);
  };

  const counts = data?.counts || {};
  const grid = data?.featuredGrid || {};
  const showreel = data?.showreel || null;
  const groups = groupIssues(data?.issues);
  const visibleGroups = showAllIssues ? groups : groups.slice(0, ISSUES_VISIBLE);
  const hiddenGroups = groups.length - visibleGroups.length;
  const recent = Array.isArray(data?.recent) ? data.recent : [];
  const pending = Array.isArray(pendingTabLabels) ? pendingTabLabels.filter(Boolean) : [];

  const showreelParts = [];
  if (showreel?.present) {
    const duration = formatClockDuration(showreel.duration);
    const size = showreel.sizeBytes ? formatBytes(showreel.sizeBytes) : "";
    if (duration) showreelParts.push(duration);
    if (size) showreelParts.push(size);
    if (showreel.updatedAt) showreelParts.push(`cập nhật ${formatRelativeVi(showreel.updatedAt, now)}`);
  }

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tổng quan</h2>
          <p className="mt-1 text-sm text-gray-600">
            Website đang có gì, việc gì cần làm, và lối tắt tới các thẻ khác.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} className={`${smallButton} self-start`}>
          {loading && data ? "Đang cập nhật…" : "Làm mới"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openTab("other-videos")}
          className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Thêm video
        </button>
        <button
          type="button"
          onClick={() => openTab("images")}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          + Thêm dự án ảnh
        </button>
        <button
          type="button"
          onClick={() => openTab("content")}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Sửa nội dung trang
        </button>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Xem website <span aria-hidden="true">↗</span>
          <span className="sr-only"> (mở tab mới)</span>
        </a>
      </div>

      {pending.length > 0 ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Còn thay đổi chưa lưu ở: {pending.map((label) => `“${label}”`).join(", ")}. Số liệu
          bên dưới là nội dung đã lưu.
        </div>
      ) : null}

      {error ? (
        <ErrorBox message={error.message} hint={error.hint}>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="mt-2 rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {loading ? "Đang thử lại…" : "Thử lại"}
          </button>
        </ErrorBox>
      ) : null}

      {!data && loading ? (
        <p role="status" className="text-sm text-gray-500">
          Đang tải tổng quan…
        </p>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Video"
              value={counts.videos ?? 0}
              note={`gồm ${counts.featured ?? 0} nổi bật · ${counts.otherVideos ?? 0} video khác`}
            />
            <StatCard
              label="Nổi bật"
              value={`${grid.used ?? 0}/${grid.cells ?? 0}`}
              note={
                grid.cells
                  ? `ô lưới trang chủ · ${grid.slides} trang`
                  : "chưa có video nổi bật"
              }
              onClick={() => openTab("showreel-featured")}
              title="Mở Trang chủ: Showreel & Nổi bật"
            />
            <StatCard
              label="Video khác"
              value={counts.otherVideos ?? 0}
              note="trong thư viện video"
              onClick={() => openTab("other-videos")}
              title="Mở Thư viện video"
            />
            <StatCard
              label="Dự án ảnh"
              value={counts.imageProjects ?? 0}
              note="trên trang Ảnh"
              onClick={() => openTab("images")}
              title="Mở Dự án ảnh"
            />
            <StatCard
              label="Thùng rác"
              value={counts.trash ?? 0}
              note="mục trong thùng rác"
              onClick={() => openTab("trash")}
              title="Mở Thùng rác"
            />
          </div>

          <div className="space-y-1.5 rounded-xl border border-gray-200 p-4 text-sm text-gray-700">
            <p>
              Lưu lần cuối:{" "}
              {data.storeUpdatedAt ? (
                <>
                  <span className="font-medium text-black">
                    {formatRelativeVi(data.storeUpdatedAt, now)}
                  </span>{" "}
                  <span className="text-gray-500">({formatVnDateTime(data.storeUpdatedAt)})</span>
                </>
              ) : (
                <span className="text-gray-500">chưa có lần lưu nào</span>
              )}
            </p>
            <p className="break-words">
              Showreel:{" "}
              {showreel?.present ? (
                <>
                  <span className="font-medium text-black">{showreel.name}</span>
                  {showreelParts.length > 0 ? (
                    <span className="text-gray-500"> · {showreelParts.join(" · ")}</span>
                  ) : null}
                </>
              ) : (
                <span className="font-medium text-amber-700">chưa có</span>
              )}
            </p>
            <p>
              Nội dung trang:{" "}
              <span className="text-gray-600">
                {data.siteCustomized ? "đã chỉnh sửa" : "đang dùng nội dung mặc định"}
              </span>
            </p>
          </div>

          <section aria-labelledby="overview-issues-title">
            <h3 id="overview-issues-title" className="text-base font-semibold">
              Cần xử lý
              {groups.length > 0 ? (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-medium text-amber-800">
                  {groups.length}
                </span>
              ) : null}
            </h3>
            {groups.length === 0 ? (
              <p className="mt-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Không có gì cần xử lý ✓
              </p>
            ) : (
              <>
                <ul className="mt-2 space-y-2">
                  {visibleGroups.map((group) => (
                    <li
                      key={group.key}
                      className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-gray-900">
                          <span aria-hidden="true" className="mr-1.5 text-amber-600">
                            ⚠
                          </span>
                          {group.id === null ? (
                            group.kind
                          ) : (
                            <>
                              <span className="text-gray-500">{group.kind}: </span>
                              {recordName(group.title, group.id, group.kind)}
                            </>
                          )}
                        </p>
                        <ul className="mt-0.5 space-y-0.5 text-xs text-gray-600">
                          {group.reasons.map((reason) => (
                            <li key={reason} className="break-words">
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          openTab(group.tab, group.id === null ? undefined : { edit: group.id })
                        }
                        className={`${smallButton} self-start`}
                        aria-label={`Mở ${recordName(group.title, group.id, group.kind)}`}
                      >
                        Mở
                      </button>
                    </li>
                  ))}
                </ul>
                {hiddenGroups > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllIssues(true)}
                    className="mt-2 text-sm text-gray-700 underline underline-offset-2 hover:text-black"
                  >
                    Xem thêm {hiddenGroups} mục
                  </button>
                ) : null}
              </>
            )}
          </section>

          <section aria-labelledby="overview-recent-title">
            <h3 id="overview-recent-title" className="text-base font-semibold">
              Gần đây
            </h3>
            {recent.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Chưa có video hay dự án ảnh nào.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200">
                {recent.map((item) => {
                  const kind = item.kind === "image" ? "Dự án ảnh" : "Video";
                  const name = recordName(item.title, item.id, kind);
                  return (
                    <li
                      key={`${item.kind}:${item.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-900">{name}</p>
                        <p className="text-xs text-gray-500">
                          {kind} · {formatRelativeVi(item.updatedAt, now)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openTab(item.tab, { edit: item.id })}
                        className={smallButton}
                        aria-label={`Mở ${name}`}
                      >
                        Mở
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
