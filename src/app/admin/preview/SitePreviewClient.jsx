"use client";

import { useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import Clients from "@/components/Clients";
import FadeIn from "@/components/FadeIn";
import FeaturedCtaLink from "@/components/FeaturedCtaLink";
import Footer from "@/components/Footer";
import HeroShowreel from "@/components/HeroShowreel";
import Container from "@/components/Container";
import Services from "@/components/Services";
import Stats from "@/components/Stats";
import { SiteContentProvider } from "@/components/SiteContentProvider";
import {
  AboutCta,
  AboutFounder,
  AboutHero,
  AboutProcess,
  AboutTestimonials,
  AboutValues,
  WhoWeAreSections,
  resolveButtonHref,
} from "@/components/WhoWeAreSections";
import {
  PREVIEW_READY_TYPE,
  PREVIEW_SAVE_TYPE,
  parsePreviewMessage,
  previewSectionFor,
} from "./previewShared";

// Live preview of the "Nội dung trang" draft. The admin page embeds this
// route in an iframe and posts the unsaved content; nothing is fetched or
// written here — every block is the public component fed with the draft.

function PreviewNote({ children, tone = "gray" }) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-neutral-200 bg-neutral-50 text-neutral-600";
  return (
    <div className="px-4 pt-4 sm:px-6">
      <p className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${cls}`}>{children}</p>
    </div>
  );
}

// framer-motion's whileInView / useInView use IntersectionObserver with no
// root. Inside a same-origin iframe that means the TOP window's viewport
// (and its rootMargin), so in the admin's side column or bottom sheet the
// fade-ins and counters could stay hidden or at 0. Here the preview is the
// whole window, so report every observed element as in view right away
// (asynchronously, like a real observer). Returns a restore function.
export function installInstantInView(win) {
  if (!win || typeof win.IntersectionObserver !== "function") return () => {};
  const Original = win.IntersectionObserver;
  class InstantIntersectionObserver {
    constructor(callback, options = {}) {
      this._callback = callback;
      this._targets = new Set();
      this.root = options.root ?? null;
      this.rootMargin = options.rootMargin ?? "0px";
      this.thresholds = [].concat(options.threshold ?? 0);
    }
    observe(target) {
      if (!target || this._targets.has(target)) return;
      this._targets.add(target);
      Promise.resolve().then(() => {
        if (!this._targets.has(target)) return;
        const rect = typeof target.getBoundingClientRect === "function" ? target.getBoundingClientRect() : null;
        this._callback(
          [
            {
              target,
              isIntersecting: true,
              intersectionRatio: 1,
              boundingClientRect: rect,
              intersectionRect: rect,
              rootBounds: null,
              time: Date.now(),
            },
          ],
          this
        );
      });
    }
    unobserve(target) {
      this._targets.delete(target);
    }
    disconnect() {
      this._targets.clear();
    }
    takeRecords() {
      return [];
    }
  }
  win.IntersectionObserver = InstantIntersectionObserver;
  return () => {
    if (win.IntersectionObserver === InstantIntersectionObserver) win.IntersectionObserver = Original;
  };
}

function sectionFlag(site, key) {
  const list = Array.isArray(site?.about?.sections) ? site.about.sections : [];
  return list.find((section) => section.key === key) || null;
}

// The public page gives the first visible block the <h1>.
function headingTagFor(site, key) {
  const list = Array.isArray(site?.about?.sections) ? site.about.sections : [];
  const first = list.find((section) => section.enabled);
  return first && first.key === key ? "h1" : "h2";
}

const hasItems = (list) => Array.isArray(list) && list.length > 0;

// Same "renders nothing" tests as the public components, so the preview
// can say why a block is blank instead of showing an empty page.
const ABOUT_PART_EMPTY = {
  hero: (c) =>
    !c.eyebrow && !c.title && !c.lead && !hasItems(c.paragraphs) && !(c.showStats && hasItems(c.stats)),
  founder: (c) => !c.name && !hasItems(c.story) && !c.quote,
  values: (c) => !hasItems(c.items),
  process: (c) => !hasItems(c.steps),
  testimonials: (c) => !hasItems(c.items),
  cta: (c) =>
    !c.heading && !(c.buttonText && resolveButtonHref(c.buttonUrl)) && !c.showSocial && !c.tagline &&
    !c.officeName && !c.address && !c.phone && !c.email,
};

const ABOUT_PART_COMPONENTS = {
  hero: AboutHero,
  founder: AboutFounder,
  values: AboutValues,
  process: AboutProcess,
  testimonials: AboutTestimonials,
  cta: AboutCta,
};

function AboutPartPreview({ site, part }) {
  const Component = ABOUT_PART_COMPONENTS[part];
  const content = site.about[part];
  const flag = sectionFlag(site, part);
  // AboutCta falls back to the shared contact, so judge it on the merged
  // values like the public block does.
  const judged =
    part === "cta"
      ? {
          ...content,
          officeName: content.officeName || site.cta?.officeName,
          address: content.address || site.cta?.address,
          phone: content.phone || site.cta?.phone,
          email: content.email || site.cta?.email,
        }
      : content;
  const empty = ABOUT_PART_EMPTY[part](judged);
  return (
    <>
      {flag && !flag.enabled ? (
        <PreviewNote tone="amber">
          Phần này đang tắt nên chưa hiện trên trang Về chúng tôi (bật lại ở mục Bố cục &amp; thứ tự).
        </PreviewNote>
      ) : null}
      {empty ? (
        <PreviewNote tone="amber">Chưa có nội dung nên phần này chưa hiện trên trang.</PreviewNote>
      ) : null}
      <Component
        content={content}
        shared={site.cta}
        social={site.social}
        headingTag={headingTagFor(site, part)}
      />
    </>
  );
}

// Mirrors the "Dự án nổi bật" heading in src/app/page.jsx (that markup is
// inline in the page, so it is repeated here). The video grid needs live
// project data, which the draft does not carry.
function FeaturedHeaderPreview({ content }) {
  return (
    <>
      <div id="projects-section" className="scroll-mt-20">
        <div className="mx-auto mt-20 w-[92vw] px-4 sm:mt-28 lg:w-[80vw] lg:px-6">
          <FadeIn>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
              <div className="max-w-3xl">
                <div className="flex items-center gap-4">
                  <span className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-accent-400">
                    {content.eyebrow}
                  </span>
                  <span className="h-px flex-1 bg-neutral-200" />
                </div>
                <h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-neutral-950 sm:text-4xl md:text-5xl [text-wrap:balance]">
                  {content.headingMain}{" "}
                  <span className="text-accent-400">{content.headingAccent}</span>
                </h2>
              </div>
              <FeaturedCtaLink />
            </div>
          </FadeIn>
        </div>
      </div>
      <PreviewNote>
        Video trong lưới: bật ★ Nổi bật ở thẻ Video, xếp vị trí ở thẻ Trang chủ — xem trên trang thật.
      </PreviewNote>
    </>
  );
}

// Mirrors the closing intro block in src/app/page.jsx.
function IntroPreview({ content }) {
  return (
    <div id="intro" className="scroll-mt-20">
      <Container className="mt-20 pb-24 sm:mt-28 sm:pb-32 md:pb-40">
        <FadeIn className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-4xl font-medium tracking-tight text-neutral-950 [text-wrap:balance] sm:text-5xl md:text-6xl">
            {content.headingMain}{" "}
            <span className="text-accent-400">{content.headingAccent}</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base text-neutral-600 sm:text-lg">
            {content.description}
          </p>
        </FadeIn>
      </Container>
    </div>
  );
}

function CategoryChips({ title, items }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      {hasItems(items) ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((item, idx) => (
            <li key={`${item}-${idx}`} className="rounded-full border border-neutral-200 px-3 py-1 text-sm text-neutral-800">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">Để trống — trang tự lấy thể loại từ các dự án.</p>
      )}
    </div>
  );
}

function PreviewLabel({ children }) {
  return (
    <p className="px-4 pt-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 sm:px-6">
      {children}
    </p>
  );
}

// The public block(s) for one editor entry, fed with the (normalized) draft.
export function PreviewSection({ site, entry }) {
  const section = previewSectionFor(entry);
  switch (section) {
    case "home.hero":
      return (
        <>
          {/* HeroShowreel slides 80px up under the public header (-mt-20);
              there is no header here, so give that space back. The client
              scrolls to this block's bottom, where the title sits. The note
              goes after it so it never pushes the title down. */}
          <div className="pt-20" data-preview-hero="">
            <HeroShowreel content={site.hero} />
          </div>
          <PreviewNote>
            Video nền lấy từ thẻ Trang chủ — ở đây chỉ hiện nền tạm, xem video trên trang thật.
          </PreviewNote>
        </>
      );
    case "home.featuredHeader":
      return <FeaturedHeaderPreview content={site.featuredHeader} />;
    case "home.stats":
      return (
        <div id="stats" className="scroll-mt-20">
          <Stats content={site.stats} />
        </div>
      );
    case "home.clients":
      return (
        <div id="clients" className="scroll-mt-20">
          <Clients content={site.clients} />
        </div>
      );
    case "home.intro":
      return <IntroPreview content={site.intro} />;
    case "about.page":
      return <WhoWeAreSections site={site} />;
    case "about.hero":
    case "about.founder":
    case "about.values":
    case "about.process":
    case "about.testimonials":
    case "about.cta":
      return <AboutPartPreview site={site} part={section.slice("about.".length)} />;
    case "about.services": {
      const flag = sectionFlag(site, "services");
      return (
        <>
          {flag && !flag.enabled ? (
            <PreviewNote tone="amber">
              Khối Dịch vụ đang tắt nên chưa hiện trên trang Về chúng tôi.
            </PreviewNote>
          ) : null}
          <div id="services" className="scroll-mt-20">
            <Services content={site.services} />
          </div>
        </>
      );
    }
    case "global.footer":
      return (
        <>
          <PreviewLabel>Cuối trang chủ</PreviewLabel>
          <div className="mt-3">
            <Footer content={site.footer} social={site.social} cta={site.cta} minimal showContact />
          </div>
          <PreviewLabel>Cuối các trang khác (-động, -tĩnh, Về chúng tôi)</PreviewLabel>
          <Footer content={site.footer} social={site.social} cta={site.cta} minimal />
        </>
      );
    case "gallery.portfolio":
      return (
        <>
          <PreviewNote>
            Các thể loại này hiện trong menu của ô tìm kiếm ở trang -động và -tĩnh — xem menu thật trên trang.
          </PreviewNote>
          <div className="px-4 sm:px-6">
            <CategoryChips title="Trang -động (video)" items={site.portfolio.searchCategories} />
            <CategoryChips title="Trang -tĩnh (hình ảnh)" items={site.portfolio.imageSearchCategories} />
          </div>
        </>
      );
    case "global.ui":
      return (
        <>
          <PreviewNote>
            Dòng chữ này hiện ở trang -động, -tĩnh và lưới dự án trang chủ trong lúc chờ tải.
          </PreviewNote>
          <p className="px-4 py-16 text-center text-neutral-500 sm:px-6">{site.ui.loadingProjectsText}</p>
        </>
      );
    default:
      return <PreviewNote>Chọn một phần ở trang sửa để xem trước.</PreviewNote>;
  }
}

function blockLinkClicks(event) {
  if (event.target?.closest?.("a[href]")) event.preventDefault();
}

// What the preview shows for a given state. Exported for tests.
export function SitePreviewView({ draft, framed = true }) {
  if (!framed) {
    return (
      <PreviewNote>
        Trang này chỉ dùng để xem trước bên trong thẻ Nội dung trang của trang quản trị.
      </PreviewNote>
    );
  }
  if (!draft) {
    return <PreviewNote>Đang chờ bản nháp từ trang sửa…</PreviewNote>;
  }
  return (
    <SiteContentProvider value={draft.site}>
      {/* "always": transform animations jump to their end state, so blocks
          never slide while the owner types. Opacity still fades, and the
          in-view checks are answered by installInstantInView. */}
      <MotionConfig reducedMotion="always">
        {/* Links stay inert: following one would replace the preview with
            the live page. */}
        <div
          key={draft.entry}
          className="min-h-full bg-white text-neutral-950"
          onClickCapture={blockLinkClicks}
        >
          <PreviewSection site={draft.site} entry={draft.entry} />
          {/* A little room below the last block. */}
          <div aria-hidden="true" className="h-16" />
        </div>
      </MotionConfig>
    </SiteContentProvider>
  );
}

export default function SitePreviewClient() {
  const [draft, setDraft] = useState(null);
  const [framed, setFramed] = useState(true);

  useEffect(() => {
    if (window.parent === window) {
      setFramed(false);
      return undefined;
    }
    const restoreInView = installInstantInView(window);
    const origin = window.location.origin;
    const handler = (event) => {
      const next = parsePreviewMessage(event, { origin, parent: window.parent });
      if (next) setDraft(next);
    };
    // ⌘/Ctrl+S while the preview has focus saves in the editor (instead of
    // the browser's "save page" dialog).
    const onKey = (event) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (mod && (event.key === "s" || event.key === "S")) {
        event.preventDefault();
        window.parent.postMessage({ type: PREVIEW_SAVE_TYPE }, origin);
      }
    };
    window.addEventListener("message", handler);
    window.addEventListener("keydown", onKey);
    // Tell the editor the listener is ready, so it sends the first draft.
    window.parent.postMessage({ type: PREVIEW_READY_TYPE }, origin);
    return () => {
      window.removeEventListener("message", handler);
      window.removeEventListener("keydown", onKey);
      restoreInView();
    };
  }, []);

  // A different entry starts at the top of its block — except the homepage
  // banner (taller than the frame, title near its bottom): show its bottom
  // edge so the title and description being edited are in view. Only this
  // window scrolls (scrollIntoView could also scroll the admin page).
  const entry = draft?.entry;
  useEffect(() => {
    if (entry === undefined) return;
    const hero = previewSectionFor(entry) === "home.hero"
      ? document.querySelector("[data-preview-hero]")
      : null;
    if (hero) {
      const bottom = hero.getBoundingClientRect().bottom + window.scrollY;
      window.scrollTo(0, Math.max(0, bottom - window.innerHeight));
    } else {
      window.scrollTo(0, 0);
    }
  }, [entry]);

  return <SitePreviewView draft={draft} framed={framed} />;
}
