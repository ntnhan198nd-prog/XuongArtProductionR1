"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, animate } from "framer-motion";
import FadeIn from "./FadeIn";
import { DEFAULT_SITE_CONTENT } from "@/lib/siteContent";

const Counter = ({ to, suffix = "", decimals = 0 }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -120px" });
  const [display, setDisplay] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, {
      duration: 1.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
      onComplete: () => setDone(true),
    });
    return () => controls.stop();
  }, [inView, to]);

  const formatted =
    decimals > 0 ? display.toFixed(decimals) : Math.round(display).toString();
  const text = `${formatted}${suffix}`;

  return (
    <span ref={ref} className="relative inline-block">
      <span>{text}</span>
      {done ? (
        <span aria-hidden className="stat-shine pointer-events-none absolute inset-0">
          {text}
        </span>
      ) : null}
    </span>
  );
};

const Stats = ({ content }) => {
  const data = content || DEFAULT_SITE_CONTENT.stats;
  const items = Array.isArray(data?.items) && data.items.length > 0 ? data.items : DEFAULT_SITE_CONTENT.stats.items;
  return (
    <section className="mt-20 sm:mt-24 md:mt-32 lg:mt-40">
      <div className="mx-auto w-[92vw] lg:w-[80vw]">
        <FadeIn className="max-w-2xl">
          <span className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-accent-400">
            {data?.eyebrow || DEFAULT_SITE_CONTENT.stats.eyebrow}
          </span>
          <h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-neutral-950 sm:text-4xl md:text-5xl [text-wrap:balance]">
            {data?.heading || DEFAULT_SITE_CONTENT.stats.heading}
          </h2>
        </FadeIn>

        <motion.dl
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "0px 0px -120px" }}
          transition={{ staggerChildren: 0.12 }}
          className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 sm:mt-16 lg:grid-cols-4"
        >
          {items.map((s, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, y: 24 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.5 }}
              className="border-l border-neutral-200 pl-6 sm:pl-8"
            >
              <dd className="font-display text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl md:text-6xl">
                <Counter to={s.value} suffix={s.suffix} decimals={s.decimals || 0} />
              </dd>
              <dt className="mt-3 text-sm text-neutral-600 sm:text-base">
                {s.label}
              </dt>
            </motion.div>
          ))}
        </motion.dl>
      </div>
    </section>
  );
};

export default Stats;
