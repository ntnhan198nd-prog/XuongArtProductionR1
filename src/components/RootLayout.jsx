"use client";
import { usePathname } from "next/navigation";
import {
  motion,
  MotionConfig,
  useReducedMotion,
  AnimatePresence,
  useScroll,
  useTransform,
  useMotionValueEvent,
} from "framer-motion";
import Container from "./Container";
import Link from "next/link";
import Logo from "./Logo";
import Button from "./Button";
import clsx from "clsx";
import Footer from "./Footer";
import { useState, useEffect, useRef } from "react";

const isVideosActive = (pathname) =>
  pathname === "/videos" || pathname.startsWith("/videos/");

const Header = ({ invert = false, mobileMenuOpen, setMobileMenuOpen }) => {
  const pathname = usePathname() || "";
  const activeVideo = isVideosActive(pathname);
  const activeImages = pathname.startsWith("/images");
  const activeWhoWeAre = pathname === "/whoweare";

  // Cross-component "the user is hinting at this nav target" channel.
  // FeaturedCtaLink (homepage) dispatches `nav-hint` on hover/focus with
  // its href; the header lights up the matching link in accent so the
  // visitor sees that the on-page CTA leads to the same place as the
  // top nav. null payload clears the highlight.
  const [hintedHref, setHintedHref] = useState(null);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = (event) => setHintedHref(event.detail || null);
    window.addEventListener("nav-hint", handler);
    return () => window.removeEventListener("nav-hint", handler);
  }, []);
  const hintedVideo = hintedHref === "/videos";

  // Body scroll lock + close on Escape are handled at the layout level so the
  // menu can be portaled outside the fixed header stacking context.

  return (
    <Container>
      <div className="flex items-center justify-between h-20">
        {/* Logo */}
        <Link
          href={"/"}
          aria-label="Home"
          className="flex items-center h-full transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-95"
        >
          <Logo invert={invert} className="text-xl sm:text-2xl">XUONGART</Logo>
        </Link>
        <div className="flex items-center gap-x-8 h-full">
          <nav className="hidden md:flex items-center gap-x-6 h-full">
            <Link
              href="/videos"
              aria-current={activeVideo ? "page" : undefined}
              // The `hintedVideo` branch reacts to the FeaturedCtaLink
              // hover/focus event so this link previews its target state
              // (accent colour + 1.05 scale) at the exact moment the
              // homepage CTA is being considered. hover:scale-105 still
              // covers the case where the user is actually pointing at
              // -động itself.
              className={clsx(
                "text-base font-medium transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-[0.88] flex items-center h-full px-2.5",
                hintedVideo && "scale-105",
                activeVideo || hintedVideo
                  ? "text-accent-400"
                  : invert
                  ? "text-white hover:text-accent-400"
                  : "text-neutral-950 hover:text-accent-400"
              )}
            >
              -động
            </Link>
            <Link
              href="/images"
              aria-current={activeImages ? "page" : undefined}
              className={clsx(
                "text-base font-medium transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-[0.88] flex items-center h-full px-2.5",
                activeImages
                  ? "text-accent-400"
                  : invert
                  ? "text-white hover:text-accent-400"
                  : "text-neutral-950 hover:text-accent-400"
              )}
            >
              -tĩnh
            </Link>
          </nav>
          <div className="flex items-center h-full gap-x-4">
            <div className="hidden md:block">
              <Button
                href={"/whoweare"}
                invert={invert}
                aria-current={activeWhoWeAre ? "page" : undefined}
                className={clsx(
                  "text-sm sm:text-base px-4 sm:px-5 py-2",
                  activeWhoWeAre && "!text-accent-400"
                )}
              >
                -whoweare
              </Button>
            </div>
            
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={clsx(
                "md:hidden inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.85]",
                invert ? "text-white hover:bg-white/10" : "text-neutral-950 hover:bg-neutral-100"
              )}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

    </Container>
  );
};

