"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import Image from "next/image";
import AuthorAvatar from "@/components/AuthorAvatar";
import TimeAgo from "@/components/TimeAgo";
import RichTextRenderer from "@/components/RichTextRenderer";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { getFeaturedProjects } from "@/lib/strapi";
import { useSiteContent } from "@/components/SiteContentProvider";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

// 6 s of inactivity before the carousel auto-advances. The timer is
// reset every time the user navigates manually (arrow / dot), so a
// freshly-clicked slide always gets the full 6 s before the next
// auto-advance — never a half-second residual fire from the previous
// interval (which is what setInterval would do).
const AUTOPLAY_INTERVAL_MS = 6000;
const DESKTOP_BREAKPOINT_QUERY = "(min-width: 1024px)";

// Apple-style carousel: every slide is rendered side-by-side in one wide
// flex row, and we translateX the row so the active slide aligns with the
// viewport. Pure x animation, no opacity, no remount on slide change —
// every featured card (and its <video>) stays mounted forever, so the
// browser never has to refetch or redecode when the user navigates.
//
// Spring (instead of a fixed-duration tween) gives the slide a bit of
// velocity / momentum: it starts fast, decelerates smoothly, and when
// the user clicks rapidly the new spring inherits the current velocity
// rather than snapping to a fresh easing curve. damping is tuned just
// over critical so it settles cleanly without an overshoot bounce.
const SLIDE_TRANSITION = {
  type: "spring",
  stiffness: 280,
  damping: 32,
  mass: 1,
};
// Mobile / tablet swap a fixed-duration tween for the spring above. The
// spring is a JS-integrated physics step every frame; on lower-end
// phones that integration cost is enough to drop the slide animation
// below 60fps, especially while 12 background <video> elements are
// decoding. A plain ease-out tween is monotone and cheaper to sample,
// so it stays smooth where the spring would judder.
const SLIDE_TRANSITION_MOBILE = {
  type: "tween",
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1],
};
// Approximate time for the spring above to settle. Used by the snap-back
// effect because spring transitions don't expose a deterministic duration
// the way tween does. A 30 ms safety margin lets the spring fully come
// to rest before we silently jump back to the real first slide.
const SLIDE_SETTLE_MS = 650;

// --- Helpers ---
const isVideoUrl = (url) => /(mp4|webm|ogg|mov|avi)$/i.test(url || "");

const toAbsoluteAssetUrl = (url, appBaseUrl) => {
  if (!url) return "";
  return url.startsWith("http") ? url : `${appBaseUrl}${url}`;
};

// Normalize Strapi orientation values (handle casing/whitespace/localization)
const normalizeOrientation = (val) => {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim().toLowerCase();
  if (["portrait", "doc", "dọc", "vertical", "v", "p"].includes(s)) return "portrait";
  if (["landscape", "ngang", "horizontal", "h", "l"].includes(s)) return "landscape";
  if (["square", "vuong", "vuông", "1:1", "1x1", "s"].includes(s)) return "square";
  return undefined;
};

// Grid patterns. Each pattern declares its own column / row template so a
// slide of 6 squares can render a tight 3×2 grid while the default mixed
// pattern keeps the wide 2-portrait + 4-landscape layout. Pattern picked
// at slide-assignment time based on item composition (see
// pickPatternForSlide below).
const SLIDE_PATTERNS = {
  // 2 portraits framing 4 landscapes — the original featured layout.
  // Used for any slide that isn't 100% square.
  mixed: {
    desktop: {
      columns: '1.35fr 1fr 1fr 1.35fr 1fr 1fr',
      rows: 'repeat(2, auto)',
      template: [
        '"a b b c d d"',
        '"a e e c f f"',
      ],
      areas: [
        { name: 'a', shape: 'portrait' },
        { name: 'b', shape: 'landscape' },
        { name: 'c', shape: 'portrait' },
        { name: 'd', shape: 'landscape' },
        { name: 'e', shape: 'landscape' },
        { name: 'f', shape: 'landscape' },
      ],
    },
  },
  // 6 equal squares laid out 3 across × 2 down. Activated when every
  // item in the slide has orientation === 'square'. Cells are 1fr × 1fr
  // so each card stays exactly 1:1.
  squares: {
    desktop: {
      columns: 'repeat(3, 1fr)',
      rows: 'repeat(2, 1fr)',
      template: [
        '"a b c"',
        '"d e f"',
      ],
      areas: [
        { name: 'a', shape: 'square' },
        { name: 'b', shape: 'square' },
        { name: 'c', shape: 'square' },
        { name: 'd', shape: 'square' },
        { name: 'e', shape: 'square' },
        { name: 'f', shape: 'square' },
      ],
    },
  },
};

// Pick the right pattern for a slide. Pure-square slides use the dedicated
// squares grid; everything else (mixed, or all portrait/landscape) uses
// the original mixed grid. Mixing a single square into a 2P+4L slide
// would distort the existing layout, so we keep it strict for V1 — admins
// can group their squares into their own slide via the order field.
const pickPatternForSlide = (slideItems = []) => {
  if (
    slideItems.length > 0 &&
    slideItems.every((item) => item?.orientation === 'square')
  ) {
    return SLIDE_PATTERNS.squares;
  }
  return SLIDE_PATTERNS.mixed;
};

// Assign projects to pattern areas với thứ tự cố định
const assignToPattern = (items, pattern) => {
  if (!items || items.length === 0) return [];

  // Cố định thứ tự items theo order field hoặc ID để tránh xáo trộn khi F5
  const sortedItems = [...items].sort((a, b) => {
    const aOrder = a.order || a.id;
    const bOrder = b.order || b.id;
    return aOrder - bOrder;
  });

  return pattern.desktop.areas.slice(0, items.length).map((area, index) => {
    const item = sortedItems[index] || items[index];

    // Sử dụng orientation từ pattern thay vì detection để đảm bảo tính nhất quán
    const finalOrientation = area.shape;

    return {
      area: area.name,
      shape: finalOrientation,
      item: {
        ...item,
        orientation: finalOrientation
      }
    };
  });
};

