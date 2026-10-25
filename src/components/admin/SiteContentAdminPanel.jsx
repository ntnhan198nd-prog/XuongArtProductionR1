"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadError, uploadFile, validateUploadFile } from "@/lib/uploadClient";
import { fetchJson } from "@/lib/apiClient";
import { useToast } from "@/components/admin/ToastProvider";
import { ABOUT_SECTION_LABELS, DEFAULT_SITE_CONTENT } from "@/lib/siteContent";

const URL_REGEX = /^https?:\/\/[^\s]+$/i;
// Button links: absolute http(s), mailto:/tel:, or an internal path/anchor.
const LINK_REGEX = /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[^\s]+|[/#][^\s]*)$/i;
// Loose validators — only require a recognizable pattern is *present* anywhere
// in the value. Lets the user keep decorative prefixes (emojis, icons) without
// the form constantly flagging them as invalid.
const EMAIL_PRESENCE_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/;

// ---------------------------------------------------------------------------
// Content path helpers + per-entry dirty / discard / reset logic.
// Pure functions, exported so they can be unit-tested without a DOM.

// Value at `path` (array of keys) inside `obj`; undefined if any step is missing.
export function getAt(obj, path) {
  let current = obj;
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

// Immutable set: returns a copy of `obj` with `value` stored at `path`. Only
// the containers along the path are copied; siblings keep their identity.
export function setAt(obj, path, value) {
  if (!path.length) return value;
  const [head, ...rest] = path;
  const base = obj !== null && typeof obj === "object" ? obj : {};
  const copy = Array.isArray(base) ? [...base] : { ...base };
  copy[head] = setAt(base[head], rest, value);
  return copy;
}

// Structural equality that ignores object key order (stored JSON and the
// defaults do not always list keys in the same order).
export function sameValue(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, idx) => sameValue(item, b[idx]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!sameValue(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

// On/off flag of one /whoweare section (about.sections[key=…].enabled);
// null when the section is not listed.
export function sectionEnabled(content, key) {
  const list = getAt(content, ["about", "sections"]);
  const found = Array.isArray(list) ? list.find((section) => section?.key === key) : null;
  return found ? Boolean(found.enabled) : null;
}

export function setSectionEnabled(content, key, enabled) {
  const list = getAt(content, ["about", "sections"]);
  if (!Array.isArray(list) || !list.some((section) => section?.key === key)) return content;
  return setAt(
    content,
    ["about", "sections"],
    list.map((section) => (section?.key === key ? { ...section, enabled: Boolean(enabled) } : section))
  );
}

// A sidebar entry edits one or more "parts" of the content object:
//   { path: ["hero"] }                       a whole top-level key
//   { path: ["about", "founder"] }           a nested object
//   { path: ["cta"], fields: [...] }         composite: reset only touches these fields
//   { section: "services" }                  the on/off flag of a /whoweare section
//   { path: [...], exceptSections: [...] }   the sections list, minus flags that
//                                            another entry owns (counted there)
//   resettable: false                        left alone by "Khôi phục mặc định"
export function readPart(content, part) {
  if (part.section) return sectionEnabled(content, part.section);
  const value = getAt(content, part.path);
  if (Array.isArray(part.exceptSections) && Array.isArray(value)) {
    return value.map((section) =>
      part.exceptSections.includes(section?.key) ? { ...section, enabled: undefined } : section
    );
  }
  return value;
}

// Copy one part from `source` into `target` (immutably). With fieldsOnly, a
// part that lists `fields` only copies those fields and keeps the rest.
export function copyPart(target, source, part, { fieldsOnly = false } = {}) {
  if (part.section) {
    const enabled = sectionEnabled(source, part.section);
    return enabled === null ? target : setSectionEnabled(target, part.section, enabled);
  }
  const from = getAt(source, part.path);
  if (Array.isArray(part.exceptSections)) {
    // Copy the list (order + other flags) but keep the target's own value for
    // the flags another entry owns.
    let next = setAt(target, part.path, structuredClone(from));
    for (const key of part.exceptSections) {
      const keep = sectionEnabled(target, key);
      if (keep !== null) next = setSectionEnabled(next, key, keep);
    }
    return next;
  }
  if (fieldsOnly && Array.isArray(part.fields)) {
    const current = getAt(target, part.path);
    const next = current && typeof current === "object" ? { ...current } : {};
    for (const field of part.fields) {
      if (from && typeof from === "object" && Object.prototype.hasOwnProperty.call(from, field)) {
        next[field] = structuredClone(from[field]);
      } else {
        // Missing in the source: drop it so the server normalizer refills it.
        delete next[field];
      }
    }
    return setAt(target, part.path, next);
  }
  return setAt(target, part.path, structuredClone(from));
}

export function isEntryDirty(entry, content, original) {
  return entry.parts.some((part) => !sameValue(readPart(content, part), readPart(original, part)));
}

// Ids of the entries with unsaved changes — each entry counted once, however
// many of its parts changed.
export function dirtyEntryIds(entries, content, original) {
  if (!content || !original) return [];
  return entries.filter((entry) => isEntryDirty(entry, content, original)).map((entry) => entry.id);
}

// Put every part of the entry back to the last saved version.
export function discardEntry(entry, content, original) {
  return entry.parts.reduce((next, part) => copyPart(next, original, part), content);
}

// Put the entry back to the built-in defaults (deep clone), touching only
// the fields the entry shows.
export function resetEntry(entry, content, defaults) {
  return entry.parts
    .filter((part) => part.resettable !== false)
    .reduce((next, part) => copyPart(next, defaults, part, { fieldsOnly: true }), content);
}

// The four about.cta fields that override the shared contact (site.cta).
// The public page falls back to the shared value when one is empty.
export const ABOUT_CONTACT_FIELDS = ["officeName", "address", "phone", "email"];

// Same test as the public fallback (`own || shared`): only an empty value
// means "use the shared one".
export function usesSharedContact(aboutCta) {
  const cta = aboutCta || {};
  return ABOUT_CONTACT_FIELDS.every((field) => !cta[field]);
}

// Checkbox state: checked while every override is empty, unless the owner
// just unticked it to type page-specific values.
export function isSharedContactChecked(aboutCta, customizing = false) {
  return usesSharedContact(aboutCta) && !customizing;
}

// True when editing the shared contact also updates /whoweare: its "Liên hệ"
// part either uses the shared values or is hidden (then the page footer shows
// the shared contact instead — see RootLayout's whoWeAreHasContact).
export function aboutContactFollowsShared(content) {
  if (sectionEnabled(content, "cta") === false) return true;
  return usesSharedContact(getAt(content, ["about", "cta"]));
}

export function clearContactOverrides(aboutCta) {
  const next = { ...(aboutCta || {}) };
  for (const field of ABOUT_CONTACT_FIELDS) next[field] = "";
  return next;
}

// ---------------------------------------------------------------------------
// Form controls

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black focus:border-black focus:outline-none";
const labelCls = "block text-xs font-semibold uppercase tracking-wider text-gray-600";

function validate(value, validateAs) {
  if (!validateAs) return null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (validateAs === "url" && !URL_REGEX.test(text)) {
    return "Link phải bắt đầu bằng http:// hoặc https://";
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
    return "Dùng https://…, mailto:, tel: hoặc đường dẫn trong web bắt đầu bằng /";
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

function NumberField({ label, value, onChange, step = 1, placeholder, hint }) {
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
      {hint ? <span className="mt-1 block text-xs text-gray-500">{hint}</span> : null}
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
                title="Chuyển lên trên"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === (items || []).length - 1}
                className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-40"
                title="Chuyển xuống dưới"
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

// On/off switch row (bigger than a checkbox) for settings that change what
// the page shows.
function SwitchField({ label, hint, checked, onChange }) {
  const on = Boolean(checked);
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <span className="flex flex-col">
        <span className="text-sm font-medium text-gray-900">{label}</span>
        {hint ? <span className="text-xs text-gray-500">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          on ? "bg-black" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
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

function FieldGroup({ title, hint, children }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-gray-500">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function InfoNote({ children, tone = "gray" }) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-gray-200 bg-gray-50 text-gray-600";
  return <div className={`rounded-xl border p-3 text-xs leading-relaxed ${cls}`}>{children}</div>;
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

const THEME_OPTIONS = [
  { value: "dark", label: "Nền đen, chữ trắng" },
  { value: "light", label: "Nền xám nhạt, chữ đen" },
];

// ---------------------------------------------------------------------------
// Image upload

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
          Logo {idx + 1}
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
            alt={safe.alt || `Logo ${idx + 1}`}
            className="max-h-full max-w-full object-contain p-3"
          />
        ) : (
          <span className="px-2 text-center text-xs text-gray-400">
            {safe.alt ? `Chưa có logo — đang hiện chữ “${safe.alt}”` : "Chưa có logo"}
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
      <label className="block">
        <span className="text-[11px] text-gray-500">Tên hiển thị khi chưa có logo</span>
        <input
          type="text"
          value={safe.alt || ""}
          onChange={(event) => onChange({ ...safe, alt: event.target.value })}
          placeholder="vd: Samsung"
          className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-black focus:border-black focus:outline-none"
        />
      </label>
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
  altPlaceholder = "Mô tả ngắn nội dung ảnh",
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
      <label className="block">
        <span className="text-[11px] text-gray-500">
          Mô tả ảnh (đọc cho người khiếm thị, không hiện trên trang)
        </span>
        <input
          type="text"
          value={safe.alt || ""}
          onChange={(event) => onChange({ ...safe, alt: event.target.value })}
          placeholder={altPlaceholder}
          className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-black focus:border-black focus:outline-none"
        />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Homepage editors

function HeroBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TextField label="Chữ nhỏ màu cam, góc trên bên phải" value={value.showreelLabel} onChange={(v) => set("showreelLabel", v)} placeholder="vd: Showreel · 2026" />
      <TextField label="Dòng chữ nhỏ phía trên tiêu đề" value={value.tagline} onChange={(v) => set("tagline", v)} />
      <TextField label="Tiêu đề (phần chữ trắng)" value={value.headingMain} onChange={(v) => set("headingMain", v)} />
      <TextField label="Tiêu đề (phần chữ màu cam)" value={value.headingAccent} onChange={(v) => set("headingAccent", v)} />
      <div className="lg:col-span-2">
        <TextField label="Câu mô tả ngắn (góc dưới bên phải)" value={value.description} onChange={(v) => set("description", v)} multiline rows={2} />
      </div>
      <TextField label="Chữ ở nút cuộn xuống (giữa, cuối video)" value={value.scrollHint} onChange={(v) => set("scrollHint", v)} />
    </div>
  );
}

function FeaturedHeaderBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <TextField label="Dòng chữ nhỏ phía trên tiêu đề" value={value.eyebrow} onChange={(v) => set("eyebrow", v)} />
      <TextField label="Tiêu đề (phần chữ đen)" value={value.headingMain} onChange={(v) => set("headingMain", v)} />
      <TextField label="Tiêu đề (phần chữ màu cam)" value={value.headingAccent} onChange={(v) => set("headingAccent", v)} />
    </div>
  );
}

function StatsBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Dòng chữ nhỏ phía trên tiêu đề" value={value.eyebrow} onChange={(v) => set("eyebrow", v)} />
        <TextField label="Tiêu đề" value={value.heading} onChange={(v) => set("heading", v)} />
      </div>
      <ItemList
        title="Các con số (chạy từ 0 lên khi khách cuộn tới)"
        items={value.items}
        onChange={(items) => set("items", items)}
        emptyItem={{ value: 0, suffix: "", label: "", decimals: 0 }}
        addLabel="Thêm con số"
        renderItem={(item, update) => (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumberField label="Con số" value={item.value} onChange={(v) => update({ ...item, value: v })} step={0.1} />
            <TextField label="Ký hiệu sau số (+, M, %)" value={item.suffix} onChange={(v) => update({ ...item, suffix: v })} placeholder="+ / M / %" />
            <NumberField label="Số chữ số thập phân" value={item.decimals} onChange={(v) => update({ ...item, decimals: v })} hint="0 = số nguyên; 1 = hiện kiểu 1.2" />
            <TextField label="Chú thích dưới số" value={item.label} onChange={(v) => update({ ...item, label: v })} />
          </div>
        )}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={labelCls}>Hàng logo đối tác chính</span>
          <span className="text-xs text-gray-500">
            Tối đa 5 logo · nên dùng PNG nền trong, khoảng 800×224px
          </span>
        </div>
        <TextField
          label="Tiêu đề phía trên hàng logo"
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={labelCls}>Dải logo chạy ngang</span>
          <span className="text-xs text-gray-500">
            Hiện tên các thương hiệu khác bằng chữ, chạy liên tục
          </span>
        </div>
        <TextField
          label="Tiêu đề phía trên dải chạy ngang"
          value={value.marqueeHeading}
          onChange={(v) => set("marqueeHeading", v)}
          multiline
          rows={2}
          placeholder="vd: Và các thương hiệu, đối tác sáng tạo đã đồng hành"
        />
        <SwitchField
          label="Hiện chấm màu cam giữa các tên"
          hint="Tắt để các tên chỉ cách nhau bằng khoảng trắng"
          checked={value.marqueeShowDots !== false}
          onChange={(on) => set("marqueeShowDots", on)}
        />
        <ItemList
          title="Tên thương hiệu trong dải chạy ngang"
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

function IntroBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Tiêu đề (phần chữ đen)" value={value.headingMain} onChange={(v) => set("headingMain", v)} />
        <TextField label="Tiêu đề (phần chữ màu cam)" value={value.headingAccent} onChange={(v) => set("headingAccent", v)} />
      </div>
      <TextField label="Đoạn mô tả dưới tiêu đề" value={value.description} onChange={(v) => set("description", v)} multiline rows={3} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Về chúng tôi" (/whoweare) editors — one per sidebar entry.

// Plain names for the page parts, used by the layout editor.
const ABOUT_PART_NAMES = {
  hero: "Mở đầu + số liệu",
  founder: "Người sáng lập",
  values: "Giá trị",
  process: "Quy trình",
  testimonials: "Khách nói gì",
  services: "Dịch vụ",
  cta: "Liên hệ",
};

// Sidebar entry that edits each /whoweare part.
const ABOUT_PART_ENTRY = {
  hero: "about.hero",
  founder: "about.founder",
  values: "about.values",
  process: "about.process",
  testimonials: "about.testimonials",
  services: "services",
  cta: "about.cta",
};

// Order + visibility of the /whoweare parts. Fixed set (no add/remove):
// a hidden part keeps its content so it can be switched back on later.
function AboutLayoutEditor({ value, onChange, goTo }) {
  const list = Array.isArray(value) ? value : [];
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
        Thứ tự từ trên xuống là thứ tự hiện trên trang. Bỏ tick để ẩn một phần, nội dung
        của phần đó vẫn được giữ lại. Phần <em>Khách nói gì</em> chỉ hiện khi có ít nhất
        một nhận xét. Nếu ẩn phần <em>Liên hệ</em>, chân trang của trang này sẽ tự hiện
        thông tin liên hệ chung.
      </p>
      {list.map((section, idx) => (
        <div
          key={section.key}
          className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
            section.enabled ? "border-gray-200 bg-white" : "border-dashed border-gray-300 bg-gray-50"
          }`}
        >
          <label className="flex min-w-0 items-center gap-3">
            <input
              type="checkbox"
              checked={Boolean(section.enabled)}
              onChange={(event) => toggle(idx, event.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-gray-300"
            />
            <span className={`min-w-0 break-words text-sm ${section.enabled ? "text-gray-900" : "text-gray-500"}`}>
              {idx + 1}. {ABOUT_PART_NAMES[section.key] || ABOUT_SECTION_LABELS[section.key] || section.key}
            </span>
            {section.enabled ? null : (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800">
                đang ẩn
              </span>
            )}
          </label>
          <div className="flex shrink-0 gap-1 pl-7 sm:pl-0">
            {ABOUT_PART_ENTRY[section.key] && typeof goTo === "function" ? (
              <button
                type="button"
                onClick={() => goTo(ABOUT_PART_ENTRY[section.key])}
                className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100"
              >
                Sửa nội dung
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-40"
              title="Chuyển lên trên"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(idx, 1)}
              disabled={idx === list.length - 1}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-40"
              title="Chuyển xuống dưới"
            >
              ↓
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AboutHeroEditor({ value, onChange }) {
  const hero = value || {};
  const set = (k, v) => onChange({ ...hero, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Dòng chữ nhỏ phía trên tiêu đề" value={hero.eyebrow} onChange={(v) => set("eyebrow", v)} />
        <TextField label="Tiêu đề lớn" value={hero.title} onChange={(v) => set("title", v)} multiline rows={2} />
      </div>
      <TextField label="Đoạn mở đầu" value={hero.lead} onChange={(v) => set("lead", v)} multiline rows={3} />
      <ParagraphList title="Các đoạn thêm bên dưới (không bắt buộc)" items={hero.paragraphs} onChange={(v) => set("paragraphs", v)} />
      <ToggleField label="Hiện dãy số liệu bên dưới phần mở đầu" checked={hero.showStats} onChange={(v) => set("showStats", v)} />
      <ItemList
        title="Số liệu"
        items={hero.stats}
        onChange={(stats) => set("stats", stats)}
        emptyItem={{ value: "", label: "" }}
        addLabel="Thêm số liệu"
        renderItem={(item, update) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label="Con số (gõ tự do, vd: 200+)" value={item.value} onChange={(v) => update({ ...item, value: v })} />
            <TextField label="Chú thích" value={item.label} onChange={(v) => update({ ...item, label: v })} />
          </div>
        )}
      />
    </div>
  );
}

function AboutFounderEditor({ value, onChange }) {
  const founder = value || {};
  const set = (k, v) => onChange({ ...founder, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TextField label="Dòng chữ nhỏ phía trên" value={founder.eyebrow} onChange={(v) => set("eyebrow", v)} />
        <TextField label="Tên" value={founder.name} onChange={(v) => set("name", v)} />
        <TextField label="Chức danh" value={founder.role} onChange={(v) => set("role", v)} />
      </div>
      <ImageUploadField
        label="Ảnh chân dung"
        hint="Ảnh dọc tỉ lệ 4:5, nên từ 1200×1500px trở lên. Để trống thì phần này chỉ hiện chữ."
        value={founder.photo}
        onChange={(photo) => set("photo", photo)}
        folder="about"
        previewAspect="4/5"
        altPlaceholder="vd: Nguyễn Trọng Nhân trên phim trường"
      />
      <ParagraphList title="Câu chuyện (mỗi ô là một đoạn)" items={founder.story} onChange={(v) => set("story", v)} />
      <TextField label="Câu nói của người sáng lập (hiện có gạch cam bên trái)" value={founder.quote} onChange={(v) => set("quote", v)} multiline rows={2} />
    </div>
  );
}

function AboutValuesEditor({ value, onChange }) {
  const values = value || {};
  const set = (k, v) => onChange({ ...values, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Dòng chữ nhỏ phía trên tiêu đề" value={values.eyebrow} onChange={(v) => set("eyebrow", v)} />
        <TextField label="Tiêu đề" value={values.title} onChange={(v) => set("title", v)} />
      </div>
      <TextField label="Câu mô tả dưới tiêu đề" value={values.description} onChange={(v) => set("description", v)} multiline rows={2} />
      <SelectField label="Màu nền" value={values.theme} onChange={(v) => set("theme", v)} options={THEME_OPTIONS} />
      <TitledItemList title="Các giá trị" items={values.items} onChange={(v) => set("items", v)} addLabel="Thêm giá trị" titleLabel="Tên giá trị (1–3 từ)" descriptionLabel="Giải thích (1 câu)" />
    </div>
  );
}

function AboutProcessEditor({ value, onChange }) {
  const process = value || {};
  const set = (k, v) => onChange({ ...process, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Dòng chữ nhỏ phía trên tiêu đề" value={process.eyebrow} onChange={(v) => set("eyebrow", v)} />
        <TextField label="Tiêu đề" value={process.title} onChange={(v) => set("title", v)} />
      </div>
      <TextField label="Câu mô tả dưới tiêu đề (không bắt buộc)" value={process.description} onChange={(v) => set("description", v)} multiline rows={2} />
      <ToggleField label="Đánh số các bước (01, 02, …)" checked={process.numbered} onChange={(v) => set("numbered", v)} />
      <TitledItemList title="Các bước" items={process.steps} onChange={(v) => set("steps", v)} addLabel="Thêm bước" titleLabel="Tên bước" descriptionLabel="Mô tả bước" />
    </div>
  );
}

function AboutTestimonialsEditor({ value, onChange }) {
  const testimonials = value || {};
  const set = (k, v) => onChange({ ...testimonials, [k]: v });
  return (
    <div className="space-y-4">
      <InfoNote>
        Phần này chỉ hiện trên trang khi có ít nhất một nhận xét. Nên xin phép khách
        trước khi đăng tên và chức danh.
      </InfoNote>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Dòng chữ nhỏ phía trên tiêu đề" value={testimonials.eyebrow} onChange={(v) => set("eyebrow", v)} />
        <TextField label="Tiêu đề" value={testimonials.title} onChange={(v) => set("title", v)} />
      </div>
      <TextField label="Câu mô tả dưới tiêu đề (không bắt buộc)" value={testimonials.description} onChange={(v) => set("description", v)} multiline rows={2} />
      <ItemList
        title="Nhận xét"
        items={testimonials.items}
        onChange={(items) => set("items", items)}
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
  );
}

const CONTACT_FIELD_LABELS = {
  officeName: "Tên văn phòng",
  address: "Địa chỉ",
  phone: "Số điện thoại",
  email: "Email",
};

// "Liên hệ" block at the bottom of /whoweare. Its office/address/phone/email
// fall back to the shared contact (site.cta) when empty — see AboutCta in
// components/WhoWeAreSections.jsx. The checkbox only clears or reveals the
// four overrides; defaults and the normalizer are untouched.
function AboutContactEditor({ value, onChange, content, goTo }) {
  const cta = value || {};
  const set = (k, v) => onChange({ ...cta, [k]: v });
  const shared = content?.cta || {};
  // True once the owner unticks the box or types in one of the four fields,
  // so the inputs stay on screen even while they are all empty (no re-tick
  // mid-typing). The panel remounts this editor on discard / reset, which
  // clears it so the box follows the restored values again.
  const [customizing, setCustomizing] = useState(false);
  const useShared = isSharedContactChecked(cta, customizing);
  const setOverride = (k, v) => {
    setCustomizing(true);
    set(k, v);
  };

  const toggleShared = (checked) => {
    if (checked) {
      onChange(clearContactOverrides(cta));
      setCustomizing(false);
    } else {
      setCustomizing(true);
    }
  };

  return (
    <div className="space-y-4">
      <TextField label="Câu kêu gọi (chữ lớn)" value={cta.heading} onChange={(v) => set("heading", v)} multiline rows={2} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Chữ trên nút" value={cta.buttonText} onChange={(v) => set("buttonText", v)} hint="Để trống thì ẩn nút." />
        <TextField
          label="Nút dẫn đến"
          value={cta.buttonUrl}
          onChange={(v) => set("buttonUrl", v)}
          validateAs="link"
          placeholder="https://m.me/xuongartproduction"
          hint="Link ngoài (https://…) sẽ mở tab mới. Có thể dùng mailto:, tel: hoặc một trang trong web như /videos. Để trống thì ẩn nút."
        />
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <TextField
          label="Tiêu đề nhỏ phía trên thông tin liên hệ"
          value={cta.contactsHeading}
          onChange={(v) => set("contactsHeading", v)}
        />
        <ToggleField
          label="Dùng cùng thông tin liên hệ với chân trang"
          checked={useShared}
          onChange={toggleShared}
          hint={
            useShared
              ? "Chỉ cần sửa một chỗ ở mục “Chân trang & liên hệ”, trang này tự cập nhật theo."
              : "Trang này đang dùng thông tin riêng bên dưới. Tick ô này để dùng chung với chân trang, khi đó chỉ cần sửa một chỗ."
          }
        />
        {useShared ? (
          <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Trang này đang hiện
            </p>
            <dl className="mt-1.5 space-y-0.5">
              {ABOUT_CONTACT_FIELDS.map((field) => (
                <div key={field} className="flex gap-2">
                  <dt className="w-28 shrink-0 text-xs text-gray-500">{CONTACT_FIELD_LABELS[field]}</dt>
                  <dd className="min-w-0 break-words">
                    {shared[field] || <span className="text-gray-400">(trống)</span>}
                  </dd>
                </div>
              ))}
            </dl>
            {typeof goTo === "function" ? (
              <button
                type="button"
                onClick={() => goTo("contact")}
                className="mt-2 text-xs font-medium text-black underline underline-offset-2"
              >
                Sửa ở mục Chân trang & liên hệ →
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TextField label={CONTACT_FIELD_LABELS.officeName} value={cta.officeName} onChange={(v) => setOverride("officeName", v)} placeholder={shared.officeName} hint="Để trống thì dùng thông tin ở chân trang." />
            <TextField label={CONTACT_FIELD_LABELS.address} value={cta.address} onChange={(v) => setOverride("address", v)} placeholder={shared.address} hint="Để trống thì dùng thông tin ở chân trang." />
            <TextField label={CONTACT_FIELD_LABELS.phone} value={cta.phone} onChange={(v) => setOverride("phone", v)} validateAs="tel" placeholder={shared.phone} hint="Để trống thì dùng thông tin ở chân trang." />
            <TextField label={CONTACT_FIELD_LABELS.email} value={cta.email} onChange={(v) => setOverride("email", v)} validateAs="email" placeholder={shared.email} hint="Để trống thì dùng thông tin ở chân trang." />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Dòng chữ nhỏ cuối khung" value={cta.tagline} onChange={(v) => set("tagline", v)} />
        <SelectField label="Màu nền" value={cta.theme} onChange={(v) => set("theme", v)} options={THEME_OPTIONS} />
      </div>
      <ToggleField
        label="Hiện biểu tượng mạng xã hội"
        checked={cta.showSocial}
        onChange={(v) => set("showSocial", v)}
        hint="Link mạng xã hội sửa ở mục “Chân trang & liên hệ”."
      />
    </div>
  );
}

// Services list. The content lives in the top-level `services` key; whether
// it shows is the "services" flag in about.sections (also editable in
// "Bố cục & thứ tự").
function ServicesBlock({ value, onChange, content, updateContent, goTo }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const visible = sectionEnabled(content, "services") === true;
  return (
    <div className="space-y-4">
      <SwitchField
        label="Hiện khối này trên trang Về chúng tôi"
        hint={
          visible
            ? "Đang hiện. Vị trí của khối đổi ở mục “Bố cục & thứ tự”."
            : "Đang ẩn — khối này hiện chưa xuất hiện ở trang nào."
        }
        checked={visible}
        onChange={(on) => updateContent((prev) => setSectionEnabled(prev, "services", on))}
      />
      {typeof goTo === "function" ? (
        <button
          type="button"
          onClick={() => goTo("about.sections")}
          className="text-xs font-medium text-black underline underline-offset-2"
        >
          Đổi vị trí ở mục Bố cục & thứ tự →
        </button>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField label="Dòng chữ nhỏ phía trên tiêu đề" value={value.eyebrow} onChange={(v) => set("eyebrow", v)} />
        <TextField label="Câu ngắn dưới tiêu đề" value={value.tagline} onChange={(v) => set("tagline", v)} />
        <TextField label="Tiêu đề (phần chữ đen)" value={value.headingMain} onChange={(v) => set("headingMain", v)} multiline rows={2} />
        <TextField label="Tiêu đề (phần chữ màu cam)" value={value.headingAccent} onChange={(v) => set("headingAccent", v)} />
      </div>
      <ImageUploadField
        label="Ảnh minh hoạ (bên trái danh sách dịch vụ)"
        hint="Ảnh gần vuông, nên từ 1400×1320px trở lên. Ảnh sẽ hiện trắng đen và được cắt theo khung có sẵn. Để trống thì dùng ảnh mặc định."
        value={value.image}
        onChange={(img) => set("image", img)}
        folder="services"
        previewAspect="719/680"
        altPlaceholder="vd: Quay phim trong studio"
      />
      <ItemList
        title="Danh sách dịch vụ"
        items={value.items}
        onChange={(items) => set("items", items)}
        emptyItem={{ title: "", description: "" }}
        addLabel="Thêm dịch vụ"
        renderItem={(item, update) => (
          <div className="space-y-2">
            <TextField label="Tên dịch vụ" value={item.title} onChange={(v) => update({ ...item, title: v })} />
            <TextField label="Mô tả" value={item.description} onChange={(v) => update({ ...item, description: v })} multiline rows={2} />
          </div>
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gallery pages + shared editors

function PortfolioBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <InfoNote>
        <p>
          Danh sách thể loại hiện trong menu xổ xuống của ô tìm kiếm. Mỗi trang dùng danh
          sách riêng. Chỉ thể loại có trong danh sách mới hiện ở menu; các thẻ khác trên
          từng dự án vẫn bấm được như thường.
        </p>
        <p className="mt-1.5">
          Để trống một danh sách thì trang đó tự lấy tất cả thể loại từ các dự án.
        </p>
      </InfoNote>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className={labelCls}>Trang -động (video) · /videos</span>
            <a href="/videos" target="_blank" rel="noreferrer" className="shrink-0 text-xs text-gray-600 hover:underline">
              Mở trang ↗
            </a>
          </div>
          <ItemList
            title="Các thể loại"
            items={value.searchCategories}
            onChange={(items) => set("searchCategories", items)}
            emptyItem=""
            addLabel="Thêm thể loại"
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
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className={labelCls}>Trang -tĩnh (hình ảnh) · /images</span>
            <a href="/images" target="_blank" rel="noreferrer" className="shrink-0 text-xs text-gray-600 hover:underline">
              Mở trang ↗
            </a>
          </div>
          <ItemList
            title="Các thể loại"
            items={value.imageSearchCategories}
            onChange={(items) => set("imageSearchCategories", items)}
            emptyItem=""
            addLabel="Thêm thể loại"
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

const CONTACT_FIELDS = ["officeName", "address", "phone", "email"];
const SOCIAL_FIELDS = ["facebook", "instagram", "tiktok", "youtube", "zalo"];
const FOOTER_FIELDS = ["copyright", "heading", "email", "phone"];

// "Chân trang & liên hệ": one editor over three stored keys — cta (shared
// contact), social and footer. Data is not migrated; every field is written
// back to the key the public components already read.
function ContactFooterEditor({ content, updateContent, goTo }) {
  const cta = content?.cta || {};
  const social = content?.social || {};
  const footer = content?.footer || {};
  const setIn = (key, field, v) => updateContent((prev) => setAt(prev, [key, field], v));
  const year = new Date().getFullYear();
  // Same fallback as Footer.jsx, so the preview matches the public page.
  const copyrightShown = footer.copyright || DEFAULT_SITE_CONTENT.footer.copyright;
  const followsShared = aboutContactFollowsShared(content);

  return (
    <div className="space-y-8">
      {followsShared ? (
        <InfoNote>Đây là thông tin liên hệ dùng chung — sửa ở đây là đủ, trang Về chúng tôi cũng tự cập nhật theo.</InfoNote>
      ) : (
        <InfoNote tone="amber">
          Trang Về chúng tôi đang dùng thông tin liên hệ riêng, nên sửa ở đây sẽ không đổi
          trang đó. Muốn chỉ sửa một chỗ, hãy tick “Dùng cùng thông tin liên hệ với chân
          trang” ở mục Liên hệ.
          {typeof goTo === "function" ? (
            <>
              {" "}
              <button
                type="button"
                onClick={() => goTo("about.cta")}
                className="font-medium text-amber-900 underline underline-offset-2"
              >
                Mở mục Liên hệ →
              </button>
            </>
          ) : null}
        </InfoNote>
      )}
      <FieldGroup
        title="Thông tin liên hệ"
        hint="Hiện ở chân trang đen cuối trang chủ. Mục Liên hệ của trang Về chúng tôi cũng dùng các thông tin này khi bật “Dùng cùng thông tin liên hệ với chân trang”."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TextField label="Tên văn phòng" value={cta.officeName} onChange={(v) => setIn("cta", "officeName", v)} placeholder="vd: Văn phòng XUONGART" />
          <TextField label="Số điện thoại" value={cta.phone} onChange={(v) => setIn("cta", "phone", v)} validateAs="tel" placeholder="vd: 036 499 4647" />
          <div className="lg:col-span-2">
            <TextField label="Địa chỉ" value={cta.address} onChange={(v) => setIn("cta", "address", v)} placeholder="vd: 172 Lâm Văn Bền, Q.7, TP.HCM" />
          </div>
          <div className="lg:col-span-2">
            <TextField label="Email" value={cta.email} onChange={(v) => setIn("cta", "email", v)} validateAs="email" placeholder="vd: hello@xuongart.com" />
          </div>
        </div>
      </FieldGroup>

      <FieldGroup
        title="Mạng xã hội"
        hint="Dán link trang của bạn. Ô nào để trống thì biểu tượng đó được ẩn."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TextField label="Facebook" value={social.facebook} onChange={(v) => setIn("social", "facebook", v)} placeholder="https://facebook.com/..." validateAs="url" />
          <TextField label="Instagram" value={social.instagram} onChange={(v) => setIn("social", "instagram", v)} placeholder="https://instagram.com/..." validateAs="url" />
          <TextField label="TikTok" value={social.tiktok} onChange={(v) => setIn("social", "tiktok", v)} placeholder="https://tiktok.com/@..." validateAs="url" />
          <TextField label="YouTube" value={social.youtube} onChange={(v) => setIn("social", "youtube", v)} placeholder="https://youtube.com/@..." validateAs="url" />
          <TextField label="Zalo" value={social.zalo} onChange={(v) => setIn("social", "zalo", v)} placeholder="https://zalo.me/..." validateAs="url" />
        </div>
      </FieldGroup>

      <FieldGroup title="Dòng bản quyền" hint="Hiện ở cuối mọi trang, cạnh logo.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TextField
            label="Tên sau ký hiệu ©"
            value={footer.copyright}
            onChange={(v) => setIn("footer", "copyright", v)}
            placeholder="vd: XUONGART Inc."
            hint={`Trang sẽ hiện: © ${copyrightShown} ${year} — năm tự cập nhật.${
              footer.copyright ? "" : " Để trống thì dùng tên mặc định."
            }`}
          />
        </div>
      </FieldGroup>

      <details className="rounded-xl border border-gray-200 p-4">
        <summary className="cursor-pointer select-none text-sm font-semibold text-gray-700">
          Chân trang dạng đầy đủ (ít dùng)
        </summary>
        <p className="mt-2 text-xs text-gray-500">
          Chỉ hiện ở vài trang phụ, ví dụ trang báo “không tìm thấy trang”. Trang chủ,
          -động, -tĩnh và Về chúng tôi không dùng phần này.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TextField label="Tiêu đề cột liên hệ" value={footer.heading} onChange={(v) => setIn("footer", "heading", v)} />
          <TextField label="Email" value={footer.email} onChange={(v) => setIn("footer", "email", v)} validateAs="email" />
          <TextField label="Số điện thoại" value={footer.phone} onChange={(v) => setIn("footer", "phone", v)} validateAs="tel" />
        </div>
      </details>
    </div>
  );
}

function UiBlock({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-4">
      <TextField
        label="Chữ hiện trong lúc đang tải"
        value={value.loadingProjectsText}
        onChange={(v) => set("loadingProjectsText", v)}
        placeholder="vd: Đang tải dự án..."
        hint="Hiện ở trang -động, -tĩnh, trang chi tiết video và lưới dự án nổi bật trên trang chủ, trong lúc chờ tải."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar entries, grouped by page. `parts` drives dirty / discard / reset
// (see helpers at the top); `Editor` gets the value at parts[0].path.

const ENTRY_GROUPS = [
  { key: "home", label: "Trang chủ" },
  { key: "about", label: "Trang Về chúng tôi" },
  { key: "gallery", label: "Trang -động & -tĩnh" },
  { key: "global", label: "Chung cho mọi trang" },
];

export const ENTRIES = [
  // Homepage, in the order of src/app/page.jsx.
  {
    id: "hero",
    group: "home",
    label: "Banner video đầu trang",
    where: "đầu trang chủ",
    whereLong: "Trang chủ — chữ nằm trên video lớn ở đầu trang",
    note: "Video nền đổi ở thẻ “Trang chủ: Showreel & Nổi bật”.",
    href: "/",
    parts: [{ path: ["hero"] }],
    Editor: HeroBlock,
  },
  {
    id: "featuredHeader",
    group: "home",
    label: "Tiêu đề lưới dự án nổi bật",
    where: "trên lưới dự án",
    whereLong: "Trang chủ — ngay phía trên lưới video nổi bật",
    note: "Các video trong lưới chọn ở thẻ “Trang chủ: Showreel & Nổi bật”.",
    href: "/#projects-section",
    parts: [{ path: ["featuredHeader"] }],
    Editor: FeaturedHeaderBlock,
  },
  {
    id: "stats",
    group: "home",
    label: "Dãy con số",
    where: "dưới lưới dự án",
    whereLong: "Trang chủ — dãy con số ngay dưới lưới dự án nổi bật",
    href: "/#stats",
    parts: [{ path: ["stats"] }],
    Editor: StatsBlock,
  },
  {
    id: "clients",
    group: "home",
    label: "Logo khách hàng",
    where: "khung logo nền đen",
    whereLong: "Trang chủ — khung nền đen có logo và tên các thương hiệu",
    href: "/#clients",
    parts: [{ path: ["clients"] }],
    Editor: ClientsBlock,
  },
  {
    id: "intro",
    group: "home",
    label: "Đoạn giới thiệu cuối trang",
    where: "cuối trang chủ",
    whereLong: "Trang chủ — đoạn chữ lớn ở cuối trang, ngay trên chân trang",
    href: "/#intro",
    parts: [{ path: ["intro"] }],
    Editor: IntroBlock,
  },

  // /whoweare
  {
    id: "about.sections",
    group: "about",
    label: "Bố cục & thứ tự",
    where: "trang Về chúng tôi",
    whereLong: "Trang Về chúng tôi — thứ tự từ trên xuống và phần nào được hiện",
    href: "/whoweare",
    // The Dịch vụ on/off flag belongs to the "Dịch vụ" entry, so one flip of
    // that switch counts as one unsaved item, not two.
    parts: [{ path: ["about", "sections"], exceptSections: ["services"] }],
    Editor: AboutLayoutEditor,
  },
  {
    id: "about.hero",
    group: "about",
    label: "Mở đầu + số liệu",
    section: "hero",
    where: "đầu trang Về chúng tôi",
    whereLong: "Trang Về chúng tôi — tiêu đề lớn, đoạn mở đầu và dãy số liệu",
    href: "/whoweare",
    parts: [{ path: ["about", "hero"] }],
    Editor: AboutHeroEditor,
  },
  {
    id: "about.founder",
    group: "about",
    label: "Người sáng lập",
    section: "founder",
    where: "trang Về chúng tôi",
    whereLong: "Trang Về chúng tôi — ảnh, tên và câu chuyện của người sáng lập",
    href: "/whoweare#founder",
    parts: [{ path: ["about", "founder"] }],
    Editor: AboutFounderEditor,
  },
  {
    id: "about.values",
    group: "about",
    label: "Giá trị",
    section: "values",
    emptyListPath: ["about", "values", "items"],
    where: "trang Về chúng tôi",
    whereLong: "Trang Về chúng tôi — khung liệt kê cách làm việc của đội",
    href: "/whoweare#values",
    parts: [{ path: ["about", "values"] }],
    Editor: AboutValuesEditor,
  },
  {
    id: "about.process",
    group: "about",
    label: "Quy trình",
    section: "process",
    emptyListPath: ["about", "process", "steps"],
    where: "trang Về chúng tôi",
    whereLong: "Trang Về chúng tôi — các bước từ lúc nhận yêu cầu đến khi giao phim",
    href: "/whoweare#process",
    parts: [{ path: ["about", "process"] }],
    Editor: AboutProcessEditor,
  },
  {
    id: "about.testimonials",
    group: "about",
    label: "Khách nói gì",
    section: "testimonials",
    emptyListPath: ["about", "testimonials", "items"],
    where: "trang Về chúng tôi",
    whereLong: "Trang Về chúng tôi — nhận xét của khách hàng",
    href: "/whoweare#testimonials",
    parts: [{ path: ["about", "testimonials"] }],
    Editor: AboutTestimonialsEditor,
  },
  {
    id: "services",
    group: "about",
    label: "Dịch vụ",
    section: "services",
    where: "trang Về chúng tôi",
    whereLong: "Trang Về chúng tôi — danh sách dịch vụ kèm ảnh minh hoạ",
    href: "/whoweare#services",
    // The on/off switch counts as part of this entry for "chưa lưu" and
    // "Hủy thay đổi", but "Khôi phục mặc định" leaves visibility alone.
    parts: [{ path: ["services"] }, { section: "services", resettable: false }],
    Editor: ServicesBlock,
  },
  {
    id: "about.cta",
    group: "about",
    label: "Liên hệ",
    section: "cta",
    where: "cuối trang Về chúng tôi",
    whereLong: "Trang Về chúng tôi — khung kêu gọi liên hệ ở cuối trang",
    href: "/whoweare#contact",
    parts: [{ path: ["about", "cta"] }],
    Editor: AboutContactEditor,
  },

  // /videos + /images
  {
    id: "portfolio",
    group: "gallery",
    label: "Bộ lọc thể loại",
    where: "ô tìm kiếm -động, -tĩnh",
    whereLong: "Trang -động (video) và -tĩnh (hình ảnh) — menu thể loại trong ô tìm kiếm",
    href: "/videos",
    parts: [{ path: ["portfolio"] }],
    Editor: PortfolioBlock,
  },

  // Shared
  {
    id: "contact",
    group: "global",
    label: "Chân trang & liên hệ",
    where: "cuối trang chủ, chân mọi trang",
    whereLong:
      "Chân trang đen cuối trang chủ (liên hệ, mạng xã hội) và dòng © ở cuối mọi trang",
    // The footer is fixed behind the page (RootLayout), so it has no scroll
    // target of its own; #intro is the section right above it.
    href: "/#intro",
    parts: [
      { path: ["cta"], fields: CONTACT_FIELDS },
      { path: ["social"], fields: SOCIAL_FIELDS },
      { path: ["footer"], fields: FOOTER_FIELDS },
    ],
    Editor: ContactFooterEditor,
  },
  {
    id: "ui",
    group: "global",
    label: "Chữ khi đang tải",
    where: "-động, -tĩnh và trang chủ",
    whereLong: "Trang -động, -tĩnh, chi tiết video và lưới dự án trang chủ — trong lúc chờ tải",
    href: "/videos",
    parts: [{ path: ["ui"] }],
    Editor: UiBlock,
  },
];

const ENTRY_BY_ID = Object.fromEntries(ENTRIES.map((entry) => [entry.id, entry]));

// Why an entry is not visible on the public page right now ("" = visible).
export function entryHiddenNote(entry, content) {
  if (entry.section && sectionEnabled(content, entry.section) === false) {
    return "Đang tắt, chưa hiện trên trang";
  }
  if (entry.emptyListPath) {
    const list = getAt(content, entry.emptyListPath);
    if (!Array.isArray(list) || list.length === 0) return "Chưa có nội dung nên chưa hiện";
  }
  return "";
}

// "14:05" for the "Lưu lần cuối" note next to the Save button.
function formatClock(date) {
  try {
    return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const RESET_WORD = "RESET";

// Toast source key: a new save error replaces the previous one (see
// ToastProvider's replacesToast) but never another panel's error.
const SAVE_ERROR_TOAST_KEY = "site-content-save";

// Case-insensitive: phones auto-capitalise "reset" to "Reset".
export function isResetWordTyped(value) {
  return String(value ?? "").trim().toUpperCase() === RESET_WORD;
}

// Whole-site reset, tucked away and gated by typing RESET.
function AdvancedResetBox({ value, onChange, onReset, available, done }) {
  const ready = available && isResetWordTyped(value);
  return (
    <details className="rounded-2xl border border-gray-200 p-3">
      <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-gray-500">
        Nâng cao
      </summary>
      <div className="mt-3 space-y-2 text-xs text-gray-600">
        <p className="text-sm font-medium text-gray-900">Khôi phục mặc định toàn bộ website</p>
        <p>
          Đưa chữ của mọi trang về nội dung ban đầu; logo và ảnh đã tải lên cũng bị gỡ.
          Chỉ có hiệu lực khi bạn bấm “Lưu thay đổi” — trước đó vẫn có thể bấm “Hủy mọi
          thay đổi”.
        </p>
        <label className="block">
          <span>
            Gõ <strong className="font-mono text-gray-900">{RESET_WORD}</strong> để mở khoá nút
          </span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 font-mono text-sm text-black focus:border-black focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={onReset}
          disabled={!ready}
          className="w-full rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Khôi phục mặc định toàn bộ
        </button>
        {done ? (
          <p role="status" className="rounded-md bg-amber-50 px-2 py-1.5 text-amber-900">
            Đã khôi phục — bấm “Lưu thay đổi” ở đầu trang để áp dụng, hoặc “Hủy mọi thay
            đổi” để quay lại.
          </p>
        ) : null}
      </div>
    </details>
  );
}

export default function SiteContentAdminPanel({ onDirtyChange, active = true }) {
  const toast = useToast();
  const [content, setContent] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [original, setOriginal] = useState(null);
  const [activeId, setActiveId] = useState(ENTRIES[0].id);
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
  const [resetAllText, setResetAllText] = useState("");
  const [resetAllDone, setResetAllDone] = useState(false);
  // Bumped on discard / reset so the editor remounts and drops local UI state
  // that no longer matches the restored values (e.g. the Liên hệ checkbox).
  const [editorNonce, setEditorNonce] = useState(0);
  // Set by goTo(): after the swap, scroll the editor into view and focus its
  // heading (the clicked cross-link button has just unmounted).
  const focusEditorRef = useRef(false);
  const editorHeadingRef = useRef(null);
  const sidebarRef = useRef(null);
  // Id of the open "Lưu thất bại" toast; closed once a save goes through or
  // the changes are discarded.
  const saveErrorToastRef = useRef(null);
  // Always the current "save if there is something to save" (used by the
  // ⌘/Ctrl+S shortcut and the toast's "Thử lại", so a retry never sends an
  // older copy of the content).
  const saveLatestRef = useRef(null);

  // The Save bar sticks to the top of the window; a 1px sentinel right above
  // it tells when it is stuck, to add a separating shadow.
  const [toolbarStuck, setToolbarStuck] = useState(false);
  const toolbarRef = useRef(null);
  const stickyObserverRef = useRef(null);
  const stickySentinelRef = useCallback((node) => {
    stickyObserverRef.current?.disconnect();
    stickyObserverRef.current = null;
    if (!node || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const rootTop = entry.rootBounds ? entry.rootBounds.top : 0;
      setToolbarStuck(!entry.isIntersecting && entry.boundingClientRect.top < rootTop);
    });
    observer.observe(node);
    stickyObserverRef.current = observer;
  }, []);

  // While this tab is on screen, keep the page's scroll-padding equal to
  // the Save bar's height, so focusing a field (Tab / Shift+Tab) or jumping
  // to an entry never leaves it hidden under the bar.
  const toolbarReady = Boolean(content) && !loading;
  useEffect(() => {
    const node = toolbarRef.current;
    if (!active || !toolbarReady || !node || typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const previous = root.style.scrollPaddingTop;
    const apply = () => {
      const height = node.getBoundingClientRect().height;
      root.style.scrollPaddingTop = height > 0 ? `${Math.ceil(height) + 8}px` : previous;
    };
    apply();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(apply) : null;
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      root.style.scrollPaddingTop = previous;
    };
  }, [active, toolbarReady]);

  const activeEntry = ENTRY_BY_ID[activeId] || ENTRIES[0];

  const dirtyByEntry = useMemo(() => {
    const ids = new Set(dirtyEntryIds(ENTRIES, content, original));
    return Object.fromEntries(ENTRIES.map((entry) => [entry.id, ids.has(entry.id)]));
  }, [content, original]);

  const dirtyCount = useMemo(
    () => Object.values(dirtyByEntry).filter(Boolean).length,
    [dirtyByEntry]
  );

  // Whole-object compare, so changes outside every entry (e.g. after
  // "Khôi phục mặc định toàn bộ") can still be saved or discarded.
  const dirty = useMemo(
    () => Boolean(content && original) && !sameValue(content, original),
    [content, original]
  );

  // Notify the shell (unsaved dot on the tab, leave-page and logout
  // warnings). A save in flight counts too: leaving now could lose it.
  const pending = dirty || saving;
  useEffect(() => {
    if (typeof onDirtyChange === "function") onDirtyChange(pending);
  }, [pending, onDirtyChange]);

  const updateContent = useCallback(
    (updater) => setContent((prev) => (prev ? updater(prev) : prev)),
    []
  );

  const goTo = useCallback((id) => {
    if (!ENTRY_BY_ID[id]) return;
    focusEditorRef.current = true;
    setActiveId(id);
  }, []);

  useEffect(() => {
    if (!focusEditorRef.current) return;
    focusEditorRef.current = false;
    const heading = editorHeadingRef.current;
    if (!heading) return;
    heading.scrollIntoView({ block: "start", behavior: "smooth" });
    heading.focus({ preventScroll: true });
  }, [activeId]);

  // Desktop: the sidebar is sticky with its own scroll; keep the selected
  // entry visible in it (e.g. after a "Sửa ở mục …" jump).
  useEffect(() => {
    const aside = sidebarRef.current;
    if (!aside || aside.scrollHeight <= aside.clientHeight + 1) return;
    const item = aside.querySelector('[aria-current="true"]');
    if (!item) return;
    const box = aside.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    if (rect.top < box.top) aside.scrollTop += rect.top - box.top - 8;
    else if (rect.bottom > box.bottom) aside.scrollTop += rect.bottom - box.bottom + 8;
  }, [activeId]);

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
        throw new Error("Server trả về dữ liệu không đúng định dạng.");
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

  const dismissSaveError = () => {
    if (saveErrorToastRef.current) toast.dismiss?.(saveErrorToastRef.current);
    saveErrorToastRef.current = null;
  };

  // Save errors are shown as a toast (with "Thử lại"); the red box further
  // down is only for the first load.
  const handleSave = async () => {
    if (!content || saving) return;
    const sent = content;
    const savedEntry = activeEntry;
    setSaving(true);
    try {
      const payload = await fetchJson(
        "/api/admin/site-content",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sent),
        },
        { fallbackError: "Lưu thất bại" }
      );
      if (!payload?.data || typeof payload.data !== "object") {
        throw new Error("Server trả về dữ liệu không đúng định dạng sau khi lưu.");
      }
      // Edits typed while the save was in flight stay on screen (and stay
      // "chưa lưu"); otherwise show the stored version.
      setContent((prev) => (prev === sent ? payload.data : prev));
      setOriginal(payload.data);
      setSavedAt(new Date());
      setResetAllDone(false);
      dismissSaveError();
      toast.success("Đã lưu nội dung trang", { href: savedEntry?.href || "/" });
    } catch (e) {
      const status = e?.status;
      const retry = { actionLabel: "Thử lại", onAction: () => saveLatestRef.current?.() };
      if (status === 401) {
        // Expired login: reloading here would throw the edits away. Log in
        // again in a new tab (the session cookie is shared), then retry.
        saveErrorToastRef.current = toast.error("Phiên đăng nhập đã hết hạn — chưa lưu được.", {
          key: SAVE_ERROR_TOAST_KEY,
          hint: "Đăng nhập ở tab mới rồi quay lại bấm “Thử lại” — thay đổi ở đây vẫn còn.",
          href: "/admin",
          hrefLabel: "Đăng nhập lại ở tab mới ↗",
          ...retry,
        });
      } else {
        // Server / network trouble: also offer the R2 check, like the
        // first-load error box does.
        const serverSide =
          status === null || status === undefined || status === 0 || status >= 500;
        saveErrorToastRef.current = toast.error(e?.message || "Lưu thất bại", {
          key: SAVE_ERROR_TOAST_KEY,
          hint: e?.hint || "",
          ...retry,
          ...(serverSide ? { href: "/api/admin/health", hrefLabel: "Kiểm tra kết nối R2 ↗" } : {}),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  // Discard / reset are locked while a save is in flight: they work from the
  // pre-save `original`, so mixing them with the save's result could put
  // the old text back on screen as "unsaved" (and a second save would
  // write it to the live site).
  const handleResetEntry = () => {
    if (!defaults || !content || saving) return;
    if (
      !window.confirm(
        `Khôi phục nội dung mặc định cho “${activeEntry.label}”?\nThay đổi chỉ được lưu khi bạn bấm “Lưu thay đổi”.`
      )
    ) {
      return;
    }
    updateContent((prev) => resetEntry(activeEntry, prev, defaults));
    setEditorNonce((n) => n + 1);
  };

  const handleResetAll = () => {
    if (!defaults || saving || !isResetWordTyped(resetAllText)) return;
    setContent(structuredClone(defaults));
    setResetAllText("");
    setResetAllDone(true);
    setEditorNonce((n) => n + 1);
  };

  const handleResetAllTextChange = (value) => {
    setResetAllText(value);
    setResetAllDone(false);
  };

  const handleDiscardEntry = () => {
    if (!original || !content || saving) return;
    if (!dirtyByEntry[activeEntry.id]) return;
    if (!window.confirm(`Hủy các thay đổi chưa lưu của “${activeEntry.label}”?`)) return;
    updateContent((prev) => discardEntry(activeEntry, prev, original));
    setEditorNonce((n) => n + 1);
  };

  const handleDiscardAll = () => {
    if (!original || !dirty || saving) return;
    if (!window.confirm("Hủy TẤT CẢ thay đổi chưa lưu?")) return;
    setContent(structuredClone(original));
    setResetAllDone(false);
    setEditorNonce((n) => n + 1);
    dismissSaveError();
    toast.info("Đã huỷ các thay đổi chưa lưu");
  };

  // ⌘/Ctrl+S saves — only while this tab is the one on screen, so the
  // shortcut never saves (or swallows the key for) a hidden panel.
  useEffect(() => {
    saveLatestRef.current = () => {
      if (dirty && !saving) handleSave();
    };
  });
  useEffect(() => {
    if (!active) return undefined;
    const handler = (event) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
      if (ctrlKey && (event.key === "s" || event.key === "S")) {
        event.preventDefault();
        saveLatestRef.current?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active]);

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

  const Editor = activeEntry.Editor;
  const mainPath = activeEntry.parts[0]?.path;
  const editorValue = mainPath ? getAt(content, mainPath) : undefined;
  const activeHiddenNote = entryHiddenNote(activeEntry, content);
  const activeDirty = Boolean(dirtyByEntry[activeEntry.id]);
  const advancedReset = (
    <AdvancedResetBox
      value={resetAllText}
      onChange={handleResetAllTextChange}
      onReset={handleResetAll}
      available={Boolean(defaults) && !saving}
      done={resetAllDone}
    />
  );

  return (
    <div>
      <div ref={stickySentinelRef} aria-hidden="true" className="-mb-px h-px" />
      {/* Sticky Save bar. The negative margins match Container's padding so
          the bar's background reaches past the content column's edges. On
          phones it stays on one row (short "Hủy" label). */}
      <div
        ref={toolbarRef}
        className={`sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-2 border-b bg-white/90 px-4 py-2 backdrop-blur-sm transition-shadow sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 ${
          toolbarStuck
            ? "border-gray-200 shadow-[0_8px_16px_-12px_rgba(0,0,0,0.3)]"
            : "border-transparent"
        }`}
      >
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
              {dirtyCount > 0 ? (
                `${dirtyCount} mục chưa lưu`
              ) : (
                <>
                  <span className="sm:hidden">Chưa lưu</span>
                  <span className="hidden sm:inline">Có thay đổi chưa lưu</span>
                </>
              )}
            </motion.span>
          ) : savedAt ? (
            <motion.span
              key="saved"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-gray-500"
            >
              Lưu lần cuối {formatClock(savedAt)}
            </motion.span>
          ) : null}
        </AnimatePresence>
        <button
          type="button"
          onClick={handleDiscardAll}
          disabled={!dirty || saving}
          aria-label="Hủy mọi thay đổi"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          title="Bỏ mọi thay đổi chưa lưu, quay về bản đã lưu gần nhất"
        >
          <span className="sm:hidden">Hủy</span>
          <span className="hidden sm:inline">Hủy mọi thay đổi</span>
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded-lg bg-black px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          title="Phím tắt: ⌘/Ctrl + S"
        >
          {saving ? "Đang lưu..." : dirty ? "Lưu thay đổi" : "Đã lưu"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Desktop: sticky below the Save bar, with its own scroll when the
            list is taller than the window (every group stays reachable). */}
        <aside
          ref={sidebarRef}
          className="space-y-4 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain"
        >
          <div className="lg:hidden">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">
              Chọn phần cần sửa
            </label>
            <select
              value={activeEntry.id}
              onChange={(event) => setActiveId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
            >
              {ENTRY_GROUPS.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  {ENTRIES.filter((entry) => entry.group === group.key).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {dirtyByEntry[entry.id] ? "● " : ""}
                      {entry.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <nav className="hidden flex-col rounded-2xl border border-gray-200 p-2 lg:flex">
            {ENTRY_GROUPS.map((group, groupIdx) => (
              <div key={group.key} className={groupIdx > 0 ? "mt-3" : ""}>
                <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  {group.label}
                </div>
                <div className="flex flex-col gap-1">
                  {ENTRIES.filter((entry) => entry.group === group.key).map((entry) => {
                    const isActive = activeEntry.id === entry.id;
                    const isDirty = dirtyByEntry[entry.id];
                    const hiddenNote = entryHiddenNote(entry, content);
                    const caption = `Hiện ở: ${entry.where}`;
                    return (
                      <div
                        key={entry.id}
                        className={`relative rounded-lg transition ${
                          isActive ? "bg-black text-white" : "text-gray-800 hover:bg-gray-100"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveId(entry.id)}
                          aria-current={isActive ? "true" : undefined}
                          className="block w-full rounded-lg px-3 py-2 text-left"
                        >
                          <span className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm">{entry.label}</span>
                            {hiddenNote ? (
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${
                                  isActive ? "bg-white/15 text-amber-200" : "bg-amber-100 text-amber-800"
                                }`}
                                title={hiddenNote}
                              >
                                đang ẩn
                              </span>
                            ) : null}
                            {isDirty ? (
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  isActive ? "bg-amber-300" : "bg-amber-500"
                                }`}
                                title="Có thay đổi chưa lưu"
                              />
                            ) : null}
                          </span>
                          <span
                            className={`mt-0.5 block pr-[4.75rem] text-[11px] leading-snug ${
                              isActive ? "text-gray-300" : "text-gray-500"
                            }`}
                            title={caption}
                          >
                            {caption}
                          </span>
                        </button>
                        <a
                          href={entry.href}
                          target="_blank"
                          rel="noreferrer"
                          className={`absolute bottom-2 right-3 text-[11px] font-medium hover:underline ${
                            isActive ? "text-white" : "text-gray-600"
                          }`}
                          title="Mở trang này trong tab mới"
                        >
                          Mở trang ↗
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="hidden lg:block">{advancedReset}</div>
        </aside>

        <section className="min-w-0 rounded-2xl border border-gray-200 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  ref={editorHeadingRef}
                  tabIndex={-1}
                  className="scroll-mt-2 text-lg font-semibold focus:outline-none"
                >
                  {activeEntry.label}
                </h2>
                {activeDirty ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    chưa lưu
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-gray-600">
                Hiện ở: {activeEntry.whereLong || activeEntry.where}.{" "}
                <a
                  href={activeEntry.href}
                  target="_blank"
                  rel="noreferrer"
                  className="whitespace-nowrap font-medium text-black underline underline-offset-2"
                >
                  Mở trang ↗
                </a>
              </p>
              {activeHiddenNote ? (
                <p className="mt-1 text-xs font-medium text-amber-700">{activeHiddenNote}.</p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handleDiscardEntry}
                disabled={!activeDirty || saving}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="Bỏ thay đổi chưa lưu của phần này"
              >
                Hủy thay đổi
              </button>
              <button
                type="button"
                onClick={handleResetEntry}
                disabled={!defaults || saving}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="Đưa phần này về nội dung ban đầu"
              >
                Khôi phục mặc định
              </button>
            </div>
          </div>
          {activeEntry.note ? (
            <div className="mb-4">
              <InfoNote>{activeEntry.note}</InfoNote>
            </div>
          ) : null}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeEntry.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            >
              {Editor ? (
                <Editor
                  key={editorNonce}
                  value={editorValue ?? {}}
                  onChange={(next) => updateContent((prev) => setAt(prev, mainPath, next))}
                  // Composite / cross-key editors (Chân trang & liên hệ, the
                  // Dịch vụ switch, Liên hệ) read `content` and write through
                  // `updateContent`; the others ignore these.
                  content={content}
                  updateContent={updateContent}
                  goTo={goTo}
                />
              ) : (
                <p className="text-sm text-gray-500">Phần này chưa có trình sửa.</p>
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        {/* Phones: the sidebar sits above the editor, so keep the
            whole-site reset at the very bottom instead. */}
        <div className="lg:hidden">{advancedReset}</div>
      </div>
    </div>
  );
}
