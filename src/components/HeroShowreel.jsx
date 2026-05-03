"use client";

import { useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { DEFAULT_SITE_CONTENT } from "@/lib/siteContent";

const HeroShowreel = ({ videoSrc, posterSrc, scrollTargetId = "projects-section", content }) => {
  const data = content || DEFAULT_SITE_CONTENT.hero;
  const c = (key) => data?.[key] || DEFAULT_SITE_CONTENT.hero[key];
  const handleScrollToProjects = () => {
    if (typeof document === "undefined") return;
    const target = document.getElementById(scrollTargetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: window.innerHeight, behavior: "smooth" });
    }
  };

  // Pause the showreel when the section scrolls out of view. Browsers
  // share a small pool of hardware video decoders; while the user is
  // browsing the gallery (12 cards × 1 decoder each), letting the hero
  // also keep decoding off-screen is wasted work — pausing it gives the
  // gallery videos a clear runway and the user comes back to the hero
  // with a fresh decoder slot when they scroll back to the top.
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const sectionInView = useInView(sectionRef, { amount: 0.1 });
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (sectionInView && (typeof document === "undefined" || !document.hidden)) {
      const promise = v.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {});
      }
    } else {
      v.pause();
    }
  }, [sectionInView]);

  return (
    <section
      ref={sectionRef}
      className="relative -mt-20 w-full overflow-hidden bg-neutral-950 text-white"
    >
      {/* Pull -mt-20 to slip under the fixed 80px header; fill the entire viewport */}
      <div className="relative w-full h-screen min-h-[560px]">
        {/* Background: real video if provided, else cinematic placeholder */}
        {videoSrc ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src={videoSrc}
            poster={posterSrc}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black" />
            <div
              className="absolute inset-0 opacity-70"
              style={{
                background:
                  "radial-gradient(ellipse at 25% 35%, rgba(232,163,61,0.22), transparent 55%), radial-gradient(ellipse at 75% 75%, rgba(232,163,61,0.10), transparent 60%)",
              }}
            />
            <motion.div
              aria-hidden="true"
              initial={{ x: "-10%", y: "-5%" }}
              animate={{ x: "10%", y: "5%" }}
              transition={{ duration: 14, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, rgba(232,163,61,0.12), transparent 35%)",
              }}
            />
            <div className="glitch-lines absolute inset-0 opacity-30" />
          </div>
        )}

        {/* Vignette + bottom gradient for legibility */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />

        {/* Top meta bar — Showreel tag anchored to the right */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-end px-6 pt-24 sm:px-12 sm:pt-28 md:px-16">
          <span className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-accent-400">
            {c("showreelLabel")}
          </span>
        </div>

        {/* Bottom-left: brand title + tagline.
            Mobile (text-3xl) intentionally smaller than the previous
            text-4xl so the headline doesn't break awkwardly on
            iPhone-SE-class screens (320 px) once the accent word
            hyphenates. */}
        <div className="absolute inset-x-0 bottom-28 px-5 sm:bottom-32 sm:px-12 md:bottom-36 md:px-16">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-display text-[10px] sm:text-xs font-semibold uppercase tracking-[0.32em] sm:tracking-[0.4em] text-white/60">
                {c("tagline")}
              </p>
              <h1 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl [text-wrap:balance]">
                {c("headingMain")} <span className="text-accent-400">{c("headingAccent")}</span>
              </h1>
            </div>
            <div className="md:max-w-xs md:text-right">
              <div className="hidden md:block ml-auto h-px w-16 bg-accent-400/70" />
              <p className="mt-3 text-sm text-white/70 sm:text-base">
                {c("description")}
              </p>
            </div>
          </div>
        </div>

        {/* Centered scroll-to-projects hint. The inline bottom uses
            calc(2rem + safe-area-inset-bottom) so the hint clears the
            home indicator on notched iPhones — pure bottom-8 collided
            with the indicator strip on devices like iPhone 14 Pro. */}
        <div
          className="absolute inset-x-0 z-10 flex justify-center"
          style={{ bottom: "calc(2rem + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={handleScrollToProjects}
            className="group inline-flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-white/70 transition-colors hover:text-accent-400 sm:text-sm"
            aria-label="Cuộn xuống mục dự án nổi bật"
          >
            <motion.span
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              className="text-base sm:text-lg"
              aria-hidden="true"
            >
              ↓
            </motion.span>
            <span>{c("scrollHint")}</span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default HeroShowreel;
