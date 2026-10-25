"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Container from "@/components/Container";
import HistoryPanel from "@/components/admin/HistoryPanel";
import OverviewPanel from "@/components/admin/OverviewPanel";
import ProjectsAdminPanel from "@/components/admin/ProjectsAdminPanel";
import SiteContentAdminPanel from "@/components/admin/SiteContentAdminPanel";
import SystemHealthPanel from "@/components/admin/SystemHealthPanel";
import { ToastProvider } from "@/components/admin/ToastProvider";
import TrashPanel from "@/components/admin/TrashPanel";
import { fetchJson, readJsonSafe } from "@/lib/apiClient";

// Public pages linked from the header ("Xem website:"), opened in a new tab.
const SITE_LINKS = [
  { key: "home", href: "/", label: "Trang chủ" },
  { key: "videos", href: "/videos", label: "-động" },
  { key: "images", href: "/images", label: "-tĩnh" },
  { key: "about", href: "/whoweare", label: "Về chúng tôi" },
];

// Tab order: "Tổng quan" (what /admin opens on) first, then "Nội dung
// trang", the video / image sections grouped by purpose, and the
// maintenance tabs last. The "projects" key from the previous 2-tab layout
// is kept as a soft alias so old bookmarks (?tab=projects) land on the
// showreel+featured tab instead of 404-ing. `site` = the SITE_LINKS entry
// highlighted while the tab is open.
const MAIN_TABS = [
  { key: "overview", label: "Tổng quan", site: null },
  { key: "content", label: "Nội dung trang", site: "home" },
  { key: "showreel-featured", label: "Trang chủ: Showreel & Nổi bật", site: "home" },
  { key: "other-videos", label: "Thư viện video", site: "videos" },
  { key: "images", label: "Dự án ảnh", site: "images" },
  { key: "trash", label: "Thùng rác", site: null },
  { key: "history", label: "Lịch sử", site: null },
  { key: "system", label: "Hệ thống", site: null },
];

const DEFAULT_TAB = "overview";

// Per-visit URL params that belong to the tab they were opened with (e.g.
// edit=<id> from "Tổng quan" → "Mở"); dropped when switching tabs.
const TRANSIENT_PARAMS = ["edit"];

// Panels that report unsaved edits through onDirtyChange.
const DIRTY_PANEL_KEYS = ["content", "showreel-featured", "other-videos", "images"];
// Panels that can have uploads in flight / unsaved uploads. They report it
// through onBusyChange so the history tab can warn before a restore reloads
// the page (and kills that work).
const BUSY_PANEL_KEYS = ["showreel-featured", "other-videos", "images"];

// After a history restore the page reloads; if it is still alive after this
// long, another panel's "leave site?" prompt was answered with Stay.
const RELOAD_FALLBACK_MS = 3000;

const LEGACY_TAB_ALIASES = {
  projects: "showreel-featured",
};

// Per-panel boolean flag setter (dirty / busy); keeps the same state object
// when nothing changed so re-reports do not re-render the shell.
function flagSetter(setState, key) {
  return (value) =>
    setState((prev) =>
      Boolean(prev[key]) === Boolean(value) ? prev : { ...prev, [key]: Boolean(value) }
    );
}

