"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Container from "@/components/Container";
import ProjectsAdminPanel from "@/components/admin/ProjectsAdminPanel";
import SiteContentAdminPanel from "@/components/admin/SiteContentAdminPanel";
import { fetchJson, readJsonSafe } from "@/lib/apiClient";

// Tab order is fixed by the user's spec: Site Content first, then video
// admin sections grouped by purpose. The "projects" key from the previous
// 2-tab layout is kept as a soft alias so old bookmarks (?tab=projects)
// land on the showreel+featured tab instead of 404-ing.
const MAIN_TABS = [
  { key: "content", label: "Site Content" },
  { key: "showreel-featured", label: "Video Showreel + Nổi Bật" },
  { key: "other-videos", label: "Video Khác" },
  { key: "images", label: "Dự Án Ảnh" },
];

const DEFAULT_TAB = "content";

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

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Sync the active tab with the ?tab= query param so direct links and
  // back/forward navigation both work. Default to Site Content on mount.
  const tabFromUrl = searchParams?.get("tab");
  const initialTab = resolveTabKey(tabFromUrl) || DEFAULT_TAB;
  const [tab, setTab] = useState(initialTab);
  const [contentDirty, setContentDirty] = useState(false);
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
      // unsaved edits in Site Content are preserved when you come back.
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

  // beforeunload: shell-level warning so it covers any tab with unsaved edits.
  useEffect(() => {
    if (!contentDirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [contentDirty]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError("");
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
    } catch (loginErr) {
      // A wrong password answers 401 {error:"Invalid credentials."} — that
      // server message wins over the generic "session expired" status hint.
      setLoginError(loginErr.message);
    }
  };

  const handleLogout = async () => {
    if (
      contentDirty &&
      !window.confirm("Có thay đổi Site Content chưa lưu. Logout sẽ mất. Tiếp tục?")
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
          <p className="text-sm text-gray-600">Checking admin session...</p>
        </Container>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="bg-white text-black">
        <Container className="py-20">
          <div className="mx-auto max-w-md rounded-2xl border border-gray-200 p-6">
            <h1 className="text-2xl font-semibold">Admin Login</h1>
            <p className="mt-2 text-sm text-gray-600">
              Đăng nhập để quản lý dự án, showreel và nội dung tĩnh trên website.
            </p>

            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
                  placeholder="Nhập ADMIN_PASSWORD"
                  required
                />
              </div>

              {loginError ? <p className="text-sm text-red-600">{loginError}</p> : null}

              <button
                type="submit"
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Login
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
            <h1 className="text-3xl font-semibold">Admin</h1>
            <p className="mt-1 text-sm text-gray-600">
              Quản lý dự án, showreel và nội dung tĩnh trên website.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Logout
            </button>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Admin sections"
          className="mt-6 flex gap-2 border-b border-gray-200"
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
                className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
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

        <div className="mt-2">
          {visitedTabs.has("content") ? (
            <div hidden={tab !== "content"}>
              <SiteContentAdminPanel onDirtyChange={setContentDirty} />
            </div>
          ) : null}
          {visitedTabs.has("showreel-featured") ? (
            <div hidden={tab !== "showreel-featured"}>
              <ProjectsAdminPanel mode="showreel-featured" />
            </div>
          ) : null}
          {visitedTabs.has("other-videos") ? (
            <div hidden={tab !== "other-videos"}>
              <ProjectsAdminPanel mode="other-videos" />
            </div>
          ) : null}
          {visitedTabs.has("images") ? (
            <div hidden={tab !== "images"}>
              <ProjectsAdminPanel mode="images" />
            </div>
          ) : null}
        </div>
      </Container>
    </main>
  );
}
