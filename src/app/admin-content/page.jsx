"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Container from "@/components/Container";

const BLOCKS = [
  { key: "hero", label: "Hero / Showreel banner" },
  { key: "intro", label: "Manifesto trang chủ" },
  { key: "featuredHeader", label: "Header Dự án nổi bật" },
  { key: "stats", label: "Stats trang chủ" },
  { key: "clients", label: "Khách hàng (marquee)" },
  { key: "services", label: "Dịch vụ" },
  { key: "cta", label: "CTA & Liên hệ (banner đen)" },
  { key: "about", label: "Trang Who We Are" },
  { key: "cultures", label: "Văn hoá" },
  { key: "footer", label: "Footer" },
  { key: "social", label: "Mạng xã hội" },
];

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-black focus:outline-none";
const labelCls = "block text-xs font-semibold uppercase tracking-wider text-gray-600";

function TextField({ label, value, onChange, multiline = false, rows = 3, placeholder }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {multiline ? (
        <textarea
          className={`${inputCls} mt-1.5`}
          value={value ?? ""}
          rows={rows}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={`${inputCls} mt-1.5`}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function NumberField({ label, value, onChange, step = 1, placeholder }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input
        type="number"
        className={`${inputCls} mt-1.5`}
        value={value ?? ""}
        step={step}
        placeholder={placeholder}
        onChange={(event) => {
          const v = event.target.value;
          onChange(v === "" ? "" : Number(v));
        }}
      />
    </label>
  );
}

function ItemList({ title, items, onChange, renderItem, emptyItem, addLabel = "Thêm dòng" }) {
  const update = (idx, next) => {
    const copy = [...(items || [])];
    copy[idx] = next;
    onChange(copy);
  };
  const remove = (idx) => onChange((items || []).filter((_, i) => i !== idx));
  const move = (idx, dir) => {
    const copy = [...(items || [])];
    const target = idx + dir;
    if (target < 0 || target >= copy.length) return;
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    onChange(copy);
  };
  const add = () => onChange([...(items || []), structuredClone(emptyItem)]);

  return (
    <div className="space-y-3">
      {title ? (
        <div className="flex items-center justify-between">
          <span className={labelCls}>{title}</span>
          <span className="text-xs text-gray-500">{(items || []).length} mục</span>
        </div>
      ) : null}
      {(items || []).map((item, idx) => (
        <div key={idx} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">#{idx + 1}</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === (items || []).length - 1}
                className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-40"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
              >
                Xoá
              </button>
            </div>
          </div>
          {renderItem(item, (next) => update(idx, next))}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
      >
        + {addLabel}
      </button>
    </div>
  );
}

function HeroBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TextField label="Showreel label (góc phải)" value={value.showreelLabel} onChange={(v) => set("showreelLabel", v)} />
      <TextField label="Tagline (chữ nhỏ trên heading)" value={value.tagline} onChange={(v) => set("tagline", v)} />
      <TextField label="Heading — phần thường" value={value.headingMain} onChange={(v) => set("headingMain", v)} />
      <TextField label="Heading — phần highlight (màu cam)" value={value.headingAccent} onChange={(v) => set("headingAccent", v)} />
      <div className="lg:col-span-2">
        <TextField label="Description (bên phải)" value={value.description} onChange={(v) => set("description", v)} multiline rows={2} />
      </div>
      <TextField label="Scroll hint (link cuộn xuống)" value={value.scrollHint} onChange={(v) => set("scrollHint", v)} />
    </div>
  );
}

function IntroBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Heading — phần thường" value={value.headingMain} onChange={(v) => set("headingMain", v)} />
        <TextField label="Heading — phần highlight (màu cam)" value={value.headingAccent} onChange={(v) => set("headingAccent", v)} />
      </div>
      <TextField label="Đoạn mô tả" value={value.description} onChange={(v) => set("description", v)} multiline rows={3} />
    </div>
  );
}

function FeaturedHeaderBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <TextField label="Eyebrow" value={value.eyebrow} onChange={(v) => set("eyebrow", v)} />
      <TextField label="Heading — phần thường" value={value.headingMain} onChange={(v) => set("headingMain", v)} />
      <TextField label="Heading — phần highlight" value={value.headingAccent} onChange={(v) => set("headingAccent", v)} />
    </div>
  );
}

function StatsBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Eyebrow" value={value.eyebrow} onChange={(v) => set("eyebrow", v)} />
        <TextField label="Heading" value={value.heading} onChange={(v) => set("heading", v)} />
      </div>
      <ItemList
        title="Các chỉ số (đếm tăng từ 0)"
        items={value.items}
        onChange={(items) => set("items", items)}
        emptyItem={{ value: 0, suffix: "", label: "", decimals: 0 }}
        renderItem={(item, update) => (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumberField label="Giá trị" value={item.value} onChange={(v) => update({ ...item, value: v })} step={0.1} />
            <TextField label="Suffix" value={item.suffix} onChange={(v) => update({ ...item, suffix: v })} placeholder="+ / M / %" />
            <NumberField label="Decimals" value={item.decimals} onChange={(v) => update({ ...item, decimals: v })} />
            <TextField label="Label" value={item.label} onChange={(v) => update({ ...item, label: v })} />
          </div>
        )}
      />
    </div>
  );
}

function ClientsBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <TextField label="Heading" value={value.heading} onChange={(v) => set("heading", v)} multiline rows={2} />
      <ItemList
        title="Tên thương hiệu"
        items={value.brands}
        onChange={(brands) => set("brands", brands)}
        emptyItem=""
        addLabel="Thêm thương hiệu"
        renderItem={(item, update) => (
          <input
            value={item}
            onChange={(event) => update(event.target.value)}
            className={inputCls}
            placeholder="Tên thương hiệu"
          />
        )}
      />
    </div>
  );
}

function ServicesBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Eyebrow" value={value.eyebrow} onChange={(v) => set("eyebrow", v)} />
        <TextField label="Tagline (italic dưới heading)" value={value.tagline} onChange={(v) => set("tagline", v)} />
        <TextField label="Heading — phần thường" value={value.headingMain} onChange={(v) => set("headingMain", v)} multiline rows={2} />
        <TextField label="Heading — phần highlight" value={value.headingAccent} onChange={(v) => set("headingAccent", v)} />
      </div>
      <ItemList
        title="Danh sách dịch vụ"
        items={value.items}
        onChange={(items) => set("items", items)}
        emptyItem={{ title: "", description: "" }}
        addLabel="Thêm dịch vụ"
        renderItem={(item, update) => (
          <div className="space-y-2">
            <TextField label="Tiêu đề" value={item.title} onChange={(v) => update({ ...item, title: v })} />
            <TextField label="Mô tả" value={item.description} onChange={(v) => update({ ...item, description: v })} multiline rows={2} />
          </div>
        )}
      />
    </div>
  );
}

function CtaBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TextField label="Heading lớn" value={value.heading} onChange={(v) => set("heading", v)} multiline rows={2} />
      <TextField label="Text nút CTA" value={value.buttonText} onChange={(v) => set("buttonText", v)} />
      <TextField label="Heading nhỏ — Thông tin liên hệ" value={value.contactsHeading} onChange={(v) => set("contactsHeading", v)} />
      <TextField label="Tên office" value={value.officeName} onChange={(v) => set("officeName", v)} />
      <div className="lg:col-span-2">
        <TextField label="Địa chỉ" value={value.address} onChange={(v) => set("address", v)} />
      </div>
      <TextField label="Phone" value={value.phone} onChange={(v) => set("phone", v)} />
      <TextField label="Email" value={value.email} onChange={(v) => set("email", v)} />
    </div>
  );
}

function AboutBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Eyebrow" value={value.eyebrow} onChange={(v) => set("eyebrow", v)} />
        <TextField label="Title" value={value.title} onChange={(v) => set("title", v)} />
      </div>
      <TextField label="Đoạn mở đầu (lead)" value={value.lead} onChange={(v) => set("lead", v)} multiline rows={3} />
      <ItemList
        title="Các đoạn bổ sung"
        items={value.paragraphs}
        onChange={(paragraphs) => set("paragraphs", paragraphs)}
        emptyItem=""
        addLabel="Thêm đoạn"
        renderItem={(item, update) => (
          <textarea
            value={item}
            onChange={(event) => update(event.target.value)}
            className={inputCls}
            rows={3}
          />
        )}
      />
      <ItemList
        title="3 ô số liệu"
        items={value.stats}
        onChange={(stats) => set("stats", stats)}
        emptyItem={{ value: "", label: "" }}
        addLabel="Thêm số liệu"
        renderItem={(item, update) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label="Giá trị (text)" value={item.value} onChange={(v) => update({ ...item, value: v })} />
            <TextField label="Label" value={item.label} onChange={(v) => update({ ...item, label: v })} />
          </div>
        )}
      />
    </div>
  );
}

function CulturesBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Eyebrow" value={value.eyebrow} onChange={(v) => set("eyebrow", v)} />
        <TextField label="Title" value={value.title} onChange={(v) => set("title", v)} />
      </div>
      <TextField label="Mô tả" value={value.description} onChange={(v) => set("description", v)} multiline rows={2} />
      <ItemList
        title="Giá trị văn hoá"
        items={value.items}
        onChange={(items) => set("items", items)}
        emptyItem={{ title: "", description: "" }}
        addLabel="Thêm giá trị"
        renderItem={(item, update) => (
          <div className="space-y-2">
            <TextField label="Tiêu đề" value={item.title} onChange={(v) => update({ ...item, title: v })} />
            <TextField label="Mô tả" value={item.description} onChange={(v) => update({ ...item, description: v })} multiline rows={2} />
          </div>
        )}
      />
    </div>
  );
}

function FooterBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TextField label="Heading footer" value={value.heading} onChange={(v) => set("heading", v)} />
      <TextField label="Email" value={value.email} onChange={(v) => set("email", v)} />
      <TextField label="Phone" value={value.phone} onChange={(v) => set("phone", v)} />
      <TextField label="Tên copyright" value={value.copyright} onChange={(v) => set("copyright", v)} />
    </div>
  );
}

function SocialBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TextField label="Facebook URL" value={value.facebook} onChange={(v) => set("facebook", v)} placeholder="https://..." />
      <TextField label="Instagram URL" value={value.instagram} onChange={(v) => set("instagram", v)} placeholder="https://..." />
      <TextField label="TikTok URL" value={value.tiktok} onChange={(v) => set("tiktok", v)} placeholder="https://..." />
      <TextField label="Zalo URL" value={value.zalo} onChange={(v) => set("zalo", v)} placeholder="https://zalo.me/..." />
    </div>
  );
}

const BLOCK_RENDERERS = {
  hero: HeroBlock,
  intro: IntroBlock,
  featuredHeader: FeaturedHeaderBlock,
  stats: StatsBlock,
  clients: ClientsBlock,
  services: ServicesBlock,
  cta: CtaBlock,
  about: AboutBlock,
  cultures: CulturesBlock,
  footer: FooterBlock,
  social: SocialBlock,
};

export default function AdminContentPage() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [content, setContent] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [original, setOriginal] = useState(null);
  const [activeBlock, setActiveBlock] = useState(BLOCKS[0].key);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  const dirty = useMemo(() => {
    if (!content || !original) return false;
    return JSON.stringify(content) !== JSON.stringify(original);
  }, [content, original]);

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/site-content", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load content.");
      setContent(payload.data);
      setOriginal(payload.data);
      setDefaults(payload.defaults);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        const payload = await response.json();
        setAuthenticated(Boolean(payload?.authenticated));
      } catch {
        setAuthenticated(false);
      } finally {
        setCheckingSession(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (authenticated) loadContent();
  }, [authenticated, loadContent]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: loginPassword }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Login failed.");
      setAuthenticated(true);
      setLoginPassword("");
    } catch (e) {
      setLoginError(e.message);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setContent(null);
    setOriginal(null);
  };

  const handleSave = async () => {
    if (!content) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Save failed.");
      setContent(payload.data);
      setOriginal(payload.data);
      setSavedAt(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetBlock = () => {
    if (!defaults || !content) return;
    if (!window.confirm(`Khôi phục mặc định cho block "${activeBlock}"?`)) return;
    setContent({ ...content, [activeBlock]: structuredClone(defaults[activeBlock]) });
  };

  const handleResetAll = () => {
    if (!defaults) return;
    if (!window.confirm("Khôi phục mặc định cho TẤT CẢ block? (chưa lưu)")) return;
    setContent(structuredClone(defaults));
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
            <h1 className="text-2xl font-semibold">Site Content Admin</h1>
            <p className="mt-2 text-sm text-gray-600">
              Đăng nhập để chỉnh sửa nội dung tĩnh trên website.
            </p>
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  className={inputCls}
                  placeholder="ADMIN_PASSWORD"
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

  if (loading || !content) {
    return (
      <main className="bg-white text-black">
        <Container className="py-20">
          <p className="text-sm text-gray-600">Đang tải nội dung...</p>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </Container>
      </main>
    );
  }

  const ActiveRenderer = BLOCK_RENDERERS[activeBlock];

  return (
    <main className="bg-white text-black">
      <Container className="py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Site Content Admin</h1>
            <p className="mt-1 text-sm text-gray-600">
              Chỉnh sửa nội dung tĩnh trên website. Riêng dự án &amp; showreel quản
              lý ở <a href="/admin" className="underline">/admin</a>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {savedAt ? (
              <span className="text-xs text-gray-500">
                Đã lưu lúc {savedAt.toLocaleTimeString()}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleResetAll}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              Reset tất cả
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="rounded-lg bg-black px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : dirty ? "Lưu thay đổi" : "Đã lưu"}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              Logout
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
          <aside>
            <nav className="sticky top-6 flex flex-col gap-1 rounded-2xl border border-gray-200 p-2">
              {BLOCKS.map((block) => (
                <button
                  key={block.key}
                  type="button"
                  onClick={() => setActiveBlock(block.key)}
                  className={`rounded-lg px-3 py-2 text-left text-sm transition ${
                    activeBlock === block.key
                      ? "bg-black text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {block.label}
                </button>
              ))}
            </nav>
          </aside>

          <section className="rounded-2xl border border-gray-200 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {BLOCKS.find((b) => b.key === activeBlock)?.label || activeBlock}
              </h2>
              <button
                type="button"
                onClick={handleResetBlock}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50"
              >
                Reset block
              </button>
            </div>
            {ActiveRenderer ? (
              <ActiveRenderer
                value={content[activeBlock]}
                onChange={(next) => setContent({ ...content, [activeBlock]: next })}
              />
            ) : (
              <p className="text-sm text-gray-500">Block chưa có editor.</p>
            )}
          </section>
        </div>
      </Container>
    </main>
  );
}
