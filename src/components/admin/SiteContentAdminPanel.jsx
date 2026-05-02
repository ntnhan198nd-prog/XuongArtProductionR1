"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const URL_REGEX = /^https?:\/\/[^\s]+$/i;
// Loose validators — only require a recognizable pattern is *present* anywhere
// in the value. Lets the user keep decorative prefixes (emojis, icons) without
// the form constantly flagging them as invalid.
const EMAIL_PRESENCE_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/;

// BLOCKS grouped by which page they primarily drive. The sidebar
// renders a header for each group so editors don't have to remember
// which block belongs where.
const BLOCKS = [
  { key: "hero", label: "Hero / Showreel banner", group: "Trang chủ" },
  { key: "featuredHeader", label: "Header Dự án nổi bật", group: "Trang chủ" },
  { key: "stats", label: "Stats — Why us", group: "Trang chủ" },
  { key: "clients", label: "Khách hàng (marquee)", group: "Trang chủ" },
  { key: "intro", label: "Manifesto cuối trang", group: "Trang chủ" },

  { key: "about", label: "PageIntro + Stats", group: "Trang /whoweare" },
  { key: "cultures", label: "Văn hoá", group: "Trang /whoweare" },
  { key: "services", label: "Dịch vụ", group: "Trang /whoweare" },
  { key: "cta", label: "CTA banner + Footer trang chủ", group: "Trang /whoweare" },

  { key: "portfolio", label: "Bộ lọc tìm kiếm theo category", group: "Trang /videos + /images" },

  { key: "gallery", label: "Gallery — Preload mode (A/B test)", group: "Hiệu năng" },

  { key: "footer", label: "Footer · Copyright", group: "Footer + Global" },
  { key: "social", label: "Mạng xã hội (footer + CTA)", group: "Footer + Global" },
  { key: "ui", label: "UI · Loading text", group: "Footer + Global" },
];

// Build the ordered list of groups, preserving the order they first
// appear in BLOCKS. Used by the sidebar to print group headers.
const BLOCK_GROUPS = BLOCKS.reduce((acc, block) => {
  if (!acc.includes(block.group)) acc.push(block.group);
  return acc;
}, []);

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-black focus:outline-none";
const labelCls = "block text-xs font-semibold uppercase tracking-wider text-gray-600";

