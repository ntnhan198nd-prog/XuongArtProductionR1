"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Container from "@/components/Container";
import HistoryPanel from "@/components/admin/HistoryPanel";
import ProjectsAdminPanel from "@/components/admin/ProjectsAdminPanel";
import SiteContentAdminPanel from "@/components/admin/SiteContentAdminPanel";
import { fetchJson, readJsonSafe } from "@/lib/apiClient";

// Tab order is fixed by the user's spec: "Nội dung trang" first, then video
// admin sections grouped by purpose. The "projects" key from the previous
// 2-tab layout is kept as a soft alias so old bookmarks (?tab=projects)
// land on the showreel+featured tab instead of 404-ing.
const MAIN_TABS = [
  { key: "content", label: "Nội dung trang" },
  { key: "showreel-featured", label: "Video Showreel + Nổi Bật" },
  { key: "other-videos", label: "Video Khác" },
  { key: "images", label: "Dự Án Ảnh" },
  { key: "history", label: "Lịch sử" },
];

const DEFAULT_TAB = "content";

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
  const router = useRouter();
  const searchParams = useSearchParams();

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

  // Sync the active tab with the ?tab= query param so direct links and
  // back/forward navigation both work. Default to "Nội dung trang" on mount.
  const tabFromUrl = searchParams?.get("tab");
  const initialTab = resolveTabKey(tabFromUrl) || DEFAULT_TAB;
  const [tab, setTab] = useState(initialTab);
  const [contentDirty, setContentDirty] = useState(false);
  // Per-panel "uploading or unsaved uploads" flags (see BUSY_PANEL_KEYS).
  const [panelBusy, setPanelBusy] = useState({});
  const busyHandlers = useMemo(
    () =>
      Object.fromEntries(
        BUSY_PANEL_KEYS.map((key) => [
          key,
          (busy) =>
            setPanelBusy((prev) =>
              Boolean(prev[key]) === Boolean(busy) ? prev : { ...prev, [key]: Boolean(busy) }
            ),
        ])
      ),
    []
  );
  const otherWorkPending = Object.values(panelBusy).some(Boolean);
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
      // No confirm needed when switching tabs — both panels stay mounted, so
      // unsaved edits in "Nội dung trang" are preserved when you come back.
      setTab(nextTab);
      const params = new URLSearchParams(searchParams?.toString() || "");
      if (nextTab === DEFAULT_TAB) params.delete("tab");
      else params.set("tab", nextTab);
      const qs = params.toString();
      router.replace(qs ? `/admin?${qs}` : "/admin");
    },
    [tab, router, searchParams]
  );

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

  // beforeunload: shell-level warning so it covers any tab with unsaved edits.
  useEffect(() => {
    if (!contentDirty) return undefined;
    const handler = (event) => {
      if (skipUnloadGuardRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [contentDirty]);

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

  const handleLogout = async () => {
    const pending = [
      contentDirty ? "nội dung trang chưa lưu" : null,
      otherWorkPending ? "video/ảnh đang tải lên hoặc đã tải lên nhưng chưa lưu" : null,
    ].filter(Boolean);
    if (
      pending.length > 0 &&
      !window.confirm(`Đang có ${pending.join(" và ")}. Đăng xuất sẽ mất các thay đổi này. Tiếp tục?`)
    ) {
      return;
    }
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Network hiccup: still drop to the login screen; the cookie expires
      // on its own and the next login overwrites it.
    }
    setAuthenticated(false);
    setContentDirty(false);
  };

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

  return (
    <main className="bg-white text-black">
      <Container className="py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Quản trị website</h1>
            <p className="mt-1 text-sm text-gray-600">
              Sửa video, hình ảnh và nội dung trên website.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Đăng xuất
            </button>
          </div>
        </div>

        {/* Five tabs: tighter padding on phones so the row fits 375px; the
            scroll wrapper only kicks in on even narrower screens. */}
        <div className="mt-6 overflow-x-auto">
        <div
          role="tablist"
          aria-label="Các mục quản trị"
          className="flex w-fit min-w-full gap-1 border-b border-gray-200 sm:gap-2"
        >
          {MAIN_TABS.map((item) => {
            const isActive = tab === item.key;
            const showDirtyDot = item.key === "content" && contentDirty;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => switchTab(item.key)}
                className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-sm font-medium transition-colors sm:px-4 ${
                  isActive
                    ? "border-black text-black"
                    : "border-transparent text-gray-600 hover:text-black"
                }`}
              >
                {item.label}
                {showDirtyDot ? (
                  <span
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"
                    aria-label="Có thay đổi chưa lưu"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        </div>

        <div className="mt-2">
          {visitedTabs.has("content") ? (
            <div hidden={tab !== "content"}>
              <SiteContentAdminPanel
                active={tab === "content"}
                onDirtyChange={setContentDirty}
              />
            </div>
          ) : null}
          {visitedTabs.has("showreel-featured") ? (
            <div hidden={tab !== "showreel-featured"}>
              <ProjectsAdminPanel
                mode="showreel-featured"
                onBusyChange={busyHandlers["showreel-featured"]}
              />
            </div>
          ) : null}
          {visitedTabs.has("other-videos") ? (
            <div hidden={tab !== "other-videos"}>
              <ProjectsAdminPanel
                mode="other-videos"
                onBusyChange={busyHandlers["other-videos"]}
              />
            </div>
          ) : null}
          {visitedTabs.has("images") ? (
            <div hidden={tab !== "images"}>
              <ProjectsAdminPanel mode="images" onBusyChange={busyHandlers.images} />
            </div>
          ) : null}
          {visitedTabs.has("history") ? (
            <div hidden={tab !== "history"}>
              <HistoryPanel
                active={tab === "history"}
                contentDirty={contentDirty}
                otherWorkPending={otherWorkPending}
                onRestored={reloadAfterRestore}
              />
            </div>
          ) : null}
        </div>
      </Container>
    </main>
  );
}
