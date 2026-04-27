"use client";
import { usePathname } from "next/navigation";
import { motion, MotionConfig, useReducedMotion, AnimatePresence } from "framer-motion";
import Container from "./Container";
import Link from "next/link";
import Logo from "./Logo";
import Button from "./Button";
import clsx from "clsx";
import Footer from "./Footer";
import { useState, useEffect } from "react";

const isPortfolioVideoActive = (pathname) =>
  pathname === "/portfolio" || pathname.startsWith("/portfolio/");

const Header = ({ invert = false, mobileMenuOpen, setMobileMenuOpen }) => {
  const pathname = usePathname() || "";
  const activeVideo = isPortfolioVideoActive(pathname);
  const activeImages = pathname.startsWith("/images");
  const activeContact = pathname === "/contact";

  // Body scroll lock + close on Escape are handled at the layout level so the
  // menu can be portaled outside the fixed header stacking context.

  return (
    <Container>
      <div className="flex items-center justify-between h-20">
        {/* Logo */}
        <Link href={"/"} aria-label="Home" className="flex items-center h-full">
          <Logo invert={invert} className="text-xl sm:text-2xl">XUONGART</Logo>
        </Link>
        <div className="flex items-center gap-x-8 h-full">
          <nav className="hidden md:flex items-center gap-x-6 h-full">
            <Link
              href="/portfolio"
              aria-current={activeVideo ? "page" : undefined}
              className={clsx(
                "text-base font-medium transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.88] flex items-center h-full px-2.5",
                activeVideo
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
                "text-base font-medium transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.88] flex items-center h-full px-2.5",
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
                href={"/contact"}
                invert={invert}
                aria-current={activeContact ? "page" : undefined}
                className={clsx(
                  "text-sm sm:text-base px-4 sm:px-5 py-2",
                  activeContact && "!text-accent-400"
                )}
              >
                -whoweare
              </Button>
            </div>
            
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={clsx(
                "md:hidden p-2 rounded-md transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.85]",
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
  const activeVideo = isPortfolioVideoActive(pathname);
  const activeImages = pathname.startsWith("/images");
  const activeContact = pathname === "/contact";

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
                href="/portfolio"
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
              href={"/contact"}
              onClick={onClose}
              aria-current={activeContact ? "page" : undefined}
              className={clsx(
                "text-base px-6 py-3",
                activeContact && "!text-accent-400"
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

const RootLayoutInner = ({ children, isHome, footerContent, socialContent }) => {
  const shouldReduceMotion = useReducedMotion();
  const [pastHero, setPastHero] = useState(!isHome);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    // On non-home pages the header is always solid.
    if (!isHome) {
      setPastHero(true);
      return;
    }
    // Switch when user has scrolled past ~85% of the hero (viewport height).
    const onScroll = () => {
      setPastHero(window.scrollY > window.innerHeight * 0.85);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [isHome]);

  const overHero = isHome && !pastHero;

  return (
    <MotionConfig transition={shouldReduceMotion ? { duration: 0 } : undefined}>
      <header>
        {/* Noise overlay */}
        <div className="noise-overlay" />
        <div
          className={clsx(
            "fixed left-0 right-0 top-0 z-50 header-interactive transition-colors duration-300",
            overHero
              ? "bg-transparent"
              : "bg-white/90 backdrop-blur-md shadow-[0_1px_0_rgba(0,0,0,0.06)]"
          )}
        >
          {overHero && (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 via-black/20 to-transparent"
              aria-hidden="true"
            />
          )}
          {/* Header */}
          <Header
            invert={overHero}
            mobileMenuOpen={mobileMenuOpen}
            setMobileMenuOpen={setMobileMenuOpen}
          />
        </div>
      </header>
      <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <motion.div
        layout
        className="relative flex flex-auto overflow-hidden bg-white pt-20"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <motion.div
          layout
          className="relative isolate flex w-full flex-col pt-0"
        >
          <main className="w-full flex-auto">{children}</main>
          {/* Footer */}
          <Footer content={footerContent} social={socialContent} />
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
};

const RootLayout = ({ children, footerContent, socialContent }) => {
  const pathName = usePathname();
  const isHome = pathName === "/";
  return (
    <RootLayoutInner
      key={pathName}
      isHome={isHome}
      footerContent={footerContent}
      socialContent={socialContent}
    >
      {children}
    </RootLayoutInner>
  );
};

export default RootLayout;