function validate(value, validateAs) {
  if (!validateAs) return null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (validateAs === "url" && !URL_REGEX.test(text)) {
    return "URL phải bắt đầu bằng http:// hoặc https://";
  }
  if (validateAs === "email" && !EMAIL_PRESENCE_REGEX.test(text)) {
    return "Cần có địa chỉ email hợp lệ trong ô này";
  }
  if (validateAs === "tel") {
    const digits = text.replace(/\D/g, "");
    if (digits.length < 6) {
      return "Cần có ít nhất 6 chữ số";
    }
  }
  return null;
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
  rows = 3,
  placeholder,
  validateAs,
  hint,
}) {
  const error = validate(value, validateAs);
  const errorCls = error
    ? "border-red-400 focus:border-red-500"
    : "border-gray-300 focus:border-black";
  const finalCls = `w-full rounded-lg border ${errorCls} px-3 py-2 text-sm text-black focus:outline-none mt-1.5`;
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {multiline ? (
        <textarea
          className={finalCls}
          value={value ?? ""}
          rows={rows}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={finalCls}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-gray-500">{hint}</span>
      ) : null}
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

async function uploadImageToR2(file, folder = "brands") {
  const contentType = file.type || "image/png";
  // Step 1 — same-origin presign request
  let presignRes;
  try {
    presignRes = await fetch("/api/admin/r2/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        filename: file.name,
        contentType,
        folder,
      }),
    });
  } catch (networkErr) {
    throw new Error(`Không gọi được presign API: ${networkErr.message}`);
  }
  let presignPayload;
  try {
    presignPayload = await presignRes.json();
  } catch {
    throw new Error(
      `Presign API trả về dữ liệu không phải JSON (status ${presignRes.status}).`
    );
  }
  if (!presignRes.ok) {
    throw new Error(
      presignPayload?.error || `Presign API lỗi ${presignRes.status}.`
    );
  }
  const { key, uploadUrl, publicUrl } = presignPayload.data || {};
  if (!uploadUrl) throw new Error("Server không trả về upload URL.");

  // Step 2 — PUT direct to R2 via XHR (matches the existing project upload flow
  // so CORS handling is identical to what's already working).
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 upload thất bại (HTTP ${xhr.status}).`));
      }
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Không kết nối được R2 (kiểm tra CORS bucket cho phép PUT từ origin này)."
        )
      );
    xhr.onabort = () => reject(new Error("Upload bị hủy."));
    xhr.send(file);
  });

  return { url: publicUrl, key };
}

function BrandLogoSlot({ idx, value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState("");
  const safe = value || { alt: "", logoUrl: "", logoKey: "" };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      setLocalError("Chỉ chấp nhận file ảnh.");
      return;
    }
    setLocalError("");
    setUploading(true);
    try {
      const result = await uploadImageToR2(file, "brands");
      onChange({ ...safe, logoUrl: result.url, logoKey: result.key });
    } catch (e) {
      setLocalError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
          Brand #{idx + 1}
        </span>
        {safe.logoUrl ? (
          <button
            type="button"
            onClick={() => onChange({ ...safe, logoUrl: "", logoKey: "" })}
            className="text-xs text-red-600 hover:underline"
          >
            Xoá logo
          </button>
        ) : null}
      </div>
      <div className="flex aspect-[25/7] w-full items-center justify-center overflow-hidden rounded-lg bg-neutral-950">
        {safe.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safe.logoUrl}
            alt={safe.alt || `Brand ${idx + 1}`}
            className="max-h-full max-w-full object-contain p-3"
          />
        ) : (
          <span className="text-xs text-gray-500">
            {safe.alt ? `(text) ${safe.alt}` : "Chưa có logo"}
          </span>
        )}
      </div>
      <input
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={(event) => handleFile(event.target.files?.[0])}
        className="block w-full text-xs file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-white hover:file:bg-gray-800 disabled:opacity-50"
      />
      {uploading ? (
        <p className="text-xs text-gray-500">Đang tải lên…</p>
      ) : localError ? (
        <p className="text-xs text-red-600">{localError}</p>
      ) : null}
      <input
        type="text"
        value={safe.alt || ""}
        onChange={(event) => onChange({ ...safe, alt: event.target.value })}
        placeholder="Tên thương hiệu (alt text / fallback)"
        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-black focus:border-black focus:outline-none"
      />
    </div>
  );
}

function ClientsBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const strategic = Array.isArray(value.strategicBrands)
    ? value.strategicBrands
    : [];
  const emptySlot = { alt: "", logoUrl: "", logoKey: "" };
  const setStrategicSlot = (idx, slot) => {
    const next = [...strategic];
    while (next.length < 5) next.push({ ...emptySlot });
    next[idx] = slot;
    onChange({ ...value, strategicBrands: next.slice(0, 5) });
  };
  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Cụm 1 — Đối tác chiến lược</span>
          <span className="text-xs text-gray-500">
            5 logo · gợi ý 800×224px
          </span>
        </div>
        <TextField
          label="Heading cụm 1"
          value={value.strategicHeading}
          onChange={(v) => set("strategicHeading", v)}
          placeholder="vd: Đối tác chiến lược"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3, 4].map((idx) => (
            <BrandLogoSlot
              key={idx}
              idx={idx}
              value={strategic[idx] || emptySlot}
              onChange={(slot) => setStrategicSlot(idx, slot)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Cụm 2 — Marquee chạy liên tục</span>
          <span className="text-xs text-gray-500">Danh sách các brand còn lại</span>
        </div>
        <TextField
          label="Heading cụm 2"
          value={value.marqueeHeading}
          onChange={(v) => set("marqueeHeading", v)}
          multiline
          rows={2}
          placeholder="vd: Và các thương hiệu, đối tác sáng tạo đã đồng hành"
        />
        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
          <span className="flex flex-col">
            <span className="text-sm font-medium text-gray-900">
              Hiển thị chấm phân tách giữa các brand
            </span>
            <span className="text-xs text-gray-500">
              Bật để hiện chấm vàng giữa các brand trong marquee
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={value.marqueeShowDots !== false}
            onClick={() => set("marqueeShowDots", value.marqueeShowDots === false)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              value.marqueeShowDots !== false ? "bg-black" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                value.marqueeShowDots !== false ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
        <ItemList
          title="Tên thương hiệu trong marquee"
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
    </div>
  );
}

function ImageUploadField({
  label,
  hint,
  value,
  onChange,
  folder = "uploads",
  previewAspect = "1/1",
  altPlaceholder = "Mô tả ảnh (alt text)",
}) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState("");
  const safe = value || { url: "", key: "", alt: "" };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      setLocalError("Chỉ chấp nhận file ảnh.");
      return;
    }
    setLocalError("");
    setUploading(true);
    try {
      const result = await uploadImageToR2(file, folder);
      onChange({ ...safe, url: result.url, key: result.key });
    } catch (e) {
      setLocalError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
            {label}
          </span>
          {hint ? (
            <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
          ) : null}
        </div>
        {safe.url ? (
          <button
            type="button"
            onClick={() => onChange({ ...safe, url: "", key: "" })}
            className="text-xs text-red-600 hover:underline"
          >
            Xoá ảnh
          </button>
        ) : null}
      </div>
      <div
        className="flex w-full items-center justify-center overflow-hidden rounded-lg bg-neutral-100"
        style={{ aspectRatio: previewAspect }}
      >
        {safe.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safe.url}
            alt={safe.alt || ""}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs text-gray-500">Chưa có ảnh</span>
        )}
      </div>
      <input
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={(event) => handleFile(event.target.files?.[0])}
        className="block w-full text-xs file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-white hover:file:bg-gray-800 disabled:opacity-50"
      />
      {uploading ? (
        <p className="text-xs text-gray-500">Đang tải lên…</p>
      ) : localError ? (
        <p className="text-xs text-red-600">{localError}</p>
      ) : null}
      <input
        type="text"
        value={safe.alt || ""}
        onChange={(event) => onChange({ ...safe, alt: event.target.value })}
        placeholder={altPlaceholder}
        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-black focus:border-black focus:outline-none"
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
      <ImageUploadField
        label="Ảnh minh họa (cột trái — mask SVG)"
        hint="Tỉ lệ ~1:1 (gần vuông). Gợi ý: 1400×1320px hoặc lớn hơn. Ảnh tự động được chuyển grayscale và mask theo hình dạng SVG. Để trống nếu muốn dùng ảnh mặc định."
        value={value.image}
        onChange={(img) => set("image", img)}
        folder="services"
        previewAspect="719/680"
        altPlaceholder="Mô tả ảnh (a11y) — ví dụ: Quay phim trong studio"
      />
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
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
        <p className="font-semibold uppercase tracking-wider text-gray-700">
          Hai nơi dùng chung dữ liệu này
        </p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium">CTA banner đen ở /whoweare</span> —
            dùng đầy đủ Heading lớn + nút CTA + Heading nhỏ + office/địa
            chỉ/phone/email.
          </li>
          <li>
            <span className="font-medium">Footer trang chủ (nền đen)</span> —
            chỉ dùng <em>Tên office, Địa chỉ, Phone, Email</em>. Heading lớn
            và nút CTA không hiển thị ở đây.
          </li>
        </ul>
        <p className="mt-1.5">
          Copyright &ldquo;© XUONGART Inc. 2026&rdquo; sửa ở block{" "}
          <span className="font-medium">Footer · Copyright</span>; icon
          mạng xã hội ở block <span className="font-medium">Mạng xã hội</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Heading lớn (chỉ /whoweare)" value={value.heading} onChange={(v) => set("heading", v)} multiline rows={2} />
        <TextField label="Text nút CTA (chỉ /whoweare)" value={value.buttonText} onChange={(v) => set("buttonText", v)} placeholder="vd: Liên hệ ngay" />
        <TextField label="Heading nhỏ — Thông tin liên hệ (chỉ /whoweare)" value={value.contactsHeading} onChange={(v) => set("contactsHeading", v)} />
        <TextField label="Tên office (footer + /whoweare)" value={value.officeName} onChange={(v) => set("officeName", v)} />
        <div className="lg:col-span-2">
          <TextField label="Địa chỉ (footer + /whoweare)" value={value.address} onChange={(v) => set("address", v)} />
        </div>
        <TextField label="Phone (footer + /whoweare)" value={value.phone} onChange={(v) => set("phone", v)} validateAs="tel" placeholder="vd: +84 988 888 888" />
        <TextField label="Email (footer + /whoweare)" value={value.email} onChange={(v) => set("email", v)} validateAs="email" placeholder="vd: hello@xuongart.com" />
      </div>
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
      <TextField label="Email" value={value.email} onChange={(v) => set("email", v)} validateAs="email" />
      <TextField label="Phone" value={value.phone} onChange={(v) => set("phone", v)} validateAs="tel" />
      <TextField label="Tên copyright" value={value.copyright} onChange={(v) => set("copyright", v)} />
    </div>
  );
}

function SocialBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TextField label="Facebook URL" value={value.facebook} onChange={(v) => set("facebook", v)} placeholder="https://facebook.com/..." validateAs="url" />
      <TextField label="Instagram URL" value={value.instagram} onChange={(v) => set("instagram", v)} placeholder="https://instagram.com/..." validateAs="url" />
      <TextField label="TikTok URL" value={value.tiktok} onChange={(v) => set("tiktok", v)} placeholder="https://tiktok.com/@..." validateAs="url" />
      <TextField label="Zalo URL" value={value.zalo} onChange={(v) => set("zalo", v)} placeholder="https://zalo.me/..." validateAs="url" />
    </div>
  );
}

function UiBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-4">
      <TextField
        label="Văn bản loading dự án"
        value={value.loadingProjectsText}
        onChange={(v) => set("loadingProjectsText", v)}
        placeholder="vd: Đang tải dự án..."
        hint="Hiển thị trên trang Portfolio (-động), trang chi tiết dự án, trang ảnh (-tĩnh), và khối Featured trang chủ trong khi đang fetch dữ liệu."
      />
    </div>
  );
}

function PortfolioBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
        <p className="font-semibold uppercase tracking-wider text-gray-700">
          Bộ lọc trong nút search ở 2 trang gallery
        </p>
        <p className="mt-1.5">
          Mỗi trang dùng danh sách riêng. Chỉ category liệt kê ở đây mới hiện
          trong dropdown của ô search — các tag khác trên thẻ vẫn click được
          như thường.
        </p>
        <p className="mt-1.5">
          Để trống một danh sách → trang đó fallback sang gom tự động từ tất cả
          dự án (hành vi cũ).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className={labelCls}>Trang /portfolio (-động · video)</span>
          </div>
          <ItemList
            title="Danh sách category"
            items={value.searchCategories}
            onChange={(items) => set("searchCategories", items)}
            emptyItem=""
            addLabel="Thêm category"
            renderItem={(item, update) => (
              <input
                value={item}
                onChange={(event) => update(event.target.value)}
                className={inputCls}
                placeholder="vd: TVC, Commercial, MV..."
              />
            )}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className={labelCls}>Trang /images (-tĩnh · hình ảnh)</span>
          </div>
          <ItemList
            title="Danh sách category"
            items={value.imageSearchCategories}
            onChange={(items) => set("imageSearchCategories", items)}
            emptyItem=""
            addLabel="Thêm category"
            renderItem={(item, update) => (
              <input
                value={item}
                onChange={(event) => update(event.target.value)}
                className={inputCls}
                placeholder="vd: Fashion, Product, Event..."
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}

function GalleryBlock({ value, onChange }) {
  const safe = value || { preloadMode: "lazy" };
  const set = (k, v) => onChange({ ...safe, [k]: v });
  const options = [
    {
      key: "lazy",
      title: "Lazy (mặc định)",
      desc:
        "Chỉ preload + decode/play 12 video khi user lướt tới gallery. Tiết kiệm băng thông & CPU cho user không bao giờ scroll xuống.",
    },
    {
      key: "modeA",
      title: "Mode A — Cache-only preload",
      desc:
        "Inject <link rel=preload> ngay khi page mount để 12 video xuống cache song song với showreel. Decode/play vẫn chỉ kick in khi user lướt tới (gallery instant ready, không tốn CPU ngầm).",
    },
    {
      key: "modeB",
      title: "Mode B — Full eager play",
      desc:
        "Như Mode A + flip eagerLoad ngay lúc mount → 12 video decode/autoplay ngầm trong khi user xem showreel. Zero-latency khi scroll tới gallery, nhưng tốn CPU/battery.",
    },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
        <p className="font-semibold uppercase tracking-wider text-gray-700">
          A/B test — Hiệu năng preload trang chủ
        </p>
        <p className="mt-1.5">
          Đổi cách 12 video Dự án nổi bật được tải. Sau khi save, hard-reload
          trang (Cmd/Ctrl+Shift+R) và mở DevTools &gt; Network &gt; lọc Media
          để so sánh thời điểm các video bắt đầu request, hoặc Performance để
          đo CPU.
        </p>
      </div>
      <div className="space-y-3">
        {options.map((opt) => {
          const isActive = safe.preloadMode === opt.key;
          return (
            <label
              key={opt.key}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                isActive
                  ? "border-black bg-gray-50"
                  : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <input
                type="radio"
                name="gallery-preload-mode"
                value={opt.key}
                checked={isActive}
                onChange={() => set("preloadMode", opt.key)}
                className="mt-1 shrink-0"
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">
                  {opt.title}
                </div>
                <div className="mt-1 text-xs text-gray-600">{opt.desc}</div>
              </div>
            </label>
          );
        })}
      </div>
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
  ui: UiBlock,
  portfolio: PortfolioBlock,
  gallery: GalleryBlock,
};

export default function SiteContentAdminPanel({ onDirtyChange }) {
  const [content, setContent] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [original, setOriginal] = useState(null);
  const [activeBlock, setActiveBlock] = useState(BLOCKS[0].key);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  const dirtyByBlock = useMemo(() => {
    if (!content || !original) return {};
    const result = {};
    for (const block of BLOCKS) {
      const a = JSON.stringify(content[block.key] ?? null);
      const b = JSON.stringify(original[block.key] ?? null);
      result[block.key] = a !== b;
    }
    return result;
  }, [content, original]);

  const dirty = useMemo(
    () => Object.values(dirtyByBlock).some(Boolean),
    [dirtyByBlock]
  );

  // Notify the shell so it can warn when switching main tabs while unsaved.
  useEffect(() => {
    if (typeof onDirtyChange === "function") onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const dirtyCount = useMemo(
    () => Object.values(dirtyByBlock).filter(Boolean).length,
    [dirtyByBlock]
  );

  const activeBlockLabel = useMemo(
    () => BLOCKS.find((b) => b.key === activeBlock)?.label || activeBlock,
    [activeBlock]
  );

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
    loadContent();
  }, [loadContent]);

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
    if (!window.confirm(`Khôi phục mặc định cho "${activeBlockLabel}"?`)) return;
    setContent({ ...content, [activeBlock]: structuredClone(defaults[activeBlock]) });
  };

  const handleResetAll = () => {
    if (!defaults) return;
    if (!window.confirm("Khôi phục mặc định cho TẤT CẢ block? (chưa lưu)")) return;
    setContent(structuredClone(defaults));
  };

  const handleDiscardBlock = () => {
    if (!original || !content) return;
    if (!dirtyByBlock[activeBlock]) return;
    if (!window.confirm(`Hủy thay đổi chưa lưu của "${activeBlockLabel}"?`)) return;
    setContent({ ...content, [activeBlock]: structuredClone(original[activeBlock]) });
  };

  const handleDiscardAll = () => {
    if (!original || !dirty) return;
    if (!window.confirm("Hủy TẤT CẢ thay đổi chưa lưu?")) return;
    setContent(structuredClone(original));
  };

  useEffect(() => {
    const handler = (event) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
      if (ctrlKey && (event.key === "s" || event.key === "S")) {
        event.preventDefault();
        if (dirty && !saving) handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving, content]);

  if (loading || !content) {
    return (
      <div className="py-10">
        <p className="text-sm text-gray-600">Đang tải nội dung...</p>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
    );
  }

  const ActiveRenderer = BLOCK_RENDERERS[activeBlock];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <AnimatePresence mode="wait" initial={false}>
          {dirty ? (
            <motion.span
              key="dirty"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.18 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              {dirtyCount} block chưa lưu
            </motion.span>
          ) : savedAt ? (
            <motion.span
              key="saved"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-gray-500"
            >
              ✓ Đã lưu lúc {savedAt.toLocaleTimeString()}
            </motion.span>
          ) : null}
        </AnimatePresence>
        <button
          type="button"
          onClick={handleDiscardAll}
          disabled={!dirty}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          title="Hủy TẤT CẢ thay đổi chưa lưu (về last saved)"
        >
          Hủy thay đổi
        </button>
        <button
          type="button"
          onClick={handleResetAll}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
          title="Reset TẤT CẢ block về giá trị mặc định"
        >
          Reset mặc định
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded-lg bg-black px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          title="⌘/Ctrl + S"
        >
          {saving ? "Đang lưu..." : dirty ? "Lưu thay đổi" : "Đã lưu"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <aside>
          <div className="lg:hidden">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">
              Chọn block
            </label>
            <select
              value={activeBlock}
              onChange={(event) => setActiveBlock(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
            >
              {BLOCK_GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {BLOCKS.filter((block) => block.group === group).map((block) => (
                    <option key={block.key} value={block.key}>
                      {dirtyByBlock[block.key] ? "● " : ""}
                      {block.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <nav className="sticky top-6 hidden flex-col rounded-2xl border border-gray-200 p-2 lg:flex">
            {BLOCK_GROUPS.map((group, groupIdx) => (
              <div key={group} className={groupIdx > 0 ? "mt-3" : ""}>
                <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  {group}
                </div>
                <div className="flex flex-col gap-1">
                  {BLOCKS.filter((block) => block.group === group).map((block) => {
                    const isActive = activeBlock === block.key;
                    const isDirty = dirtyByBlock[block.key];
                    return (
                      <button
                        key={block.key}
                        type="button"
                        onClick={() => setActiveBlock(block.key)}
                        className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                          isActive
                            ? "bg-black text-white"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <span className="truncate">{block.label}</span>
                        {isDirty ? (
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              isActive ? "bg-amber-300" : "bg-amber-500"
                            }`}
                            title="Có thay đổi chưa lưu"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <section className="rounded-2xl border border-gray-200 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{activeBlockLabel}</h2>
              {dirtyByBlock[activeBlock] ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  chưa lưu
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDiscardBlock}
                disabled={!dirtyByBlock[activeBlock]}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="Hủy thay đổi chưa lưu của block này"
              >
                Hủy thay đổi
              </button>
              <button
                type="button"
                onClick={handleResetBlock}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50"
                title="Reset block này về giá trị mặc định"
              >
                Reset mặc định
              </button>
            </div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeBlock}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            >
              {ActiveRenderer ? (
                <ActiveRenderer
                  value={content[activeBlock]}
                  onChange={(next) => setContent({ ...content, [activeBlock]: next })}
                />
              ) : (
                <p className="text-sm text-gray-500">Block chưa có editor.</p>
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
