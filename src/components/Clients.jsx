"use client";

import { motion, useReducedMotion } from "framer-motion";
import Container from "./Container";
import FadeIn from "./FadeIn";
import { DEFAULT_SITE_CONTENT } from "@/lib/siteContent";

const SectionHeading = ({ children }) => (
  <FadeIn>
    <h2 className="text-center text-base font-sans font-semibold tracking-normal text-white sm:text-xl md:text-2xl">
      {children}
    </h2>
  </FadeIn>
);

const Clients = ({ content }) => {
  const reduceMotion = useReducedMotion();
  const data = content || DEFAULT_SITE_CONTENT.clients;
  const fallback = DEFAULT_SITE_CONTENT.clients;

  const strategicHeading = data?.strategicHeading || fallback.strategicHeading;
  const strategicBrands = (
    Array.isArray(data?.strategicBrands)
      ? data.strategicBrands
      : fallback.strategicBrands
  )
    .map((item) => {
      if (typeof item === "string") {
        return { alt: item.trim(), logoUrl: "", logoKey: "" };
      }
      if (item && typeof item === "object") {
        return {
          alt: typeof item.alt === "string" ? item.alt.trim() : "",
          logoUrl: typeof item.logoUrl === "string" ? item.logoUrl : "",
          logoKey: typeof item.logoKey === "string" ? item.logoKey : "",
        };
      }
      return null;
    })
    .filter((b) => b && (b.logoUrl || b.alt));

  const marqueeHeading =
    data?.marqueeHeading || data?.heading || fallback.marqueeHeading;
  const marqueeShowDots =
    typeof data?.marqueeShowDots === "boolean"
      ? data.marqueeShowDots
      : fallback.marqueeShowDots;
  const marqueeBrands =
    Array.isArray(data?.brands) && data.brands.length > 0
      ? data.brands
      : fallback.brands;
  // Duplicate the list so the marquee loops seamlessly when shifted by -50%.
  const track = [...marqueeBrands, ...marqueeBrands];

  return (
    <div className="mt-20 sm:mt-24 md:mt-32 lg:mt-56 rounded-[1.5rem] sm:rounded-[1.875rem] md:rounded-[2.25rem] lg:rounded-[2.625rem] bg-neutral-950 py-[2.7rem] sm:py-[4.5rem] md:py-[6.3rem] overflow-hidden">
      {strategicBrands.length > 0 ? (
        <>
          <Container>
            <SectionHeading>{strategicHeading}</SectionHeading>
            <motion.div
              className="mt-8 sm:mt-10 md:mt-12"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "0px 0px -80px" }}
              variants={{
                hidden: {},
                visible: {
                  transition: { staggerChildren: 0.12, delayChildren: 0.1 },
                },
              }}
            >
              <div className="mx-auto flex max-w-5xl items-center justify-evenly gap-x-2 sm:gap-x-4 md:gap-x-6">
                {strategicBrands.map((brand, idx) => (
                  <motion.div
                    key={`${brand.logoKey || brand.alt}-${idx}`}
                    variants={{
                      hidden: {
                        opacity: 0,
                        y: reduceMotion ? 0 : 18,
                      },
                      visible: {
                        opacity: 1,
                        y: 0,
                        transition: {
                          duration: 0.55,
                          ease: [0.32, 0.72, 0, 1],
                        },
                      },
                    }}
                    whileHover={
                      reduceMotion ? undefined : { scale: 1.06, y: -3 }
                    }
                    transition={{
                      type: "spring",
                      stiffness: 320,
                      damping: 22,
                    }}
                    className="shrink-0"
                  >
                    {brand.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={brand.logoUrl}
                        alt={brand.alt || `Đối tác chiến lược ${idx + 1}`}
                        className="h-5 w-auto select-none object-contain sm:h-7 md:h-9 lg:h-11"
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <span className="block whitespace-nowrap font-display text-xs font-semibold text-white sm:text-base md:text-xl lg:text-2xl">
                        {brand.alt}
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </Container>

          <Container className="mt-14 sm:mt-16 md:mt-20">
            <SectionHeading>{marqueeHeading}</SectionHeading>
          </Container>
        </>
      ) : (
        <Container>
          <SectionHeading>{marqueeHeading}</SectionHeading>
        </Container>
      )}

      <FadeIn className="group relative mt-10 sm:mt-14">
        {/* Edge fade masks */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 sm:w-32 bg-gradient-to-r from-neutral-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 sm:w-32 bg-gradient-to-l from-neutral-950 to-transparent" />

        <div className="flex w-max animate-marquee items-center gap-6 will-change-transform group-hover:[animation-play-state:paused] sm:gap-20">
          {track.map((name, idx) => (
            <span
              key={`${name}-${idx}`}
              className="flex shrink-0 items-center gap-6 whitespace-nowrap font-display text-lg font-semibold text-white sm:gap-20 sm:text-3xl md:text-4xl"
              aria-hidden={idx >= marqueeBrands.length}
            >
              {name}
              {marqueeShowDots ? (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-accent-400/80"
                  aria-hidden="true"
                />
              ) : null}
            </span>
          ))}
        </div>
      </FadeIn>
    </div>
  );
};

export default Clients;
