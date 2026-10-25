// Shared by the "Nội dung trang" editor (SiteContentAdminPanel +
// SitePreviewFrame) and the live preview page (/admin/preview): the
// postMessage protocol between them and small pure helpers that mirror how
// the public components turn site content into text. No React, no DOM, so
// both sides (and plain Node tests) can import it.

import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from "@/lib/siteContent";

export const PREVIEW_PATH = "/admin/preview";
// Panel → preview: { type, site, entry }.
export const PREVIEW_DRAFT_TYPE = "xuongart:site-draft";
// Preview → panel, once the listener is in place: { type }.
export const PREVIEW_READY_TYPE = "xuongart:preview-ready";
// Preview → panel: ⌘/Ctrl+S pressed while the preview has focus: { type }.
export const PREVIEW_SAVE_TYPE = "xuongart:preview-save";

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Which public block(s) the preview shows for each editor entry id (see
// ENTRIES in SiteContentAdminPanel). Unknown ids → null (preview shows a
// short hint instead of guessing).
const SECTION_BY_ENTRY = {
  hero: "home.hero",
  featuredHeader: "home.featuredHeader",
  stats: "home.stats",
  clients: "home.clients",
  intro: "home.intro",
  "about.sections": "about.page",
  "about.hero": "about.hero",
  "about.founder": "about.founder",
  "about.values": "about.values",
  "about.process": "about.process",
  "about.testimonials": "about.testimonials",
  services: "about.services",
  "about.cta": "about.cta",
  portfolio: "gallery.portfolio",
  contact: "global.footer",
  ui: "global.ui",
};

export function previewSectionFor(entryId) {
  return typeof entryId === "string" && Object.prototype.hasOwnProperty.call(SECTION_BY_ENTRY, entryId)
    ? SECTION_BY_ENTRY[entryId]
    : null;
}

// Validate one `message` event received by the preview page. Only drafts
// posted by the admin page that embeds it are accepted: same origin AND sent
// by the parent window. Returns { site (normalized), entry } or null.
export function parsePreviewMessage(event, { origin, parent } = {}) {
  if (!event || !origin || event.origin !== origin) return null;
  if (!parent || event.source !== parent) return null;
  const data = event.data;
  if (!isPlainObject(data) || data.type !== PREVIEW_DRAFT_TYPE) return null;
  if (!isPlainObject(data.site)) return null;
  const entry = typeof data.entry === "string" ? data.entry.slice(0, 100) : "";
  return { site: normalizeSiteContent(data.site), entry };
}

// Type of a `message` event received by the admin page from its preview
// iframe (`frameWindow` = iframe.contentWindow): PREVIEW_READY_TYPE,
// PREVIEW_SAVE_TYPE, or null for anything else / any other sender.
export function previewFrameMessageType(event, { origin, frameWindow } = {}) {
  if (!event || !origin || event.origin !== origin) return null;
  if (!frameWindow || event.source !== frameWindow) return null;
  const type = isPlainObject(event.data) ? event.data.type : null;
  return type === PREVIEW_READY_TYPE || type === PREVIEW_SAVE_TYPE ? type : null;
}

// ---------------------------------------------------------------------------
// Inline previews inside the editor.

// Heading = main part + accent part (text-accent-400). Hero and Services
// fall back to the default text when a part is empty (HeroShowreel's c(),
// Services' `||`); the featured header and the intro print what is stored.
const HEADING_FALLS_BACK = { hero: true, services: true, featuredHeader: false, intro: false };

export function accentHeadingParts(kind, value) {
  if (!Object.prototype.hasOwnProperty.call(HEADING_FALLS_BACK, kind)) return null;
  const shown = normalizeSiteContent({ [kind]: isPlainObject(value) ? value : {} })[kind] || {};
  const defaults = DEFAULT_SITE_CONTENT[kind] || {};
  if (HEADING_FALLS_BACK[kind]) {
    return {
      main: shown.headingMain || defaults.headingMain || "",
      accent: shown.headingAccent || defaults.headingAccent || "",
    };
  }
  return { main: shown.headingMain ?? "", accent: shown.headingAccent ?? "" };
}

// Final number the homepage Stats counter settles on for one row, e.g.
// "1.2M". Same steps as the public page: the row goes through the site
// normalizer, then Counter's `decimals > 0 ? toFixed : round` + suffix.
// null when the row would be dropped or cannot be shown.
export function formatStatDisplay(item) {
  const row = normalizeSiteContent({ stats: { items: [item] } }).stats.items[0];
  if (!row) return null;
  const decimals = row.decimals || 0;
  try {
    const formatted =
      decimals > 0 ? row.value.toFixed(decimals) : Math.round(row.value).toString();
    return `${formatted}${row.suffix ?? ""}`;
  } catch {
    // toFixed() throws for an out-of-range number of decimals.
    return null;
  }
}

// Decimals the stats editor warns about. "error": the homepage Counter's
// toFixed() throws (more than 100), which would break the homepage; "warn":
// valid but unusual (more than 3, e.g. 1.2000000000000000177M). null = fine.
export const STAT_DECIMALS_WARN_ABOVE = 3;

export function statDecimalsLevel(item) {
  const row = normalizeSiteContent({ stats: { items: [item] } }).stats.items[0];
  if (!row) return null;
  if (formatStatDisplay(item) === null) return "error";
  return (row.decimals || 0) > STAT_DECIMALS_WARN_ABOVE ? "warn" : null;
}

// True when a stats list would make the homepage counter throw.
export function statsHaveBrokenDecimals(stats) {
  const items = isPlainObject(stats) && Array.isArray(stats.items) ? stats.items : [];
  return items.some((item) => statDecimalsLevel(item) === "error");
}