// Full-screen mobile menu rendered at the top level so it escapes the fixed
// header's stacking context (the header is z-50 with `transform`/`backdrop-blur`
// which created a containing block that clipped a previously-nested menu).
const MobileMenu = ({ open, onClose }) => {
  const pathname = usePathname() || "";
  const activeVideo = isVideosActive(pathname);
  const activeImages = pathname.startsWith("/images");
  const activeWhoWeAre = pathname === "/whoweare";

  // Body scroll lock + Escape to close.
  useEffect(() => {
    if (!open) return;
    const docEl = document.documentElement;
    const prevOverflow = docEl.style.overflow;
    docEl.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      docEl.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="mobile-menu-container fixed inset-0 z-[200] flex items-center justify-center bg-white md:hidden"
        >
          {/* Close button — floats top-right, always visible */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-900 shadow-sm transition active:scale-90 hover:bg-neutral-100"
            aria-label="Đóng menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Centred content stack */}
          <div className="flex w-full flex-col items-center gap-10 px-6">
            <Link href={"/"} onClick={onClose} aria-label="Home">
              <Logo className="text-3xl">XUONGART</Logo>
            </Link>

            <nav className="flex flex-col items-center gap-3">
              <Link
                href="/videos"
                onClick={onClose}
                aria-current={activeVideo ? "page" : undefined}
                className={clsx(
                  "text-base font-medium transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.92]",
                  activeVideo ? "text-accent-400" : "text-neutral-950 hover:text-accent-400"
                )}
              >
                -động
              </Link>
              <Link
                href="/images"
                onClick={onClose}
                aria-current={activeImages ? "page" : undefined}
                className={clsx(
                  "text-base font-medium transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.92]",
                  activeImages ? "text-accent-400" : "text-neutral-950 hover:text-accent-400"
                )}
              >
                -tĩnh
              </Link>
            </nav>

            <Button
              href={"/whoweare"}
              onClick={onClose}
              aria-current={activeWhoWeAre ? "page" : undefined}
              className={clsx(
                "text-base px-6 py-3",
                activeWhoWeAre && "!text-accent-400"
              )}
            >
              -whoweare
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const RootLayoutInner = ({
  children,
  isHome,
  minimalFooter,
  footerContent,
  socialContent,
  ctaContent,
  showContactInFooter,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [overHero, setOverHero] = useState(isHome);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [vh, setVh] = useState(800);
  // The footer is rendered out of the scroll column and pinned to the
  // viewport bottom, with the main content stacked on top so it covers
  // the footer until the user scrolls into the reveal zone (Apple-style
  // parallax). footerHeight is the size of that reveal zone — kept in
  // sync via ResizeObserver so swapping minimal vs full footer or
  // resizing the window updates the page padding without a refresh.
  const [footerHeight, setFooterHeight] = useState(0);
  const footerRef = useRef(null);
  const { scrollY } = useScroll();

  useEffect(() => {
    const el = footerRef.current;
    if (!el) return undefined;
    const update = () => setFooterHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minimalFooter]);

  // Track viewport height (for hero-fade range). Updated on mount + resize so SSR
  // doesn't crash. 800 is a reasonable default before hydration.
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Scroll-driven opacity: header bg fades in continuously between 50%–90% of the
  // hero (viewport height). Gradient overlay fades out across the same range so
  // the two layers cross-fade smoothly instead of snapping.
  const fadeStart = vh * 0.5;
  const fadeEnd = vh * 0.9;
  const rawBgOpacity = useTransform(scrollY, [fadeStart, fadeEnd], [0, 1], {
    clamp: true,
  });
  const rawGradientOpacity = useTransform(scrollY, [fadeStart, fadeEnd], [1, 0], {
    clamp: true,
  });
  // On non-home pages: lock bg fully opaque, gradient hidden.
  const bgOpacity = isHome ? rawBgOpacity : 1;
  const gradientOpacity = isHome ? rawGradientOpacity : 0;

  // Text-invert flips at the midpoint of the fade so links read against whichever
  // background is dominant. Avoids the "white-on-white" mid-transition glitch.
  const flipPoint = vh * 0.7;
  useMotionValueEvent(scrollY, "change", (latest) => {
    if (!isHome) {
      if (overHero) setOverHero(false);
      return;
    }
    const next = latest < flipPoint;
    if (next !== overHero) setOverHero(next);
  });

  useEffect(() => {
    if (!isHome) {
      setOverHero(false);
    } else if (typeof window !== "undefined") {
      setOverHero(window.scrollY < flipPoint);
    }
  }, [isHome, flipPoint]);

  return (
    <MotionConfig transition={shouldReduceMotion ? { duration: 0 } : undefined}>
      <header>
        {/* Noise overlay */}
        <div className="noise-overlay" />
        <div className="fixed left-0 right-0 top-0 z-50 header-interactive">
          {/* Top-of-page dark gradient — visible when over the hero, fades out as
              the solid bg below fades in. */}
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 via-black/20 to-transparent"
            style={{ opacity: gradientOpacity }}
          />
          {/* Solid frosted bg — invisible at the top of home, fades in past the
              hero. Backdrop-blur and shadow ride along on the same opacity so
              they all transition in lockstep. */}
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-white/90 shadow-[0_1px_0_rgba(0,0,0,0.06)] backdrop-blur-md"
            style={{ opacity: bgOpacity }}
          />
          {/* Header content sits above the layers */}
          <div className="relative">
            <Header
              invert={overHero}
              mobileMenuOpen={mobileMenuOpen}
              setMobileMenuOpen={setMobileMenuOpen}
            />
          </div>
        </div>
      </header>
      <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      {/* Outer wrapper still carries bg-white so the dark <html> body never
          peeks through during route transitions. paddingBottom matches
          footerHeight so the page can scroll just past the content into
          the reveal zone where the fixed footer (below) becomes visible.
          Motion.div is z-10 with bg-white — it covers the fixed footer
          while it overlaps in viewport, then lifts above as the user
          scrolls into the reveal zone. */}
      <div
        className="relative flex flex-auto overflow-hidden bg-white pt-20"
        style={{ paddingBottom: footerHeight }}
      >
        <motion.div
          className="relative z-10 isolate flex w-full flex-col bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
        >
          <main className="w-full flex-auto">{children}</main>
        </motion.div>
      </div>
      {/* Pages where the social + contact info already lives elsewhere
          (homepage CTA banner, gallery focus, /whoweare) get the minimal
          footer — logo + copyright only. /contact and friends still get
          the full footer with FooterNavigation + Newsletter.

          Pinned to the viewport bottom and sitting behind the main content
          (z-0 vs the motion column's z-10) so it stays put while the user
          scrolls — the content slides over it like an overlay. */}
      {/* No bg here — Footer applies its own (white normally, dark on the
          homepage) so the inverse-coloured variant doesn't get a white
          underlay peeking through during scroll-reveal. */}
      <div
        ref={footerRef}
        className="fixed bottom-0 left-0 right-0 z-0"
      >
        <Footer
          content={footerContent}
          social={socialContent}
          cta={ctaContent}
          minimal={minimalFooter}
          showContact={showContactInFooter}
        />
      </div>
    </MotionConfig>
  );
};

const RootLayout = ({ children, footerContent, socialContent, ctaContent }) => {
  const pathName = usePathname();
  const isHome = pathName === "/";
  // Routes that show the minimal footer (logo + copyright only). Gallery
  // routes end with the masonry/grid as the visual closer; /contact already
  // has the CTA banner with full contact info, so the footer's nav +
  // "Liên hệ nhanh" columns would just repeat what's directly above.
  const minimalFooter =
    isHome ||
    pathName === "/videos" ||
    pathName.startsWith("/videos/") ||
    pathName === "/images" ||
    pathName.startsWith("/images/") ||
    pathName === "/whoweare";
  // The dark contact band appears below the bottom strip on the homepage,
  // taking the place of the CTA banner that used to live in the page
  // itself. /whoweare already renders the full CTA section above the
  // footer, so showing the contact info again in the footer would just
  // duplicate it.
  const showContactInFooter = isHome;
  return (
    <RootLayoutInner
      key={pathName}
      isHome={isHome}
      minimalFooter={minimalFooter}
      footerContent={footerContent}
      socialContent={socialContent}
      ctaContent={ctaContent}
      showContactInFooter={showContactInFooter}
    >
      {children}
    </RootLayoutInner>
  );
};

export default RootLayout;
