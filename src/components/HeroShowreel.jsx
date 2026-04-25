"use client";

import { motion } from "framer-motion";

const HeroShowreel = ({ videoSrc, posterSrc, scrollTargetId = "projects-section" }) => {
  const handleScrollToProjects = () => {
    if (typeof document === "undefined") return;
    const target = document.getElementById(scrollTargetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: window.innerHeight, behavior: "smooth" });
    }
  };

  return (
    <section className="relative -mt-20 w-full overflow-hidden bg-neutral-950 text-white">
      {/* Pull -mt-20 to slip under the fixed 80px header; fill the entire viewport */}
      <div className="relative w-full h-screen min-h-[560px]">
        {/* Background: real video if provided, else cinematic placeholder */}
        {videoSrc ? (
          <video
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
            Showreel · 2026
          </span>
        </div>

        {/* Bottom-left: brand title + tagline */}
        <div className="absolute inset-x-0 bottom-28 px-6 sm:bottom-32 sm:px-12 md:bottom-36 md:px-16">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-[0.4em] text-white/60">
                Xưởng Art Production
              </p>
              <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl [text-wrap:balance]">
                Every frame <span className="text-accent-400">tells a story</span>
              </h1>
            </div>
            <div className="md:max-w-xs md:text-right">
              <div className="hidden md:block ml-auto h-px w-16 bg-accent-400/70" />
              <p className="mt-3 text-sm text-white/70 sm:text-base">
                Studio sản xuất video · TVC · MV · Livestream sự kiện · Hậu kỳ điện ảnh.
              </p>
            </div>
          </div>
        </div>

        {/* Centered scroll-to-projects hint */}
        <div className="absolute inset-x-0 bottom-8 z-10 flex justify-center">
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
            <span>Cuộn để xem dự án nổi bật</span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default HeroShowreel;