// Individual project card component.
// `eagerLoad` (gallery-level IntersectionObserver) flips the inner <video>
// from preload="metadata" (just duration/dimensions) to preload="auto"
// (full bytes) once the user scrolls near the gallery. Combined with the
// carousel keeping every card mounted forever, this means a slide change
// hits the already-decoded buffer instead of starting a fresh download.
//
// Wrapped in React.memo because the carousel renders 13 cards (12 real +
// 1 clone) and the parent re-renders on every slide change, autoplay
// tick, and hover. Props are stable (item from useMemo, onOpen identity
// from parent, eagerLoad from a once-true useInView), so default shallow
// comparison reliably skips re-renders that would otherwise hit every
// card on each navigation.
const FeaturedCard = memo(({ areaName, slotShape, item, onOpen, index = 0, fillHeight = false, forceAspectRatio, eagerLoad = false }) => {
  const ref = useRef(null);
  const videoRef = useRef(null);
  // We deliberately don't run a per-card entry animation any more. With
  // the carousel architecture every card mounts upfront and stays mounted;
  // off-screen slides are merely translated. Triggering an opacity 0→1
  // fade the first time a slide-2 card crosses into view caused two
  // visible bugs:
  //   1. A white flash on first navigation to slide 2 (the staggered
  //      delay × index made the fade-in last ~1.4 s).
  //   2. The <video> sat at opacity:0 during the transition, and some
  //      browsers suspend playback for fully-transparent media —
  //      breaking the loop until the next heartbeat tick.
  // Cards now render at their final state straight away (initial={false}
  // on the motion.div below), so neither problem can recur.
  const cardMediaUrl = item?.previewMedia || item?.media || "";
  const isVideoCard = isVideoUrl(cardMediaUrl);
  // Featured-only WebM gallery preview. When present, the gallery loops
  // this small VP9 file (no audio) instead of the full MP4 — frees
  // hardware decoder bandwidth across 12 simultaneous cards. Click the
  // card to open the modal and the full MP4 (`cardMediaUrl`) is used.
  const galleryWebmUrl = item?.galleryVideoUrl || "";
  const galleryWebmMime = item?.galleryVideoMime || "video/webm";

  // Force the browser to start fetching the full video as soon as the
  // gallery scrolls into view. Just flipping the `preload` attribute from
  // "metadata" to "auto" at runtime is a hint, and several browsers
  // (notably Safari + Firefox) keep the existing metadata-only fetch.
  // Calling load() resets the media element and re-applies the new
  // preload value.
  //
  // The call is staggered by `index * 120ms` to avoid the CPU spike of
  // every card calling load() in the same paint frame — that spike was
  // the root cause of the "playing video freezes" reports in modeB,
  // where all 12 cards eagerLoad on mount and would otherwise hammer
  // the decoder simultaneously. 120 ms × 6 cards = 720 ms total spread,
  // imperceptible to the user but enough to keep the browser ahead.
  useEffect(() => {
    // Each card kicks load() the moment its phase unlocks via eagerLoad.
    // With 12 small WebM previews (~2–3 MB each), loading them all
    // once the gallery is in view is well within the network and
    // decode budget for desktop browsers — the parent gates phase 2
    // behind a short delay after phase 1 so the network burst is
    // staggered into two waves instead of one.
    if (!eagerLoad || !videoRef.current || !isVideoCard) return;
    try {
      videoRef.current.load();
    } catch {
      // Some browsers throw if load() is called too early; ignore.
    }
  }, [eagerLoad, isVideoCard, cardMediaUrl]);

  // Keep thumbnail autoplay stable: resume when tab returns, when stream stalls, or when browser pauses unexpectedly.
  useEffect(() => {
    if (!videoRef.current || !isVideoCard) return;

    const video = videoRef.current;
    let retryTimeoutId = null;
    let heartbeatId = null;

    // Gate playback on `eagerLoad` (= section-in-view, sticky once true)
    // instead of per-card `inView`. Otherwise translateX-ing a card
    // off-screen would flip inView=false and pause the video, then
    // flip true on the next slide change and call play() again — that
    // pause/resume cycle is exactly the "stutter then play" the user
    // sees on every slide transition. Tied to `eagerLoad` instead, the
    // 12 videos all keep running in the background once the gallery
    // has been reached, so a slide change is just a translateX of an
    // already-playing row.
    // Playback gates on section-in-view (sticky once true) and the tab
    // being visible. Once a card's phase unlocks via eagerLoad it loops
    // forever — across slide changes, autoplay ticks, and back-and-
    // forth navigation — until the user leaves the homepage entirely
    // (component unmounts, freeing every <video>).
    const canAutoplay = () => eagerLoad && !document.hidden;

    const tryPlay = () => {
      if (!canAutoplay()) return;
      const promise = video.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch((error) => {
          console.warn("Thumbnail video play failed:", error);
        });
      }
    };

    const scheduleRetry = (delay = 180) => {
      if (!canAutoplay()) return;
      if (retryTimeoutId) window.clearTimeout(retryTimeoutId);
      retryTimeoutId = window.setTimeout(() => {
        tryPlay();
      }, delay);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        video.pause();
        return;
      }
      scheduleRetry(120);
    };

    const onPause = () => {
      if (canAutoplay() && !video.ended) {
        scheduleRetry(120);
      }
    };

    const onBuffering = () => {
      scheduleRetry(300);
    };

    const onEnded = () => {
      // Always reset + replay on ended, even if canAutoplay() is currently
      // false. Some browsers DO fire `ended` for loop=true videos (the
      // native loop is best-effort), and if our handler bailed out the
      // video would stay frozen on the last frame forever — visible as
      // "no loop" in the gallery. Resetting unconditionally and asking
      // the browser to play matches the user's expectation of native
      // looping; the play() promise rejects silently if autoplay is
      // genuinely blocked.
      video.currentTime = 0;
      const promise = video.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {
          // Autoplay blocked — heartbeat will retry on next tick.
        });
      }
    };

    // Don't programmatically pause on mount: the HTML <video autoPlay loop
    // muted /> attributes already start playback the moment the element
    // exists, and most browsers refuse to resume cleanly via play() once
    // we've actively paused (Safari especially treats it like a "user
    // paused" signal). We only retry-play here as a safety net for the
    // canplay/stalled/buffering events further down. The visibility-
    // change handler is the *only* place we call pause() — saves battery
    // when the tab is hidden without breaking native autoplay.
    if (canAutoplay()) {
      scheduleRetry(0);
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    video.addEventListener("pause", onPause);
    video.addEventListener("canplay", tryPlay);
    video.addEventListener("stalled", onBuffering);
    video.addEventListener("waiting", onBuffering);
    video.addEventListener("suspend", onBuffering);
    video.addEventListener("ended", onEnded);

    // Safety net: some browsers pause muted background videos silently,
    // and a small minority freeze on the last frame when the native loop
    // hand-off mis-fires. Resetting currentTime back to 0 here recovers
    // the latter case so the video starts looping again on the next tick
    // even if onEnded never fired.
    // 1.5 s tick (was 2.5 s) — fast enough that a browser auto-suspend
    // recovers before the user can perceive it as a freeze, slow enough
    // that 12 simultaneous heartbeats per gallery don't dominate the main
    // thread. 12 × ~0.7 ops every 1.5 s ≈ 5 lookups/s total.
    heartbeatId = window.setInterval(() => {
      if (!canAutoplay() || !video.paused) return;
      if (video.ended) video.currentTime = 0;
      tryPlay();
    }, 1500);

    return () => {
      if (retryTimeoutId) window.clearTimeout(retryTimeoutId);
      if (heartbeatId) window.clearInterval(heartbeatId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("canplay", tryPlay);
      video.removeEventListener("stalled", onBuffering);
      video.removeEventListener("waiting", onBuffering);
      video.removeEventListener("suspend", onBuffering);
      video.removeEventListener("ended", onEnded);
    };
    // Deps drop `inView` deliberately — see canAutoplay above. The
    // effect re-inits when the source URL or eagerLoad changes (a
    // phase-2 unlock, typically) so playback kicks off as soon as the
    // card joins the active set.
  }, [eagerLoad, isVideoCard, cardMediaUrl]);

  return (
    <motion.div
      ref={ref}
      initial={false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        // Default applies to opacity (the slow staggered reveal).
        duration: 0.8,
        ease: [0.43, 0.13, 0.23, 0.96],
        delay: index * 0.1, // Stagger fade-in based on index
        // Per-property overrides for scale and y. These properties are
        // also driven by whileHover; without an override here, leaving
        // the hover state would animate scale/y back to their resting
        // values using the slow default above (0.8s + per-card delay) —
        // making hover-out drag well behind hover-in. Forcing both to
        // 0.18s with no delay means hover in and out feel symmetrical.
        scale: { duration: 0.18, ease: [0.32, 0.72, 0, 1], delay: 0 },
        y: { duration: 0.18, ease: [0.32, 0.72, 0, 1], delay: 0 },
      }}
      className={clsx(
        "relative group overflow-hidden rounded-2xl bg-transparent text-white shadow-xl cursor-pointer",
        // transition-shadow only — transition-all also animates transform,
        // which would double-animate (and slow down) the lift/scale that
        // framer-motion's whileHover already drives. Restricting to shadow
        // keeps box-shadow easing without fighting framer.
        "hover:shadow-2xl transition-shadow duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
        // Sử dụng slotShape từ pattern thay vì orientation state
        slotShape === 'portrait'
          ? 'col-span-2 row-span-2'
          : slotShape === 'landscape'
          ? 'col-span-3 row-span-1'
          : slotShape === 'square'
          ? 'col-span-1 row-span-1'
          : 'col-span-1 row-span-1'
      )}
              style={{
        ...(areaName ? { gridArea: areaName } : {}),
        width: '100%',
        height: fillHeight ? '100%' : 'auto',
        // Aspect ratio bám theo shape của ô (slot), không lấy từ media gốc —
        // media với tỉ lệ khác sẽ tự crop bằng object-cover để giữ layout cố định.
        ...(fillHeight
          ? {}
          : {
              // slotShape is always set by assignToPattern (portrait /
              // landscape / square). 16/9 is the defensive fallback when
              // an unrecognised shape sneaks through.
              aspectRatio:
                forceAspectRatio ||
                (slotShape === 'portrait'
                  ? 9 / 16
                  : slotShape === 'square'
                  ? 1
                  : 16 / 9),
            })
      }}
      whileHover={{
        scale: 1.03,
        y: -5,
        // Snappier hover — Apple's signature ease-out curve at 0.18s feels
        // immediate without snapping. The previous easeOut at 0.3s lagged
        // behind the cursor and felt sluggish on rapid pointer crossings.
        transition: { duration: 0.18, ease: [0.32, 0.72, 0, 1] },
      }}
      onClick={() => onOpen && onOpen(item)}
    >
      <div className="relative h-full w-full">
        {isVideoCard ? (
          <div className="relative h-full w-full overflow-hidden">
            <video
              ref={videoRef}
              className="h-full w-full"
              style={{
                objectFit: 'cover',
                objectPosition: 'center center',
                width: '100%',
                height: '100%',
                position: 'static'
              }}
              autoPlay={true}
              muted={true}
              loop={true}
              playsInline
              controls={false}
              // preload flips from "none" (sleep) to "auto" (fetch +
              // decode now) the moment the card's phase unlocks via
              // eagerLoad. With WebM previews at ~2–3 MB each the
              // browser easily handles 12 simultaneous decodes; the
              // parent staggers phase 1 (first 6) and phase 2 (last 6)
              // so the network burst hits in two small waves rather
              // than one big one.
              preload={eagerLoad ? "auto" : "none"}
              poster={item.poster || ''}
              webkit-playsinline="true"
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              onContextMenu={(e) => e.preventDefault()}
              onError={(e) => {
                console.error('Video playback error:', e);
              }}
            >
              {/* Source is always rendered; the only thing that
                  changes between sleep and active is the preload
                  attribute. Mounting <source> conditionally (the
                  earlier approach) raced with the <video> element's
                  resource-selection state machine and occasionally
                  left the element stuck without a fetch.
                  WebM-only when uploaded: the small VP9 file is what
                  the gallery loops; modal click-to-play still uses
                  the MP4 directly via cardMediaUrl. */}
              {galleryWebmUrl ? (
                <source src={galleryWebmUrl} type={galleryWebmMime} />
              ) : (
                <source src={cardMediaUrl} type="video/mp4" />
              )}
            </video>
          </div>
        ) : cardMediaUrl ? (
          <Image
            src={cardMediaUrl}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-neutral-800 flex items-center justify-center">
            <span className="text-neutral-400">No media</span>
          </div>
        )}
      </div>

      {/* Permanent dark gradient anchored to the bottom — darkest at the
          bottom edge, fades up through the client name. Sits above the media
          but below the text so the two-line caption is always legible. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/95 via-black/55 to-transparent"
      />

      {/* Extra hover dim on top of the permanent gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      {/* Title overlay (mobile: only show title) */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 transform translate-y-1 transition-transform duration-300 group-hover:translate-y-0">
          <div className="hidden sm:block text-[10px] uppercase tracking-[0.18em] text-neutral-200 font-medium">{item.client}</div>
          <div className="mt-px line-clamp-2 font-display text-sm sm:text-base font-semibold text-white leading-snug">{item.title}</div>
        </div>
      </div>
    </motion.div>
  );
});
FeaturedCard.displayName = "FeaturedCard";

