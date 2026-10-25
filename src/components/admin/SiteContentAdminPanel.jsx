"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadError, uploadFile, validateUploadFile } from "@/lib/uploadClient";
import { fetchJson } from "@/lib/apiClient";
import { ABOUT_SECTION_LABELS } from "@/lib/siteContent";

const URL_REGEX = /^https?:\/\/[^\s]+$/i;
// Button links: absolute http(s), mailto:/tel:, or an internal path/anchor.
const LINK_REGEX = /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[^\s]+|[/#][^\s]*)$/i;
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
  { key: "footer1", label: "Footer 1 (footer đen trang chủ)", group: "Trang chủ" },

  { key: "about", label: "Trang Về chúng tôi (toàn bộ)", group: "Trang /whoweare" },
  { key: "services", label: "Dịch vụ (khối tuỳ chọn)", group: "Trang /whoweare" },

  { key: "portfolio", label: "Bộ lọc tìm kiếm theo category", group: "Trang /videos + /images" },

  { key: "cta", label: "Thông tin liên hệ chung", group: "Footer + Global" },
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
  if (validateAs === "link" && !LINK_REGEX.test(text)) {
    return "Dùng https://…, mailto:, tel: hoặc đường dẫn nội bộ bắt đầu bằng /";
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

// Thin wrapper over the shared uploader (presign + XHR PUT with progress,
// stall watchdog, Vietnamese UploadError). onProgress receives 0–100.
async function uploadImageToR2(file, folder = "brands", onProgress) {
  // Image-only check first, so a HEIC/SVG logo gets an image-only message
  // (the generic 'type' hint also lists videos and PDF).
  const problem = validateUploadFile(file, { kind: "image" });
  if (problem) throw new UploadError("type", { message: problem, hint: "" });
  const asset = await uploadFile(file, folder, {
    fallbackContentType: "image/png",
    onProgress:
      typeof onProgress === "function" ? (info) => onProgress(info.pct) : undefined,
  });
  return { url: asset.url, key: asset.key };
}

// UploadError (and ApiError) carry a Vietnamese message + optional hint.
function uploadErrorText(error) {
  const message = error?.message || "Tải ảnh lên thất bại.";
  return error?.hint ? `${message} ${error.hint}` : message;
}

function BrandLogoSlot({ idx, value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState("");
  const safe = value || { alt: "", logoUrl: "", logoKey: "" };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      setLocalError("Chỉ chấp nhận file ảnh.");
      return;
    }
    setLocalError("");
    setProgress(0);
    setUploading(true);
    try {
      const result = await uploadImageToR2(file, "brands", setProgress);
      onChange({ ...safe, logoUrl: result.url, logoKey: result.key });
    } catch (e) {
      setLocalError(uploadErrorText(e));
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
        onChange={(event) => {
          const input = event.target;
          handleFile(input.files?.[0]);
          // Allow picking the same file again after an error (retry).
          input.value = "";
        }}
        className="block w-full text-xs file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-white hover:file:bg-gray-800 disabled:opacity-50"
      />
      {uploading ? (
        <p className="text-xs text-gray-500">Đang tải lên… {Math.round(progress)}%</p>
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
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState("");
  const safe = value || { url: "", key: "", alt: "" };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      setLocalError("Chỉ chấp nhận file ảnh.");
      return;
    }
    setLocalError("");
    setProgress(0);
    setUploading(true);
    try {
      const result = await uploadImageToR2(file, folder, setProgress);
      onChange({ ...safe, url: result.url, key: result.key });
    } catch (e) {
      setLocalError(uploadErrorText(e));
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
        onChange={(event) => {
          const input = event.target;
          handleFile(input.files?.[0]);
          // Allow picking the same file again after an error (retry).
          input.value = "";
        }}
        className="block w-full text-xs file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-white hover:file:bg-gray-800 disabled:opacity-50"
      />
      {uploading ? (
        <p className="text-xs text-gray-500">Đang tải lên… {Math.round(progress)}%</p>
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

function ServicesBlock({ value, onChange, content }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  // Visibility lives in the about page's layout (about.sections); surface
  // it here so nobody edits a block that is not rendered anywhere.
  const servicesSection = Array.isArray(content?.about?.sections)
    ? content.about.sections.find((section) => section.key === "services")
    : null;
  const servicesVisible = Boolean(servicesSection?.enabled);
  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border p-4 text-xs ${
          servicesVisible
            ? "border-gray-200 bg-gray-50 text-gray-600"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {servicesVisible
          ? "Khối Dịch vụ đang BẬT trên /whoweare."
          : "Khối Dịch vụ đang ẨN — hiện không xuất hiện ở trang nào."}{" "}
        Bật/tắt và đổi vị trí ở block{" "}
        <span className="font-medium">Trang Về chúng tôi → Bố cục</span>.
      </div>
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
          Thông tin liên hệ dùng chung
        </p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium">Footer trang chủ (nền đen)</span> — hiện
            Tên office, Địa chỉ, Phone, Email.
          </li>
          <li>
            <span className="font-medium">Khối Liên hệ ở /whoweare</span> — dùng
            các giá trị này khi ô tương ứng trong block{" "}
            <span className="font-medium">Trang Về chúng tôi → Liên hệ</span> để trống.
          </li>
        </ul>
        <p className="mt-1.5">
          Copyright sửa ở block <span className="font-medium">Footer · Copyright</span>;
          icon mạng xã hội ở block <span className="font-medium">Mạng xã hội</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Tên office" value={value.officeName} onChange={(v) => set("officeName", v)} />
        <TextField label="Địa chỉ" value={value.address} onChange={(v) => set("address", v)} />
        <TextField label="Phone" value={value.phone} onChange={(v) => set("phone", v)} validateAs="tel" placeholder="vd: +84 988 888 888" />
        <TextField label="Email" value={value.email} onChange={(v) => set("email", v)} validateAs="email" placeholder="vd: hello@xuongart.com" />
      </div>
    </div>
  );
}

function ToggleField({ label, checked, onChange, hint }) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300"
      />
      <span>
        <span className="block text-sm text-gray-800">{label}</span>
        {hint ? <span className="block text-xs text-gray-500">{hint}</span> : null}
      </span>
    </label>
  );
}

function SelectField({ label, value, onChange, options, hint }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <select
        className={`${inputCls} mt-1.5 bg-white`}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1 block text-xs text-gray-500">{hint}</span> : null}
    </label>
  );
}

const THEME_OPTIONS = [
  { value: "dark", label: "Nền đen, chữ trắng" },
  { value: "light", label: "Nền xám nhạt, chữ đen" },
];

const ABOUT_TABS = [
  { key: "layout", label: "Bố cục" },
  { key: "hero", label: "Mở đầu + số liệu" },
  { key: "founder", label: "Founder" },
  { key: "values", label: "Giá trị" },
  { key: "process", label: "Quy trình" },
  { key: "testimonials", label: "Khách nói gì" },
  { key: "cta", label: "Liên hệ" },
];

// Order + visibility of the /whoweare blocks. Fixed set (no add/remove):
// a hidden block keeps its content so it can be switched back on later.
function AboutLayoutEditor({ sections, onChange }) {
  const list = Array.isArray(sections) ? sections : [];
  const move = (idx, dir) => {
    const copy = [...list];
    const target = idx + dir;
    if (target < 0 || target >= copy.length) return;
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    onChange(copy);
  };
  const toggle = (idx, enabled) =>
    onChange(list.map((section, i) => (i === idx ? { ...section, enabled } : section)));

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-600">
        Thứ tự từ trên xuống là thứ tự hiện trên trang. Bỏ tick để ẩn một khối — nội
        dung của khối vẫn được giữ. Khối <em>Khách nói gì</em> chỉ hiện khi có ít nhất
        một nhận xét; khối <em>Dịch vụ</em> lấy nội dung từ block Dịch vụ.
      </p>
      {list.map((section, idx) => (
        <div
          key={section.key}
          className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
            section.enabled ? "border-gray-200 bg-white" : "border-dashed border-gray-300 bg-gray-50"
          }`}
        >
          <label className="flex min-w-0 items-center gap-3">
            <input
              type="checkbox"
              checked={Boolean(section.enabled)}
              onChange={(event) => toggle(idx, event.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className={`truncate text-sm ${section.enabled ? "text-gray-900" : "text-gray-500"}`}>
              {idx + 1}. {ABOUT_SECTION_LABELS[section.key] || section.key}
            </span>
          </label>
          <div className="flex shrink-0 gap-1">
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
              disabled={idx === list.length - 1}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-40"
            >
              ↓
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TitledItemList({ title, items, onChange, addLabel, titleLabel = "Tiêu đề", descriptionLabel = "Mô tả" }) {
  return (
    <ItemList
      title={title}
      items={items}
      onChange={onChange}
      emptyItem={{ title: "", description: "" }}
      addLabel={addLabel}
      renderItem={(item, update) => (
        <div className="space-y-2">
          <TextField label={titleLabel} value={item.title} onChange={(v) => update({ ...item, title: v })} />
          <TextField label={descriptionLabel} value={item.description} onChange={(v) => update({ ...item, description: v })} multiline rows={2} />
        </div>
      )}
    />
  );
}

function ParagraphList({ title, items, onChange, addLabel = "Thêm đoạn" }) {
  return (
    <ItemList
      title={title}
      items={items}
      onChange={onChange}
      emptyItem=""
      addLabel={addLabel}
      renderItem={(item, update) => (
        <textarea
          value={item}
          onChange={(event) => update(event.target.value)}
          className={inputCls}
          rows={3}
        />
      )}
    />
  );
}

// Whole /whoweare page: layout (order + visibility) plus one sub-tab per
// block. Exported so it can be mounted standalone in a test harness.
export function AboutBlock({ value, onChange }) {
  const [tab, setTab] = useState("layout");
  const about = value || {};
  const set = (k, v) => onChange({ ...about, [k]: v });
  const setIn = (section, k, v) =>
    onChange({ ...about, [section]: { ...(about[section] || {}), [k]: v } });
  const hero = about.hero || {};
  const founder = about.founder || {};
  const values = about.values || {};
  const process = about.process || {};
  const testimonials = about.testimonials || {};
  const cta = about.cta || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 p-1" role="tablist">
        {ABOUT_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === item.key ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "layout" ? (
        <AboutLayoutEditor sections={about.sections} onChange={(sections) => set("sections", sections)} />
      ) : null}

      {tab === "hero" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TextField label="Eyebrow (dòng nhỏ trên tiêu đề)" value={hero.eyebrow} onChange={(v) => setIn("hero", "eyebrow", v)} />
            <TextField label="Tiêu đề lớn" value={hero.title} onChange={(v) => setIn("hero", "title", v)} multiline rows={2} />
          </div>
          <TextField label="Đoạn mở đầu (lead)" value={hero.lead} onChange={(v) => setIn("hero", "lead", v)} multiline rows={3} />
          <ParagraphList title="Đoạn bổ sung dưới lead (tuỳ chọn)" items={hero.paragraphs} onChange={(v) => setIn("hero", "paragraphs", v)} />
          <ToggleField label="Hiện dãy số liệu dưới phần mở đầu" checked={hero.showStats} onChange={(v) => setIn("hero", "showStats", v)} />
          <ItemList
            title="Số liệu"
            items={hero.stats}
            onChange={(stats) => setIn("hero", "stats", stats)}
            emptyItem={{ value: "", label: "" }}
            addLabel="Thêm số liệu"
            renderItem={(item, update) => (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField label="Con số (text, vd: 200+)" value={item.value} onChange={(v) => update({ ...item, value: v })} />
                <TextField label="Chú thích" value={item.label} onChange={(v) => update({ ...item, label: v })} />
              </div>
            )}
          />
        </div>
      ) : null}

      {tab === "founder" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <TextField label="Eyebrow" value={founder.eyebrow} onChange={(v) => setIn("founder", "eyebrow", v)} />
            <TextField label="Tên" value={founder.name} onChange={(v) => setIn("founder", "name", v)} />
            <TextField label="Chức danh" value={founder.role} onChange={(v) => setIn("founder", "role", v)} />
          </div>
          <ImageUploadField
            label="Ảnh chân dung"
            hint="Tỉ lệ 4:5 (dọc), gợi ý 1200×1500px trở lên. Để trống thì phần Founder hiện toàn chữ."
            value={founder.photo}
            onChange={(photo) => setIn("founder", "photo", photo)}
            folder="about"
            previewAspect="4/5"
            altPlaceholder="Mô tả ảnh (a11y) — ví dụ: Nguyễn Trọng Nhân trên set quay"
          />
          <ParagraphList title="Câu chuyện (mỗi dòng một đoạn)" items={founder.story} onChange={(v) => setIn("founder", "story", v)} />
          <TextField label="Câu nói của founder (hiện có gạch cam bên trái)" value={founder.quote} onChange={(v) => setIn("founder", "quote", v)} multiline rows={2} />
        </div>
      ) : null}

      {tab === "values" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TextField label="Eyebrow" value={values.eyebrow} onChange={(v) => setIn("values", "eyebrow", v)} />
            <TextField label="Tiêu đề" value={values.title} onChange={(v) => setIn("values", "title", v)} />
          </div>
          <TextField label="Mô tả (1 câu dưới tiêu đề)" value={values.description} onChange={(v) => setIn("values", "description", v)} multiline rows={2} />
          <SelectField label="Màu nền khối" value={values.theme} onChange={(v) => setIn("values", "theme", v)} options={THEME_OPTIONS} />
          <TitledItemList title="Các giá trị" items={values.items} onChange={(v) => setIn("values", "items", v)} addLabel="Thêm giá trị" titleLabel="Tên giá trị (1–3 từ)" descriptionLabel="Giải thích (1 câu)" />
        </div>
      ) : null}

      {tab === "process" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TextField label="Eyebrow" value={process.eyebrow} onChange={(v) => setIn("process", "eyebrow", v)} />
            <TextField label="Tiêu đề" value={process.title} onChange={(v) => setIn("process", "title", v)} />
          </div>
          <TextField label="Mô tả (tuỳ chọn)" value={process.description} onChange={(v) => setIn("process", "description", v)} multiline rows={2} />
          <ToggleField label="Đánh số bước (01, 02, …)" checked={process.numbered} onChange={(v) => setIn("process", "numbered", v)} />
          <TitledItemList title="Các bước" items={process.steps} onChange={(v) => setIn("process", "steps", v)} addLabel="Thêm bước" titleLabel="Tên bước" descriptionLabel="Mô tả bước" />
        </div>
      ) : null}

      {tab === "testimonials" ? (
        <div className="space-y-4">
          <p className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            Khối này chỉ hiện trên trang khi có ít nhất một nhận xét. Nên xin phép khách
            trước khi đăng tên và chức danh.
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TextField label="Eyebrow" value={testimonials.eyebrow} onChange={(v) => setIn("testimonials", "eyebrow", v)} />
            <TextField label="Tiêu đề" value={testimonials.title} onChange={(v) => setIn("testimonials", "title", v)} />
          </div>
          <TextField label="Mô tả (tuỳ chọn)" value={testimonials.description} onChange={(v) => setIn("testimonials", "description", v)} multiline rows={2} />
          <ItemList
            title="Nhận xét"
            items={testimonials.items}
            onChange={(items) => setIn("testimonials", "items", items)}
            emptyItem={{ quote: "", name: "", role: "" }}
            addLabel="Thêm nhận xét"
            renderItem={(item, update) => (
              <div className="space-y-2">
                <TextField
                  label="Nội dung nhận xét (bắt buộc)"
                  value={item.quote}
                  onChange={(v) => update({ ...item, quote: v })}
                  multiline
                  rows={3}
                  hint={String(item.quote || "").trim() ? "" : "Chưa có nội dung: nhận xét này sẽ bị bỏ khi lưu."}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TextField label="Tên khách" value={item.name} onChange={(v) => update({ ...item, name: v })} />
                  <TextField label="Chức danh, thương hiệu" value={item.role} onChange={(v) => update({ ...item, role: v })} placeholder="vd: Brand Manager, Sony Singapore" />
                </div>
              </div>
            )}
          />
        </div>
      ) : null}

      {tab === "cta" ? (
        <div className="space-y-4">
          <TextField label="Câu kêu gọi (heading lớn)" value={cta.heading} onChange={(v) => setIn("cta", "heading", v)} multiline rows={2} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TextField label="Chữ trên nút" value={cta.buttonText} onChange={(v) => setIn("cta", "buttonText", v)} />
            <TextField
              label="Nút dẫn đến"
              value={cta.buttonUrl}
              onChange={(v) => setIn("cta", "buttonUrl", v)}
              validateAs="link"
              placeholder="https://m.me/xuongartproduction"
              hint="Link ngoài (https://…) mở tab mới. Có thể dùng mailto:, tel:, hoặc đường dẫn nội bộ như /videos. Để trống để ẩn nút."
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TextField label="Heading nhỏ phần liên hệ" value={cta.contactsHeading} onChange={(v) => setIn("cta", "contactsHeading", v)} />
            <TextField label="Tên office" value={cta.officeName} onChange={(v) => setIn("cta", "officeName", v)} hint="Để trống = dùng giá trị ở block Thông tin liên hệ chung." />
            <TextField label="Địa chỉ" value={cta.address} onChange={(v) => setIn("cta", "address", v)} hint="Để trống = dùng giá trị chung." />
            <TextField label="Phone" value={cta.phone} onChange={(v) => setIn("cta", "phone", v)} validateAs="tel" hint="Để trống = dùng giá trị chung." />
            <TextField label="Email" value={cta.email} onChange={(v) => setIn("cta", "email", v)} validateAs="email" hint="Để trống = dùng giá trị chung." />
            <TextField label="Dòng kết (tagline, chữ nhỏ cuối khối)" value={cta.tagline} onChange={(v) => setIn("cta", "tagline", v)} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SelectField label="Màu nền khối" value={cta.theme} onChange={(v) => setIn("cta", "theme", v)} options={THEME_OPTIONS} />
            <div className="pt-6">
              <ToggleField label="Hiện icon mạng xã hội" checked={cta.showSocial} onChange={(v) => setIn("cta", "showSocial", v)} hint="Link các mạng sửa ở block Mạng xã hội." />
            </div>
          </div>
        </div>
      ) : null}
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
      <TextField label="YouTube URL" value={value.youtube} onChange={(v) => set("youtube", v)} placeholder="https://youtube.com/@..." validateAs="url" />
      <TextField label="Zalo URL" value={value.zalo} onChange={(v) => set("zalo", v)} placeholder="https://zalo.me/..." validateAs="url" />
    </div>
  );
}

// Footer 1 (dark homepage footer) — convenience block that gathers
// every field actually visible in the homepage's dark footer into a
// single editor. Unlike normal blocks, the underlying data lives in
// THREE existing keys (`cta`, `social`, `footer`) because those
// fields are shared with the /whoweare CTA banner and the global
// copyright row. We don't migrate the data; we just edit those
// three keys atomically through `content` + `onContentChange`.
// Editing here updates the same source-of-truth those other blocks
// read from, so the CTA panel and the social panel stay in sync.
function Footer1Block({ content, onContentChange }) {
  const cta = content?.cta || {};
  const social = content?.social || {};
  const footer = content?.footer || {};

  const setCta = (k, v) =>
    onContentChange({ ...content, cta: { ...cta, [k]: v } });
  const setSocial = (k, v) =>
    onContentChange({ ...content, social: { ...social, [k]: v } });
  const setFooter = (k, v) =>
    onContentChange({ ...content, footer: { ...footer, [k]: v } });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <p className="font-semibold uppercase tracking-wider text-amber-800">
          Quản lý tập trung Footer 1
        </p>
        <p className="mt-1.5">
          Block này gom các field đang hiển thị ở Footer 1 (footer đen trang
          chủ). Cùng dữ liệu với block <span className="font-medium">Thông tin liên hệ chung</span>,{" "}
          <span className="font-medium">Mạng xã hội</span> và{" "}
          <span className="font-medium">Footer · Copyright</span> — sửa chỗ
          nào cũng ăn vào nhau, lưu một lần là cập nhật khắp nơi.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
          Thông tin liên hệ (cột trái)
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TextField label="Tên office" value={cta.officeName} onChange={(v) => setCta("officeName", v)} placeholder="vd: Văn phòng XUONGART" />
          <TextField label="Phone" value={cta.phone} onChange={(v) => setCta("phone", v)} validateAs="tel" placeholder="vd: 036 499 4647" />
          <div className="lg:col-span-2">
            <TextField label="Địa chỉ" value={cta.address} onChange={(v) => setCta("address", v)} placeholder="vd: 172 Lâm Văn Bền, Q.7, TP.HCM" />
          </div>
          <div className="lg:col-span-2">
            <TextField label="Email" value={cta.email} onChange={(v) => setCta("email", v)} validateAs="email" placeholder="vd: hello@xuongart.com" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
          Mạng xã hội (icon row)
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TextField label="Facebook URL" value={social.facebook} onChange={(v) => setSocial("facebook", v)} placeholder="https://facebook.com/..." validateAs="url" />
          <TextField label="Instagram URL" value={social.instagram} onChange={(v) => setSocial("instagram", v)} placeholder="https://instagram.com/..." validateAs="url" />
          <TextField label="TikTok URL" value={social.tiktok} onChange={(v) => setSocial("tiktok", v)} placeholder="https://tiktok.com/@..." validateAs="url" />
          <TextField label="YouTube URL" value={social.youtube} onChange={(v) => setSocial("youtube", v)} placeholder="https://youtube.com/@..." validateAs="url" />
          <TextField label="Zalo URL" value={social.zalo} onChange={(v) => setSocial("zalo", v)} placeholder="https://zalo.me/..." validateAs="url" />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
          Copyright (cột phải, dưới logo)
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TextField label="Tên copyright" value={footer.copyright} onChange={(v) => setFooter("copyright", v)} placeholder="vd: XUONGART Inc." />
        </div>
        <p className="text-xs text-gray-500">
          Footer 1 hiển thị © {`{Tên copyright}`} {`{năm hiện tại}`} —
          năm tự cập nhật theo thời điểm xem.
        </p>
      </div>
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

const BLOCK_RENDERERS = {
  hero: HeroBlock,
  intro: IntroBlock,
  featuredHeader: FeaturedHeaderBlock,
  stats: StatsBlock,
  clients: ClientsBlock,
  services: ServicesBlock,
  cta: CtaBlock,
  about: AboutBlock,
  footer: FooterBlock,
  social: SocialBlock,
  ui: UiBlock,
  portfolio: PortfolioBlock,
  footer1: Footer1Block,
};

export default function SiteContentAdminPanel({ onDirtyChange }) {
  const [content, setContent] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [original, setOriginal] = useState(null);
  const [activeBlock, setActiveBlock] = useState(BLOCKS[0].key);
  // Start in the loading state: the first fetch is kicked off from an effect,
  // so with `false` the very first paint would flash the empty-state text.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Optional actionable hint returned by the API (e.g. which R2 env var to
  // fix). Shown under the error message when present.
  const [errorHint, setErrorHint] = useState("");
  // HTTP status of the last failed request (ApiError.status). Used to hide
  // the R2 diagnostics link when the real problem is an expired login (401).
  const [errorStatus, setErrorStatus] = useState(null);
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
    setErrorHint("");
    setErrorStatus(null);
    try {
      // fetchJson never throws the opaque "Unexpected end of JSON input":
      // empty / non-JSON bodies become a message that includes the HTTP
      // status, and JSON error bodies surface the server's own message.
      const payload = await fetchJson(
        "/api/admin/site-content",
        { cache: "no-store" },
        { fallbackError: "Không tải được nội dung" }
      );
      if (!payload?.data || typeof payload.data !== "object") {
        throw new Error("Server trả về dữ liệu không đúng định dạng (thiếu `data`).");
      }
      setContent(payload.data);
      setOriginal(payload.data);
      setDefaults(payload.defaults || null);
    } catch (e) {
      setError(e.message);
      setErrorHint(e.hint || "");
      setErrorStatus(e.status ?? null);
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
    setErrorHint("");
    setErrorStatus(null);
    try {
      const payload = await fetchJson(
        "/api/admin/site-content",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(content),
        },
        { fallbackError: "Lưu thất bại" }
      );
      if (!payload?.data || typeof payload.data !== "object") {
        throw new Error("Server trả về dữ liệu không đúng định dạng sau khi lưu.");
      }
      setContent(payload.data);
      setOriginal(payload.data);
      setSavedAt(new Date());
    } catch (e) {
      setError(e.message);
      setErrorHint(e.hint || "");
      setErrorStatus(e.status ?? null);
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
        {loading ? (
          <p className="text-sm text-gray-600">Đang tải nội dung...</p>
        ) : error ? (
          <div className="max-w-2xl rounded-xl border border-red-300 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">
              Không tải được nội dung
            </p>
            <p className="mt-1 break-words text-sm text-red-700">{error}</p>
            {errorHint ? (
              <p className="mt-2 text-xs leading-relaxed text-red-800">
                💡 {errorHint}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadContent}
                className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
              >
                Thử lại
              </button>
              {errorStatus === 401 ? (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100"
                >
                  Tải lại trang để đăng nhập
                </button>
              ) : (
                <a
                  href="/api/admin/health"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100"
                  title="Mở báo cáo kiểm tra biến môi trường + kết nối R2 của server (tab mới)"
                >
                  Kiểm tra kết nối R2 ↗
                </a>
              )}
            </div>
          </div>
        ) : (
          // Not loading, no error, but still no content — only reachable
          // between mount and the first fetch, so keep showing the loader.
          <p className="text-sm text-gray-600">Đang tải nội dung...</p>
        )}
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
          <p className="break-words">{error}</p>
          {errorHint ? (
            <p className="mt-1.5 text-xs leading-relaxed text-red-800">💡 {errorHint}</p>
          ) : null}
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
                  // Composite blocks (e.g. Footer 1) edit fields that
                  // live across multiple top-level keys; they ignore
                  // `value` / `onChange` and use these instead. Normal
                  // blocks just leave them unread.
                  content={content}
                  onContentChange={setContent}
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
