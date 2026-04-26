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

const Header = ({ invert = false }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu when clicking outside
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleClickOutside = (event) => {
      if (!event.target.closest('.mobile-menu-container')) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [mobileMenuOpen]);

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
              className={clsx(
                "text-sm font-medium transition-colors duration-200 flex items-center h-full px-2",
                invert ? "text-white hover:text-accent-400" : "text-neutral-950 hover:text-accent-400"
              )}
            >
              Dự án
            </Link>
            <Link 
              href="/portfolio/images" 
              className={clsx(
                "text-sm font-medium transition-colors duration-200 flex items-center h-full px-2",
                invert ? "text-white hover:text-accent-400" : "text-neutral-950 hover:text-accent-400"
              )}
            >
              Dự án hình ảnh
            </Link>
          </nav>
          <div className="flex items-center h-full gap-x-4">
            <div className="hidden md:block">
              <Button href={"/contact"} invert={invert} className="text-xs sm:text-sm px-3 sm:px-4 py-1.5">
                Who We Are ?
              </Button>
            </div>
            
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={clsx(
                "md:hidden p-2 rounded-md transition-colors",
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

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.3 }}
              className="mobile-menu-container fixed right-0 top-0 h-full w-[280px] bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col h-full p-6">
                <div className="flex items-center justify-between mb-8">
                  <Link href={"/"} onClick={() => setMobileMenuOpen(false)}>
                    <Logo className="text-2xl">XUONGART</Logo>
                  </Link>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 hover:bg-neutral-100 rounded-md"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <nav className="flex flex-col gap-4 flex-1">
                  <Link 
                    href="/portfolio"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-lg font-medium text-neutral-950 hover:text-accent-400 transition-colors py-2 border-b border-neutral-100"
                  >
                    Dự án
                  </Link>
                  <Link 
                    href="/portfolio/images"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-lg font-medium text-neutral-950 hover:text-accent-400 transition-colors py-2 border-b border-neutral-100"
                  >
                    Dự án hình ảnh
                  </Link>
                </nav>
                
                <div className="mt-4 pt-4 border-t border-neutral-200">
                  <Button href={"/contact"} className="w-full text-center">
                    Who We Are ?
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Container>
  );
};

const RootLayoutInner = ({ children, isHome }) => {
  const shouldReduceMotion = useReducedMotion();
  const [pastHero, setPastHero] = useState(!isHome);

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
          <Header invert={overHero} />
        </div>
      </header>
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
          <Footer />
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
};

const RootLayout = ({ children }) => {
  const pathName = usePathname();
  const isHome = pathName === "/";
  return (
    <RootLayoutInner key={pathName} isHome={isHome}>
      {children}
    </RootLayoutInner>
  );
};

export default RootLayout;