// "có thay đổi chưa lưu" / "có file đang tải lên hoặc chưa lưu" / both.
// A plain save in progress reports dirty + busy, so the combined wording
// must not claim that a file is uploading.
function describePending({ dirty, busy }) {
  if (dirty && busy) return "có thay đổi hoặc file chưa lưu xong";
  if (busy) return "có file đang tải lên hoặc chưa lưu";
  if (dirty) return "có thay đổi chưa lưu";
  return "";
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function isValidTab(key) {
  return MAIN_TABS.some((t) => t.key === key);
}

function resolveTabKey(rawKey) {
  if (!rawKey) return null;
  const aliased = LEGACY_TAB_ALIASES[rawKey] || rawKey;
  return isValidTab(aliased) ? aliased : null;
}

// Show/hide password toggle icon (inline so the login screen needs no icon
// package). `crossed` = password currently visible → offer "hide".
function EyeIcon({ crossed = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

export default function AdminPage() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Bumped after a failed login; the effect below selects the password so
  // the owner can retype it straight away (runs after the input re-enables).
  const [selectPasswordToken, setSelectPasswordToken] = useState(0);
  const passwordInputRef = useRef(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        // Lenient parse: an empty/HTML body must not throw here, it just
        // means "not authenticated" from the UI's point of view.
        const payload = await readJsonSafe(response);
        setAuthenticated(Boolean(payload?.authenticated));
      } catch {
        setAuthenticated(false);
      } finally {
        setCheckingSession(false);
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    if (!selectPasswordToken) return;
    const input = passwordInputRef.current;
    if (input && !input.disabled) {
      input.focus();
      input.select();
    }
  }, [selectPasswordToken]);

  const handleLogin = async (event) => {
    event.preventDefault();
    if (loggingIn) return;
    setLoginError("");
    setLoggingIn(true);
    try {
      await fetchJson(
        "/api/admin/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: loginPassword }),
        },
        { fallbackError: "Đăng nhập thất bại" }
      );
      setAuthenticated(true);
      setLoginPassword("");
      setShowPassword(false);
    } catch (loginErr) {
      // A wrong password answers 401 {error:"Sai mật khẩu."} and a lockout
      // 429 {error:"Bạn nhập sai quá nhiều lần…"} — those server messages
      // win over the generic status hints.
      setLoginError(loginErr.message);
      setSelectPasswordToken((n) => n + 1);
    } finally {
      setLoggingIn(false);
    }
  };

  // Stable so the workspace's logout handler never goes stale.
  const handleLoggedOut = useCallback(() => setAuthenticated(false), []);

  if (checkingSession) {
    return (
      <main className="bg-white text-black">
        <Container className="py-20">
          <p className="text-sm text-gray-600">Đang kiểm tra phiên đăng nhập…</p>
        </Container>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="bg-white text-black">
        <Container className="py-20">
          <div className="mx-auto max-w-md rounded-2xl border border-gray-200 p-6">
            <h1 className="text-2xl font-semibold">Đăng nhập quản trị</h1>
            <p className="mt-2 text-sm text-gray-600">
              Đăng nhập để sửa video, hình ảnh và nội dung trên website.
            </p>

            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div>
                <label htmlFor="admin-password" className="mb-2 block text-sm font-medium">
                  Mật khẩu
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    ref={passwordInputRef}
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    autoFocus
                    value={loginPassword}
                    onChange={(event) => {
                      setLoginPassword(event.target.value);
                      if (loginError) setLoginError("");
                    }}
                    disabled={loggingIn}
                    aria-invalid={loginError ? true : undefined}
                    aria-describedby={loginError ? "admin-login-error" : undefined}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-11 text-sm text-black focus:border-black focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Nhập mật khẩu quản trị"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    disabled={loggingIn}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-gray-500 hover:text-black disabled:opacity-40"
                  >
                    <EyeIcon crossed={showPassword} />
                  </button>
                </div>
              </div>

              {loginError ? (
                <p id="admin-login-error" role="alert" className="text-sm text-red-600">
                  {loginError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loggingIn}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loggingIn ? "Đang đăng nhập…" : "Đăng nhập"}
              </button>
            </form>
          </div>
        </Container>
      </main>
    );
  }

  // The workspace only exists while logged in: logging out unmounts every
  // panel, which also clears their dirty / busy reports.
  return (
    <ToastProvider>
      <AdminWorkspace onLoggedOut={handleLoggedOut} />
    </ToastProvider>
  );
}

function AdminWorkspace({ onLoggedOut }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Sync the active tab with the ?tab= query param so direct links and
  // back/forward navigation both work. Default to "Tổng quan" on mount.
  const tabFromUrl = searchParams?.get("tab");
  const initialTab = resolveTabKey(tabFromUrl) || DEFAULT_TAB;
  const [tab, setTab] = useState(initialTab);

  // Per-panel flags: unsaved edits (onDirtyChange, see DIRTY_PANEL_KEYS) and
  // uploads in flight / unsaved uploads (onBusyChange, see BUSY_PANEL_KEYS).
  const [dirtyByTab, setDirtyByTab] = useState({});
  const [panelBusy, setPanelBusy] = useState({});
  const dirtyHandlers = useMemo(
    () => Object.fromEntries(DIRTY_PANEL_KEYS.map((key) => [key, flagSetter(setDirtyByTab, key)])),
    []
  );
  const busyHandlers = useMemo(
    () => Object.fromEntries(BUSY_PANEL_KEYS.map((key) => [key, flagSetter(setPanelBusy, key)])),
    []
  );
  // Tabs with work that a reload / logout would lose, in tab order.
  const pendingTabs = MAIN_TABS.map((item) => ({
    ...item,
    dirty: Boolean(dirtyByTab[item.key]),
    busy: Boolean(panelBusy[item.key]),
  })).filter((item) => item.dirty || item.busy);
  const pendingByKey = Object.fromEntries(pendingTabs.map((item) => [item.key, item]));
  const anyPending = pendingTabs.length > 0;
  const contentDirty = Boolean(dirtyByTab.content);
  const otherPendingLabels = pendingTabs
    .filter((item) => item.key !== "content")
    .map((item) => item.label);

  // Lazy-mount each panel on first visit, then keep it mounted (just hidden)
  // so internal state — form drafts, active block, scroll position — survives
  // tab switches.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([initialTab]));
  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set([...prev, tab])));
  }, [tab]);

  // If the URL changes (e.g. /admin-content redirected here, or back nav),
  // pick that up.
  useEffect(() => {
    const next = resolveTabKey(searchParams?.get("tab"));
    if (next && next !== tab) {
      setTab(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const switchTab = useCallback(
    (nextTab) => {
      if (nextTab === tab) return;
      // No confirm needed when switching tabs — every panel stays mounted, so
      // unsaved edits are preserved when you come back.
      setTab(nextTab);
      const params = new URLSearchParams(searchParams?.toString() || "");
      TRANSIENT_PARAMS.forEach((name) => params.delete(name));
      if (nextTab === DEFAULT_TAB) params.delete("tab");
      else params.set("tab", nextTab);
      const qs = params.toString();
      router.replace(qs ? `/admin?${qs}` : "/admin");
    },
    [tab, router, searchParams]
  );

  // Tab buttons by key (tab row below; also used to restore focus).
  const tabRefs = useRef({});
  // The button that triggered openTab sits in the panel being hidden: when
  // focus is lost that way (on <body> or on an element no longer rendered),
  // move it to the new tab's button. Focus a panel already moved elsewhere
  // (e.g. the projects form opened by ?edit=) is left alone.
  const focusTabButton = useCallback((nextTab, { preventScroll = false } = {}) => {
    const run = () => {
      const current = typeof document !== "undefined" ? document.activeElement : null;
      const lost =
        !current ||
        current === document.body ||
        (typeof current.getClientRects === "function" && current.getClientRects().length === 0);
      if (lost) tabRefs.current[nextTab]?.focus({ preventScroll });
    };
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(run);
    } else {
      run();
    }
  }, []);
  // Used by "Tổng quan": open a tab, optionally with a record to edit
  // (/admin?tab=<tab>&edit=<id>; the projects panel opens that record and
  // then removes the edit param itself).
  const openTab = useCallback(
    (nextTab, { edit } = {}) => {
      if (!isValidTab(nextTab)) return;
      const hasEdit = edit !== null && edit !== undefined && String(edit) !== "";
      if (!hasEdit) {
        switchTab(nextTab);
        focusTabButton(nextTab);
        return;
      }
      setTab(nextTab);
      const params = new URLSearchParams(searchParams?.toString() || "");
      TRANSIENT_PARAMS.forEach((name) => params.delete(name));
      params.set("tab", nextTab);
      params.set("edit", String(edit));
      router.replace(`/admin?${params.toString()}`);
      // The panel scrolls to the record itself: don't fight it.
      focusTabButton(nextTab, { preventScroll: true });
    },
    [switchTab, focusTabButton, router, searchParams]
  );

  // Set right before the reload that follows a history restore: the admin
  // already confirmed that unsaved edits will be lost, so don't ask again.
  const skipUnloadGuardRef = useRef(false);
  const reloadAfterRestore = useCallback(() => {
    skipUnloadGuardRef.current = true;
    window.location.reload();
    // Still here a moment later = another panel's unload prompt was
    // answered with "Stay": turn our own guard back on.
    setTimeout(() => {
      skipUnloadGuardRef.current = false;
    }, RELOAD_FALLBACK_MS);
  }, []);

  // beforeunload: shell-level warning for unsaved edits or uploads in any tab.
  useEffect(() => {
    if (!anyPending) return undefined;
    const handler = (event) => {
      if (skipUnloadGuardRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyPending]);

  // Logging out unmounts the panels FIRST (they render "Đang đăng xuất…"),
  // so their unmount cleanups — e.g. deleting uploaded-but-unsaved files —
  // are sent while the session cookie is still valid; only then is the
  // logout request made (effect below).
  const [loggingOut, setLoggingOut] = useState(false);
  const handleLogout = () => {
    if (loggingOut) return;
    if (pendingTabs.length > 0) {
      const lines = pendingTabs.map((item) => `• “${item.label}” — ${describePending(item)}`);
      const ok = window.confirm(
        `Các thẻ sau còn việc chưa xong:\n${lines.join("\n")}\n\nĐăng xuất bây giờ sẽ mất những thay đổi này. Vẫn đăng xuất?`
      );
      if (!ok) return;
    }
    setLoggingOut(true);
  };
  useEffect(() => {
    if (!loggingOut) return undefined;
    let cancelled = false;
    // Next tick: the panels' unmount cleanups have already started their
    // requests (cookies are attached when a request starts).
    const timer = setTimeout(async () => {
      try {
        await fetch("/api/admin/logout", { method: "POST" });
      } catch {
        // Network hiccup: still drop to the login screen; the cookie expires
        // on its own and the next login overwrites it.
      }
      if (!cancelled) onLoggedOut();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loggingOut, onLoggedOut]);

  // Tab row: scrolls sideways on narrow screens. Fades on the edges show
  // that more tabs are hidden; the active tab is kept in view.
  const tabScrollerRef = useRef(null);
  const tabListRef = useRef(null);
  const [tabEdges, setTabEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const scroller = tabScrollerRef.current;
    if (!scroller) return undefined;
    const update = () => {
      const left = scroller.scrollLeft > 1;
      const right = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
      setTabEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // Tabs get wider when an "unsaved" dot appears.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    if (observer && tabListRef.current) observer.observe(tabListRef.current);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const scroller = tabScrollerRef.current;
    const node = tabRefs.current[tab];
    if (!scroller || !node || scroller.scrollWidth <= scroller.clientWidth) return;
    // Horizontal only (scrollIntoView could also move the page vertically).
    const box = scroller.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    const margin = 32; // clear the edge fade
    let delta = 0;
    if (rect.left < box.left + margin) delta = rect.left - box.left - margin;
    else if (rect.right > box.right - margin) delta = rect.right - box.right + margin;
    if (delta === 0) return;
    if (typeof scroller.scrollBy === "function") {
      scroller.scrollBy({ left: delta, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    } else {
      scroller.scrollLeft += delta;
    }
  }, [tab]);

  // Arrow keys / Home / End move between tabs (standard tab-list keys).
  const handleTabKeyDown = (event, index) => {
    let nextIndex = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % MAIN_TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + MAIN_TABS.length) % MAIN_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = MAIN_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextKey = MAIN_TABS[nextIndex].key;
    switchTab(nextKey);
    tabRefs.current[nextKey]?.focus();
  };

  const activeSite = MAIN_TABS.find((item) => item.key === tab)?.site || null;

  // Hidden-but-mounted panel wrapper (see visitedTabs).
  const panel = (key, children) =>
    visitedTabs.has(key) ? (
      <div
        key={key}
        role="tabpanel"
        id={`admin-panel-${key}`}
        aria-labelledby={`admin-tab-${key}`}
        hidden={tab !== key}
      >
        {children}
      </div>
    ) : null;

  if (loggingOut) {
    return (
      <main className="w-full flex-auto bg-white text-black">
        <Container className="py-20">
          <p role="status" className="text-sm text-gray-600">
            Đang đăng xuất…
          </p>
        </Container>
      </main>
    );
  }

  return (
    <main className="w-full flex-auto bg-white text-black">
      <Container className="py-6 sm:py-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold sm:text-3xl">Quản trị website</h1>
            <p className="mt-1 text-sm text-gray-600">
              Sửa video, hình ảnh và nội dung trên website.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 sm:px-4"
          >
            Đăng xuất
          </button>
        </div>

        <nav
          aria-label="Xem website"
          className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2"
        >
          <span className="text-xs font-medium text-gray-500 sm:text-sm">Xem website:</span>
          <div className="flex flex-wrap items-center gap-1">
            {SITE_LINKS.map((link) => {
              const emphasised = link.key === activeSite;
              return (
                <a
                  key={link.key}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  title={`Mở trang ${link.label} trong tab mới`}
                  className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors sm:text-sm ${
                    emphasised
                      ? "border-black bg-black text-white hover:bg-gray-800"
                      : "border-gray-300 text-gray-700 hover:border-gray-500 hover:text-black"
                  }`}
                >
                  {link.label}
                  <span aria-hidden="true">↗</span>
                  <span className="sr-only"> (mở tab mới)</span>
                </a>
              );
            })}
          </div>
        </nav>

        <div className="relative mt-5">
          <div
            ref={tabScrollerRef}
            className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div
              ref={tabListRef}
              role="tablist"
              aria-label="Các mục quản trị"
              className="flex w-max min-w-full gap-1 border-b border-gray-200 sm:gap-2"
            >
              {MAIN_TABS.map((item, index) => {
                const isActive = tab === item.key;
                const pending = pendingByKey[item.key];
                const pendingText = pending ? capitalize(describePending(pending)) : "";
                return (
                  <button
                    key={item.key}
                    ref={(node) => {
                      tabRefs.current[item.key] = node;
                    }}
                    id={`admin-tab-${item.key}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={visitedTabs.has(item.key) ? `admin-panel-${item.key}` : undefined}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => switchTab(item.key)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                    className={`relative -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black sm:px-4 ${
                      isActive
                        ? "border-black text-black"
                        : "border-transparent text-gray-600 hover:text-black"
                    }`}
                  >
                    {item.label}
                    {pending ? (
                      <span
                        role="img"
                        aria-label={pendingText}
                        title={pendingText}
                        className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500 motion-reduce:animate-none"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
          {tabEdges.left ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent"
            />
          ) : null}
          {tabEdges.right ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent"
            />
          ) : null}
        </div>

        <div className="mt-2">
          {panel(
            "overview",
            <OverviewPanel
              active={tab === "overview"}
              onOpenTab={openTab}
              pendingTabLabels={pendingTabs.map((item) => item.label)}
            />
          )}
          {panel(
            "content",
            <SiteContentAdminPanel
              active={tab === "content"}
              onDirtyChange={dirtyHandlers.content}
            />
          )}
          {BUSY_PANEL_KEYS.map((mode) =>
            panel(
              mode,
              <ProjectsAdminPanel
                mode={mode}
                active={tab === mode}
                onBusyChange={busyHandlers[mode]}
                onDirtyChange={dirtyHandlers[mode]}
              />
            )
          )}
          {panel("trash", <TrashPanel active={tab === "trash"} />)}
          {panel(
            "history",
            <HistoryPanel
              active={tab === "history"}
              contentDirty={contentDirty}
              otherWorkPending={otherPendingLabels.length > 0}
              pendingTabLabels={otherPendingLabels}
              onRestored={reloadAfterRestore}
            />
          )}
          {panel("system", <SystemHealthPanel active={tab === "system"} />)}
        </div>
      </Container>
    </main>
  );
}