// Modal component removed - no more black overlay

// Main ProjectsGallery component
const ProjectsGallery = () => {
  const { ui } = useSiteContent();
  // Cache-only preload strategy ("Mode A"): inject <link rel="preload"
  // as="video"> for the 12 featured videos as soon as the homepage
  // mounts so the bytes warm in the HTTP cache while the user is still
  // on the hero showreel, but each <video> element stays at
  // preload="metadata" until the gallery scrolls into view. Decode/play
  // only kicks in once sectionInView fires, so Windows / mobile / older
  // browsers never have to handle 12 simultaneous decode jobs in the
  // background — that simultaneity was producing blank cards on
  // Windows.
  // OS-level "Reduce motion" preference. When true we replace the spring
  // slide animation with an instant cut so vestibular-sensitive users
  // don't get the horizontal sweep on every navigation.
  const reduceMotion = useReducedMotion();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  // closeProject defers clearing `selectedProject` by 200 ms so the modal can
  // play its exit animation. If the user re-opens (clicks another card)
  // before that 200 ms is up, the pending timer would otherwise fire and
  // wipe out the freshly-set selection — making the new modal disappear
  // moments after it appeared. Tracking the timer in a ref lets openProject
  // cancel any in-flight clear, and the unmount effect prevents leaks.
  const closeTimerRef = useRef(null);

  // useCallback so the FeaturedCard memo's shallow prop check keeps the
  // onOpen reference stable across re-renders — without it, every render
  // would hand each card a brand-new function and bust the memo.
  const openProject = useCallback((project) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setSelectedProject(project);
    setIsModalOpen(true);
  }, []);

  const closeProject = useCallback(() => {
    setIsModalOpen(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setSelectedProject(null);
      closeTimerRef.current = null;
    }, 200);
  }, []);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);
  
  // Close on ESC
  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeProject();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModalOpen, closeProject]);

  useBodyScrollLock(isModalOpen);
  // `slide` is the *real* slide index (0..N-1) used for dot highlighting and
  // autoplay accounting. `carouselIdx` is the *carousel position* (0..N) —
  // when it lands on N (the clone of slide 0 appended to the rendered row)
  // we let the animation run, then snap carouselIdx back to 0 with the
  // transition disabled. Visually the user just keeps sliding leftward
  // forever, no rightward "back to start" jump.
  const [slide, setSlide] = useState(0);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [enableTransition, setEnableTransition] = useState(true);
  const [mobileSlide, setMobileSlide] = useState(0);
  const [mobileCarouselIdx, setMobileCarouselIdx] = useState(0);
  const [enableMobileTransition, setEnableMobileTransition] = useState(true);
  // Refs mirror the latest slide indices so closures (autoplay tick, button
  // handlers built once at mount) read the current value instead of a
  // captured stale one.
  const slideRef = useRef(0);
  const mobileSlideRef = useRef(0);
  // Carousel position refs are also mirrored so goToSlide can detect that
  // we're currently sitting on the appended clone (mid-wrap, snap-back
  // pending) — see the rapid-forward branch in goToSlide for why.
  const carouselIdxRef = useRef(0);
  const mobileCarouselIdxRef = useRef(0);
  // Single effect mirrors all four state values into refs. Runs on every
  // render but the body is four pointer assignments — cheaper than four
  // separate useEffects each with their own cleanup/scheduling overhead.
  useEffect(() => {
    slideRef.current = slide;
    mobileSlideRef.current = mobileSlide;
    carouselIdxRef.current = carouselIdx;
    mobileCarouselIdxRef.current = mobileCarouselIdx;
  });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  // viewportMode is the load-bearing piece for video decoder budget.
  //   "loading"  — initial SSR + first paint, render BOTH carousels via
  //                Tailwind hidden classes so server / client markup match.
  //   "desktop"  — only the desktop carousel mounts → mobile's 12 <video>
  //                elements are removed from the DOM, freeing their
  //                hardware decoder slots.
  //   "mobile"   — symmetric: only mobile carousel mounts.
  // Without this, on Chrome Windows we ship 24 simultaneous <video>
  // elements (12 desktop + 12 mobile, both mounted via CSS `hidden`).
  // The browser's hardware decoder pool caps around 6–8, so the surplus
  // get silently rejected and render as blank cards.
  const [viewportMode, setViewportMode] = useState("loading");
  const isDesktopViewport = viewportMode === "desktop";

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(DESKTOP_BREAKPOINT_QUERY);
    const updateViewport = () =>
      setViewportMode(mediaQuery.matches ? "desktop" : "mobile");

    updateViewport();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateViewport);
      return () => mediaQuery.removeEventListener("change", updateViewport);
    }

    mediaQuery.addListener(updateViewport);
    return () => mediaQuery.removeListener(updateViewport);
  }, []);

  // Slide transition picks the cheapest curve the device + user can use:
  //   - reduceMotion → instant cut (vestibular safety)
  //   - mobile / tablet → fixed-duration tween (cheap, no JS physics step)
  //   - desktop → spring (velocity inheritance feels best on rapid clicks)
  const slideTransition = reduceMotion
    ? { duration: 0 }
    : isDesktopViewport
    ? SLIDE_TRANSITION
    : SLIDE_TRANSITION_MOBILE;

  // Fetch featured projects from Strapi
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await getFeaturedProjects();

        if (response && response.data && Array.isArray(response.data)) {
          const formattedProjects = response.data.map(project => {
            const mediaAttributes = project.attributes?.media?.data?.attributes;
            const mediaUrl = mediaAttributes?.url || "";
            const mediaPreviewUrl = mediaAttributes?.previewUrl || mediaUrl;
            const apiBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            const fullMediaUrl = toAbsoluteAssetUrl(mediaUrl, apiBaseUrl);
            const fullMediaPreviewUrl = toAbsoluteAssetUrl(mediaPreviewUrl, apiBaseUrl);
            // Featured card gallery loop uses the small WebM if uploaded;
            // otherwise it falls back to the full MP4. Click-to-play in
            // the modal always uses the MP4 (`media`).
            const previewAttributes = project.attributes?.preview?.data?.attributes;
            const galleryVideoUrl = previewAttributes?.url
              ? toAbsoluteAssetUrl(previewAttributes.url, apiBaseUrl)
              : "";
            const galleryVideoMime = previewAttributes?.mime || "";
            
            // Prefer new field, fallback to legacy 'description'. Description
            // is kept as raw rich-text (modal renders via RichTextRenderer).
            const rawFull = project.attributes?.fullDescription || project.attributes?.description || '';

            // Orientation: prefer Strapi field, fallback to media dimensions
            const mediaW = mediaAttributes?.width;
            const mediaH = mediaAttributes?.height;
            const orientation = normalizeOrientation(project.attributes?.orientation)
              || (mediaW && mediaH ? (mediaH > mediaW ? 'portrait' : 'landscape') : undefined);
            
            return {
              id: project.id,
              title: project.attributes?.title || 'Untitled',
              client: project.attributes?.client || '',
              description: rawFull, // Giữ nguyên rich text format
              category: project.attributes?.category || '',
              categories: Array.isArray(project.attributes?.categories)
                ? project.attributes.categories
                : (project.attributes?.category ? [project.attributes.category] : []),
              featured: project.attributes?.featured || false,
              slug: project.attributes?.slug || '',
              order: project.attributes?.order || project.id,
              media: fullMediaUrl,
              previewMedia: fullMediaPreviewUrl || fullMediaUrl,
              galleryVideoUrl,
              galleryVideoMime,
              completionDate: project.attributes?.completionDate,
              orientation,
              medias: project.attributes?.media?.data ? [{
                url: fullMediaUrl,
                width: mediaW,
                height: mediaH
              }] : []
            };
          });
          setProjects(formattedProjects);
        } else {
          setProjects([]);
        }
      } catch (error) {
        console.error("Error fetching featured projects:", error);
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  // _loadOrder is the absolute project index (0–11). The eagerLoad
  // gate uses it to release videos in waves, with the second wave
  // staggered card-by-card so Chrome on Windows — which has a smaller
  // hardware-decoder pool than macOS — never sees 6 decode requests
  // hit the queue at once. Riding the flag on the item itself means
  // the desktop and mobile carousels can share the same gate even
  // though they slice the project list differently.
  const allItems = useMemo(
    () => projects.map((p, idx) => ({
      ...p,
      medias: p.medias.length > 0 ? p.medias : [{ url: p.media }],
      _loadOrder: idx,
    })),
    [projects]
  );

  // Build slides based on available items
  const itemsPerSlide = 6; // Desktop/Tablet
  
  const slides = useMemo(() => {
    const totalItems = allItems.length;
    const numSlides = Math.ceil(totalItems / itemsPerSlide);

    return Array.from({ length: numSlides }, (_, i) => {
      return allItems.slice(i * itemsPerSlide, (i + 1) * itemsPerSlide);
    }).filter(slide => slide.length > 0);
  }, [allItems]);
  
  // Build mobile-specific slides:
  //  - Page 1-2: 1 portrait + 4 landscapes (1P+4L)
  //  - Last page: 2 portraits side-by-side (2P)
  const mobileSlides = useMemo(() => {
    const portraits = allItems.filter((it) => normalizeOrientation(it?.orientation) === 'portrait' || (!it?.orientation && (it?.medias?.[0]?.height > it?.medias?.[0]?.width)));
    const landscapes = allItems.filter((it) => normalizeOrientation(it?.orientation) === 'landscape' || (!it?.orientation && (it?.medias?.[0]?.width >= it?.medias?.[0]?.height)));
    const used = new Set();
    const takeNext = (arr) => {
      while (arr.length && used.has(arr[0]?.id)) arr.shift();
      const v = arr.shift();
      if (v) used.add(v.id);
      return v;
    };
    const slidesArr = [];
    // First two pages: 1P + 4L
    for (let p = 0; p < 2; p++) {
      const page = [];
      const pr = takeNext(portraits); if (pr) page.push(pr);
      for (let i = 0; i < 4; i++) {
        const l = takeNext(landscapes); if (l) page.push(l);
      }
      if (page.length) slidesArr.push(page);
      if (allItems.filter((it) => !used.has(it.id)).length === 0) break;
    }
    // Last page: 2P side-by-side (fill with remaining if thiếu)
    const last = [];
    for (let i = 0; i < 2; i++) { const pr = takeNext(portraits); if (pr) last.push(pr); }
    if (last.length < 2) {
      const rest = allItems.filter((it) => !used.has(it.id));
      for (const r of rest) { last.push(r); if (last.length === 2) break; }
    }
    if (last.length) slidesArr.push(last);
    return slidesArr;
  }, [allItems]);

  // Navigation helpers, hoisted above the autoplay/onFocus effects that
  // reference them in their dependency arrays — defining them later would
  // TDZ-error on the first render. Wrapping forward (last → first) animates
  // onto the appended clone first; the snap-back effect (further down)
  // resets carouselIdx to 0 once the animation lands.
  // useClone=true is the "forward direction" hint — only the right arrow
  // and the autoplay tick set it. When the caller is moving forward AND
  // we're wrapping last→first, we animate onto the appended clone so the
  // row keeps translating leftward. Anything else (left arrow, dot click,
  // refocus clamp) animates straight to the target index, which means a
  // backward step from slide 1 → slide 0 produces a clean rightward
  // animation instead of being mistaken for a forward wrap.
  const goToSlide = useCallback((next, useClone = false) => {
    const N = slides.length;
    if (N === 0) return;
    const target = ((next % N) + N) % N;
    const current = slideRef.current;
    setSlide(target);

    // If we're already sitting on the appended clone (mid-wrap, snap-back
    // still pending) and the user wants to keep going forward, just
    // setting carouselIdx to `target` (e.g. 1) would translate the row
    // *rightward* — from the clone's far-right position back toward the
    // middle — which feels like "jumping to the start". Instead we snap
    // to real slide 0 instantly (no transition; the clone is visually
    // identical, so the jump is invisible) and then animate forward to
    // the new target. This makes every forward click feel leftward,
    // even when chained faster than the snap-back timeout.
    if (useClone && carouselIdxRef.current === N) {
      setEnableTransition(false);
      setCarouselIdx(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setEnableTransition(true);
          setCarouselIdx(target);
        });
      });
    } else if (useClone && current === N - 1 && target === 0) {
      setEnableTransition(true);
      setCarouselIdx(N); // animate onto the clone
    } else {
      setEnableTransition(true);
      setCarouselIdx(target);
    }
    // Restart the 6 s autoplay countdown after every navigation (whether
    // it came from the user clicking arrow/dot or from the autoplay tick
    // itself). Going through a ref keeps this independent of where
    // scheduleAutoplay is defined, so we don't get into a circular
    // useCallback dependency.
    if (scheduleAutoplayRef.current) scheduleAutoplayRef.current();
  }, [slides.length]);

  const goToMobileSlide = useCallback((next, useClone = false) => {
    const M = mobileSlides.length;
    if (M === 0) return;
    const target = ((next % M) + M) % M;
    const current = mobileSlideRef.current;
    setMobileSlide(target);

    // Same rapid-forward fix as the desktop version: snap clone-to-real
    // before animating onward, otherwise carouselIdx going from M back
    // to 1 would translate the row rightward and feel like a jump back.
    if (useClone && mobileCarouselIdxRef.current === M) {
      setEnableMobileTransition(false);
      setMobileCarouselIdx(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setEnableMobileTransition(true);
          setMobileCarouselIdx(target);
        });
      });
    } else if (useClone && current === M - 1 && target === 0) {
      setEnableMobileTransition(true);
      setMobileCarouselIdx(M);
    } else {
      setEnableMobileTransition(true);
      setMobileCarouselIdx(target);
    }
    if (scheduleAutoplayRef.current) scheduleAutoplayRef.current();
  }, [mobileSlides.length]);

  // Keep slide indexes in bounds when data changes. Both `slide` (the real
  // slide for dot highlighting) and `carouselIdx` (the carousel position)
  // need to be clamped — otherwise a stale carouselIdx that exceeds the
  // new rendered length would translate the row off-screen until the
  // next navigation.
  useEffect(() => {
    setSlide((current) => (slides.length > 0 ? current % slides.length : 0));
    setCarouselIdx((current) => (slides.length > 0 ? Math.min(current, slides.length) : 0));
  }, [slides.length]);

  useEffect(() => {
    setMobileSlide((current) => (mobileSlides.length > 0 ? current % mobileSlides.length : 0));
    setMobileCarouselIdx((current) => (mobileSlides.length > 0 ? Math.min(current, mobileSlides.length) : 0));
  }, [mobileSlides.length]);

  // Autoplay: self-rescheduling setTimeout instead of setInterval so the
  // 6 s countdown can be reset every time the user navigates manually
  // (arrow / dot). With setInterval the next tick would fire at whatever
  // residual time was left in the cycle — clicking arrow at 5 s into the
  // cycle would auto-advance again 1 s later, which felt jumpy.
  const autoplayTimerRef = useRef(null);
  const scheduleAutoplay = useCallback(() => {
    if (typeof window === "undefined") return;
    if (autoplayTimerRef.current) {
      window.clearTimeout(autoplayTimerRef.current);
      autoplayTimerRef.current = null;
    }
    const length = isDesktopViewport ? slides.length : mobileSlides.length;
    if (length <= 1) return;

    autoplayTimerRef.current = window.setTimeout(() => {
      autoplayTimerRef.current = null;
      if (typeof document !== "undefined" && document.hidden) {
        // Visibility-change handler will re-arm when the tab returns.
        return;
      }
      // Auto-advance leftward (forward); goToSlide internally calls
      // scheduleAutoplayRef.current() so the next tick is automatically
      // scheduled — no need to call it again here. useClone=true so the
      // forward wrap from last → first uses the appended clone instead
      // of a rightward jump.
      if (isDesktopViewport) {
        if (slides.length > 0) goToSlide(slideRef.current + 1, true);
      } else {
        if (mobileSlides.length > 0) goToMobileSlide(mobileSlideRef.current + 1, true);
      }
    }, AUTOPLAY_INTERVAL_MS);
  }, [isDesktopViewport, slides.length, mobileSlides.length, goToSlide, goToMobileSlide]);

  // Mirror scheduleAutoplay into a ref so goToSlide / goToMobileSlide can
  // reset the timer without taking it as a dependency (and dragging the
  // whole autoplay graph into their useCallback deps).
  const scheduleAutoplayRef = useRef(null);
  useEffect(() => {
    scheduleAutoplayRef.current = scheduleAutoplay;
  }, [scheduleAutoplay]);

  // Initial schedule + cleanup.
  useEffect(() => {
    scheduleAutoplay();
    return () => {
      if (autoplayTimerRef.current) {
        window.clearTimeout(autoplayTimerRef.current);
        autoplayTimerRef.current = null;
      }
    };
  }, [scheduleAutoplay]);

  // Re-arm when the tab becomes visible (the timer is paused while hidden
  // because the timeout callback bails on document.hidden).
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onVis = () => {
      if (!document.hidden) scheduleAutoplay();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [scheduleAutoplay]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onFocus = () => {
      // Re-clamp into range; the carouselIdx is also clamped by the helper.
      if (isDesktopViewport) {
        if (slides.length > 0) goToSlide(slideRef.current);
      } else {
        if (mobileSlides.length > 0) goToMobileSlide(mobileSlideRef.current);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isDesktopViewport, slides.length, mobileSlides.length, goToSlide, goToMobileSlide]);

  // Pre-assign every slide to its grid pattern (not just the active one)
  // because the carousel renders all slides simultaneously. Memoised on
  // `slides` so the heavy pattern→item mapping doesn't re-run on each
  // slide change (only the translateX changes).
  const allDesktopSlideAssignments = useMemo(() => {
    return slides.map((slideItems) => {
      const pattern = pickPatternForSlide(slideItems);
      return {
        slots: assignToPattern(slideItems, pattern),
        pattern,
      };
    });
  }, [slides]);

  // Section-level IntersectionObserver. Once the gallery scrolls into the
  // viewport, eagerLoad flips true and every <video> bumps from
  // preload="metadata" to preload="auto" — the browser starts pulling the
  // full bytes for all 12 featured videos in parallel. The carousel keeps
  // them mounted, so the loaded state survives slide changes.
  // amount=0.05 fires as soon as a sliver of the gallery is visible;
  // once=true keeps it stuck on after first reveal so quickly scrolling
  // past doesn't cancel the preload.
  const sectionRef = useRef(null);
  const sectionInView = useInView(sectionRef, { amount: 0.05, once: true });

  // Two-phase preview-byte prefetch. The first 6 videos
  // Wave-based reveal. When the gallery scrolls into view, the first
  // 6 cards (slide 1) unlock immediately so the user has something to
  // watch right away. After PHASE_2_DELAY_MS each of the remaining
  // cards unlocks one at a time spaced PHASE_2_STAGGER_MS apart —
  // crucial on Chrome Windows, which trips over 6 simultaneous
  // decoder requests but handles them fine when they arrive in a
  // queue. Mac (which has a much bigger decoder pool) just sees a
  // ~1.5–3.5 s reveal of the back row, no different from a single
  // setLoadPhase flip.
  const PHASE_2_DELAY_MS = 1500;
  const PHASE_2_STAGGER_MS = 300;
  const [unlockedCount, setUnlockedCount] = useState(0);
  useEffect(() => {
    if (!sectionInView) return undefined;
    // Phase 1: unlock the first 6 cards in one shot so slide 1 lights
    // up together.
    setUnlockedCount((prev) => (prev < 6 ? 6 : prev));
    // Phase 2: schedule staggered unlocks for cards 7..12.
    const timeouts = [];
    for (let i = 7; i <= 12; i += 1) {
      const delay = PHASE_2_DELAY_MS + (i - 7) * PHASE_2_STAGGER_MS;
      const id = window.setTimeout(() => {
        setUnlockedCount((prev) => Math.max(prev, i));
      }, delay);
      timeouts.push(id);
    }
    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [sectionInView]);

  const cardEagerLoad = useCallback(
    (item) => {
      if (!sectionInView) return false;
      const order = Number.isInteger(item?._loadOrder) ? item._loadOrder : 0;
      // unlockedCount=6 → orders 0..5 (slide 1) eligible; later
      // increments add 6, 7, 8 … up to the full 12.
      return order < unlockedCount;
    },
    [sectionInView, unlockedCount]
  );

  // Force-play sweep: on every slide change (manual nav OR autoplay
  // tick), walk every <video> in the gallery and kick play on any
  // that are paused. With all 12 cards looping continuously this sweep
  // is a safety net — Chrome / Safari occasionally suspend muted
  // videos translated off-screen, and the per-card heartbeat takes up
  // to 1.5 s to recover; running on every slide change means a
  // suspended card resumes the moment its slide comes back into view.
  useEffect(() => {
    if (!sectionInView || !sectionRef.current) return;
    const videos = sectionRef.current.querySelectorAll("video");
    videos.forEach((video) => {
      if (!video.paused) return;
      if (video.ended) video.currentTime = 0;
      const promise = video.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {
          // Autoplay transiently blocked — per-card heartbeat retries.
        });
      }
    });
  }, [carouselIdx, mobileCarouselIdx, sectionInView]);

  // ----- Infinite forward loop -----
  // Cloned data: append a copy of the first slide at the end of each rendered
  // row so the carousel can keep sliding leftward past the last real slide
  // and land on a frame that *looks* identical to slide 0. The snap-back
  // effects below then reset carouselIdx to 0 silently.
  const desktopRendered = useMemo(() => {
    if (!allDesktopSlideAssignments.length) return [];
    return [...allDesktopSlideAssignments, allDesktopSlideAssignments[0]];
  }, [allDesktopSlideAssignments]);

  const mobileRendered = useMemo(() => {
    if (!mobileSlides.length) return [];
    return [...mobileSlides, mobileSlides[0]];
  }, [mobileSlides]);

  // Snap-back: once the carousel finishes animating to the clone position,
  // disable the transition for one frame, set carouselIdx back to 0, then
  // re-enable transitions. Two requestAnimationFrame hops are needed so
  // framer-motion sees the transition prop flip *before* the new x value
  // — otherwise it would animate the snap.
  useEffect(() => {
    const N = slides.length;
    if (N === 0 || carouselIdx !== N) return undefined;
    const timeout = setTimeout(() => {
      setEnableTransition(false);
      setCarouselIdx(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setEnableTransition(true));
      });
    }, SLIDE_SETTLE_MS + 30);
    return () => clearTimeout(timeout);
  }, [carouselIdx, slides.length]);

  useEffect(() => {
    const M = mobileSlides.length;
    if (M === 0 || mobileCarouselIdx !== M) return undefined;
    const timeout = setTimeout(() => {
      setEnableMobileTransition(false);
      setMobileCarouselIdx(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setEnableMobileTransition(true));
      });
    }, SLIDE_SETTLE_MS + 30);
    return () => clearTimeout(timeout);
  }, [mobileCarouselIdx, mobileSlides.length]);


  // Show loading state
  if (loading) {
    return (
      <section className="relative py-0">
        <div className="w-screen">
          <div className="flex h-[75vh] items-center justify-center">
            <div className="text-center">
              <div className="relative">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900"></div>
                <div className="absolute inset-0 mx-auto h-12 w-12 animate-ping rounded-full border-4 border-neutral-300 opacity-20"></div>
              </div>
              <p className="mt-6 text-lg font-medium text-neutral-700">{ui.loadingProjectsText}</p>
              <p className="mt-2 text-sm text-neutral-500">Vui lòng chờ trong giây lát</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Show empty state
  if (projects.length === 0) {
    return (
      <section className="relative py-0">
        <div className="w-screen">
          <div className="flex h-[75vh] items-center justify-center">
            <div className="text-center max-w-md mx-auto px-6">
              <div className="mb-6">
                <div className="mx-auto h-16 w-16 rounded-full bg-neutral-100 flex items-center justify-center">
                  <svg className="h-8 w-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-neutral-800 mb-2">Chưa có dự án nào</h3>
              <p className="text-neutral-600 mb-4">Chưa có dự án nào được thêm vào gallery.</p>
              <div className="text-left bg-neutral-50 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-neutral-700 mb-2">Để thêm dự án:</p>
                <ul className="text-sm text-neutral-600 space-y-1">
                  <li>• Mở trang quản trị custom tại /admin</li>
                  <li>• Đăng nhập bằng ADMIN_PASSWORD</li>
                  <li>• Đặt featured = true cho dự án</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section
        className="relative py-0 sm:pt-24"
        style={{ 
          left: "50%", 
          transform: "translateX(-50%)", 
          width: "100vw", 
          position: "relative",
          paddingTop: "0px", // remove top spacing on mobile
          paddingBottom: "0px",
          marginTop: "0px",
          minHeight: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <div className="w-[92vw] lg:w-[80vw]" style={{ 
          paddingTop: "0px", 
          marginTop: "0px",
          margin: "0 auto"
        }}>
          {/* Slider */}
          <div className="relative pb-12 sm:pb-16 md:pb-20 sm:mt-10">
            {/* Apple-style horizontal carousel viewport.
                Every slide stays mounted inside the inner flex row, even
                the off-screen ones. We translateX the whole row (not each
                slide) so the active page lines up with the viewport. The
                key win is that <video> elements never unmount, so the
                browser doesn't have to re-fetch or re-decode when the
                user navigates between slides — autoplay resumes the moment
                the slide enters view.
                The desktop and mobile carousels are siblings (both always
                in the DOM) because the `slides[]` and `mobileSlides[]`
                arrays slice the same projects differently. Tailwind's
                `hidden lg:flex` / `lg:hidden flex` drives which one is
                visible per breakpoint.
                py-3 leaves room for the per-card hover lift; overflow-x
                cannot be `hidden` here without also clipping the lift
                vertically (CSS forces overflow-y to auto when only one
                axis is hidden), so we accept a small horizontal clip
                from `overflow-hidden`. */}
            {/* The arrows are siblings of the viewport inside this `relative`
                wrapper so `top-1/2 -translate-y-1/2` aligns them with the
                vertical centre of the gallery cards (not the section, which
                also covers the dots and CTA below). */}
            <div ref={sectionRef} className="relative">
              {/* overflow-hidden clips the off-screen clone slide; py-3
                  leaves headroom for the per-card hover lift. */}
              <div className="relative overflow-hidden py-3">
                {/* Desktop carousel — visible on lg+ only.
                    Renders N+1 slides (real slides plus a clone of slide 0
                    appended). carouselIdx may transiently equal N (clone),
                    after which the snap-back effect resets it to 0 with
                    the transition disabled — so pressing "next" past the
                    last slide visually keeps sliding leftward, never
                    snaps right. */}
                {slides.length > 0 && viewportMode !== "mobile" ? (
                  <motion.div
                    className={viewportMode === "desktop" ? "flex" : "hidden lg:flex"}
                    style={{
                      width: `${desktopRendered.length * 100}%`,
                      willChange: "transform",
                    }}
                    animate={{
                      x: `${-carouselIdx * (100 / desktopRendered.length)}%`,
                    }}
                    transition={enableTransition ? slideTransition : { duration: 0 }}
                  >
                    {desktopRendered.map((slideAssignment, renderIdx) => {
                      // Clones reuse the source slide's grid template + items
                      // — they're visually identical to the slide they clone.
                      const { slots, pattern } = slideAssignment;
                      return (
                        <div
                          key={`d-slide-${renderIdx}`}
                          className="shrink-0"
                          style={{ width: `${100 / desktopRendered.length}%` }}
                        >
                          <div
                            className="grid gap-3 px-4 lg:px-6 projects-grid"
                            style={{
                              gridTemplateColumns: pattern.desktop.columns,
                              gridTemplateRows: pattern.desktop.rows,
                              gridTemplateAreas: pattern.desktop.template.join(' '),
                              height: 'auto',
                              gap: 'clamp(8px, 1vw, 16px)',
                              alignItems: 'stretch',
                              justifyItems: 'stretch',
                              maxWidth: '100%',
                              margin: '0 auto'
                            }}
                          >
                            {slots.map((slot, idx) => (
                              <FeaturedCard
                                key={`d-${renderIdx}-${slot.item.id}-${idx}`}
                                areaName={slot.area}
                                slotShape={slot.shape}
                                item={slot.item}
                                onOpen={openProject}
                                index={idx}
                                eagerLoad={cardEagerLoad(slot.item)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                ) : null}

                {/* Mobile carousel — visible below lg. Same clone strategy. */}
                {mobileSlides.length > 0 && viewportMode !== "desktop" ? (
                  <motion.div
                    className={viewportMode === "mobile" ? "flex" : "lg:hidden flex"}
                    style={{
                      width: `${mobileRendered.length * 100}%`,
                      willChange: "transform",
                    }}
                    animate={{
                      x: `${-mobileCarouselIdx * (100 / mobileRendered.length)}%`,
                    }}
                    transition={enableMobileTransition ? slideTransition : { duration: 0 }}
                  >
                    {mobileRendered.map((items, renderIdx) => {
                      // sourceIdx drives the layout-pick (1P+4L on the first
                      // two real pages, 2P after) so the clone of slide 0
                      // mimics slide 0's layout, not the layout of "the next
                      // index" which would mis-render the clone as a 2P page.
                      const sourceIdx = renderIdx >= mobileSlides.length ? 0 : renderIdx;
                      return (
                        <div
                          key={`m-slide-${renderIdx}`}
                          className="shrink-0 px-4"
                          style={{ width: `${100 / mobileRendered.length}%` }}
                        >
                          {(() => {
                            if (sourceIdx <= 1 && items.length >= 3) {
                              const a = items[0];
                              const b = items[1];
                              const c = items[2];
                              const d = items[3];
                              const e = items[4];
                              return (
                                <div className="grid grid-cols-2 grid-rows-3 gap-3">
                                  {a && (
                                    <div className="row-span-2">
                                      <FeaturedCard item={a} onOpen={openProject} index={0} fillHeight forceAspectRatio={9/16} eagerLoad={cardEagerLoad(a)} />
                                    </div>
                                  )}
                                  {b && (
                                    <div>
                                      <FeaturedCard item={b} onOpen={openProject} index={1} fillHeight forceAspectRatio={16/9} eagerLoad={cardEagerLoad(b)} />
                                    </div>
                                  )}
                                  {c && (
                                    <div>
                                      <FeaturedCard item={c} onOpen={openProject} index={2} fillHeight forceAspectRatio={16/9} eagerLoad={cardEagerLoad(c)} />
                                    </div>
                                  )}
                                  <div className="col-span-2 grid grid-cols-2 gap-3">
                                    {d && (
                                      <div>
                                        <FeaturedCard item={d} onOpen={openProject} index={3} fillHeight forceAspectRatio={16/9} eagerLoad={cardEagerLoad(d)} />
                                      </div>
                                    )}
                                    {e && (
                                      <div>
                                        <FeaturedCard item={e} onOpen={openProject} index={4} fillHeight forceAspectRatio={16/9} eagerLoad={cardEagerLoad(e)} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div className="grid grid-cols-2 gap-3">
                                {items.map((it, i) => (
                                  <div key={i}>
                                    <FeaturedCard item={it} onOpen={openProject} index={i} fillHeight forceAspectRatio={9/16} eagerLoad={cardEagerLoad(it)} />
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </motion.div>
                ) : null}
              </div>

              {/* Arrows: positioned relative to the viewport-wrapper so
                  top-1/2 lines them up with the cards (not the section,
                  which also covers the dots and CTA below). hidden on
                  mobile because the dot indicators below already serve
                  as touch nav. */}
              {slides.length > 1 ? (
                <button
                  type="button"
                  onClick={() => goToSlide(slideRef.current - 1)}
                  className="hidden sm:flex items-center justify-center absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-[55] h-8 w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 rounded-full bg-white/10 backdrop-blur-md border border-white/30 text-neutral-900 hover:bg-white/20 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 shadow-lg"
                  aria-label="Trang trước"
                >
                  <MdChevronLeft className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" />
                </button>
              ) : null}
              {slides.length > 1 ? (
                <button
                  type="button"
                  onClick={() => goToSlide(slideRef.current + 1, /* useClone */ true)}
                  className="hidden sm:flex items-center justify-center absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-[55] h-8 w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 rounded-full bg-white/10 backdrop-blur-md border border-white/30 text-neutral-900 hover:bg-white/20 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 shadow-lg"
                  aria-label="Trang tiếp theo"
                >
                  <MdChevronRight className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" />
                </button>
              ) : null}
            </div>

            {/* Navigation indicators stay outside the carousel viewport so
                they remain anchored — only their active state updates as
                the gallery translates. */}
            {/* Mobile - show horizontal dot indicators */}
            {mobileSlides.length > 1 && (
              <div className="md:hidden mt-6 flex flex-row justify-center items-center">
                {mobileSlides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => goToMobileSlide(idx)}
                    // 44×44 hidden hit area; visible dot inside stays 8 px
                    // so the indicator looks unchanged while the touch
                    // surface is finger-sized.
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] focus:outline-none"
                    aria-label={`Trang ${idx + 1}`}
                  >
                    <span
                      className={clsx(
                        "block h-2 w-2 rounded-full transition-colors duration-300 ease-out",
                        idx === mobileSlide
                          ? "bg-neutral-900"
                          : "bg-neutral-900/30"
                      )}
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Desktop - show dots based on desktop slides */}
            {slides.length > 1 && (
              <div className="hidden md:flex mt-8 sm:mt-10 justify-center items-center gap-3">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goToSlide(idx)}
                    className={clsx(
                      "rounded-full transition-all duration-500 ease-out",
                      "hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white/50",
                      idx === slide
                        ? "w-10 md:w-12 h-2 bg-neutral-900"
                        : "w-2 h-2 bg-neutral-900/40 hover:bg-neutral-900/60"
                    )}
                  />
                ))}
              </div>
            )}

            {/* "Xem tất cả dự án" CTA moved up to the heading row in
                src/app/page.jsx so it sits top-right of the gallery
                instead of below the dots. */}
          </div>

        </div>

      </section>

      {/* Modal overlay - đặt bên ngoài section để che phủ toàn bộ màn hình */}
      <AnimatePresence>
        {isModalOpen && selectedProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 px-4 pt-24 pb-6 sm:pt-28 sm:pb-8"
            onClick={closeProject}
          >
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative w-[95vw] max-w-8xl h-full max-h-[calc(100vh-8rem)] sm:max-h-[calc(100vh-9rem)] bg-neutral-950 rounded-2xl border border-white/10 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile top bar (black) with close button */}
              <div className="sm:hidden sticky top-0 z-20 bg-black/90 text-white px-4 py-3 flex justify-end pointer-events-auto select-none" onClick={(e)=>e.stopPropagation()}>
                <button
                  onClick={(e)=>{ e.stopPropagation(); closeProject(); }}
                  className="relative z-[100000] inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full hover:bg-white/10 focus:outline-none"
                  aria-label="Đóng"
                >
                  ✕
                </button>
              </div>
              {/* Desktop floating close button */}
              <button
                onClick={(e)=>{ e.stopPropagation(); closeProject(); }}
                className="hidden sm:flex absolute top-3 right-3 z-10 h-11 w-11 items-center justify-center rounded-full bg-white/20 border border-white/30 text-white hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
                aria-label="Đóng"
              >
                ✕
              </button>

              <div className="flex flex-col lg:flex-row h-full w-full">
                {/* Media section */}
                <div className="relative w-full lg:w-2/3 h-1/2 lg:h-full bg-black">
                  {isVideoUrl(selectedProject.media) ? (
                    <video
                      src={selectedProject.media}
                      className="h-full w-full object-contain"
                      controls
                      controlsList="nodownload nofullscreen noremoteplayback"
                      disablePictureInPicture
                      onContextMenu={(e) => e.preventDefault()}
                      autoPlay
                      playsInline
                      poster={selectedProject.poster || ''}
                      onClick={(e) => {
                        // Toggle play/pause on desktop
                        try {
                          if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
                            const v = e.currentTarget;
                            if (v.paused) {
                              v.play();
                            } else {
                              v.pause();
                            }
                          }
                        } catch {}
                      }}
                    />
                  ) : (
                    <Image
                      src={selectedProject.media}
                      alt={selectedProject.title}
                      fill
                      className="object-contain"
                    />
                  )}
                </div>

                {/* Info section - bottom on mobile, right on desktop */}
                <div className="w-full lg:w-1/3 h-1/2 lg:h-full overflow-y-auto p-4 lg:p-6 bg-neutral-900/40 border-t lg:border-t-0 lg:border-l border-white/10">
                  <div className="font-display text-xl lg:text-2xl font-bold text-white leading-tight pr-8 lg:pr-16">
                    {selectedProject.title}
                  </div>

                  {/* 2. Thời gian hoàn thành và Thể loại cùng hàng */}
                  <div className="mt-3 lg:mt-4 flex items-center gap-2 lg:gap-4 flex-wrap">
                    {selectedProject.completionDate && (
                      <TimeAgo completionDate={selectedProject.completionDate} className="text-neutral-300 text-xs lg:text-sm" />
                    )}
                    {/* Show multi categories if available, otherwise fallback to single category */}
                    {Array.isArray(selectedProject.categories) && selectedProject.categories.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedProject.categories.map((cat, index) => (
                          <div key={index} className="inline-block px-2 py-0.5 lg:px-3 lg:py-1 bg-white/10 rounded-full text-xs font-medium text-white border border-white/20">
                            {cat}
                          </div>
                        ))}
                      </div>
                    ) : (
                      selectedProject.category && (
                        <div className="inline-block px-2 py-0.5 lg:px-3 lg:py-1 bg-white/10 rounded-full text-xs font-medium text-white border border-white/20">
                          {selectedProject.category}
                        </div>
                      )
                    )}
                  </div>

                  {/* 4. Author */}
                  <div className="mt-4 lg:mt-6">
                    <AuthorAvatar size="md" textColor="text-white" />
                  </div>

                  {/* 5. Mô tả chi tiết */}
                  {selectedProject.description && (
                    <div className="mt-4 lg:mt-6 space-y-2 lg:space-y-3 text-xs lg:text-sm text-neutral-200">
                      <RichTextRenderer
                        content={selectedProject.description}
                        className="text-neutral-200 leading-relaxed"
                      />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ProjectsGallery;
