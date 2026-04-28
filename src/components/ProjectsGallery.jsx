"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import clsx from "clsx";
import Link from "next/link";
import Image from "next/image";
import AuthorAvatar from "@/components/AuthorAvatar";
import TimeAgo from "@/components/TimeAgo";
import RichTextRenderer from "@/components/RichTextRenderer";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { getFeaturedProjects } from "@/lib/strapi";
import { useSiteContent } from "@/components/SiteContentProvider";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

const AUTOPLAY_INTERVAL_MS = 7000;
const DESKTOP_BREAKPOINT_QUERY = "(min-width: 1024px)";

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
  return undefined;
};

// Convert Strapi Rich Text (Blocks) or unknown objects to plain text
const blocksToPlainText = (value) => {
  if (typeof value === 'string') return value;
  if (!value) return '';
  // Strapi v4 rich text blocks is usually an array of nodes
  try {
    const walk = (node) => {
      if (!node) return '';
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) return node.map(walk).join('');
      const type = node.type || node.tag || '';
      const children = node.children || node.content || [];
      const text = node.text || '';
      const inner = text || walk(children);
      // Add line breaks for block-level nodes
      if (['paragraph', 'p', 'heading', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'list', 'ul', 'ol', 'blockquote'].includes(type)) {
        return `${inner}\n`;
      }
      return inner;
    };
    return walk(value).replace(/\n{3,}/g, '\n\n').trim();
  } catch (e) {
    return '';
  }
};

// Grid pattern cố định theo layout trong ảnh
const SLIDE_PATTERNS = [
  {
    desktop: {
      template: [
        '"a b b c d d"',
        '"a e e c f f"',
      ],
      areas: [
        { name: 'a', shape: 'portrait' },   // Order 1: Dự án dọc (Portrait)
        { name: 'b', shape: 'landscape' },  // Order 2: Dự án ngang (Landscape) 
        { name: 'c', shape: 'portrait' },   // Order 3: Dự án dọc (Portrait)
        { name: 'd', shape: 'landscape' },  // Order 4: Dự án ngang (Landscape)
        { name: 'e', shape: 'landscape' },  // Order 5: Dự án ngang (Landscape)
        { name: 'f', shape: 'landscape' },  // Order 6: Dự án ngang (Landscape)
      ],
    },
  },
];

// Generate grid template areas using pattern rotation
const generateGridTemplateAreas = (patternIndex, itemsCount) => {
  if (itemsCount <= 0) return [];
  
  const pattern = SLIDE_PATTERNS[patternIndex % SLIDE_PATTERNS.length].desktop;
  return pattern.template;
};

// Assign projects to pattern areas với thứ tự cố định
const assignToPattern = (items, pattern, orientationMap = {}) => {
  if (!items || items.length === 0) return [];
  
  // Cố định thứ tự items theo order field hoặc ID để tránh xáo trộn khi F5
  const sortedItems = [...items].sort((a, b) => {
    // Ưu tiên order field, fallback về ID
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

// Individual project card component
const FeaturedCard = ({ areaName, slotShape, item, onOpen, index = 0, fillHeight = false, forceAspectRatio }) => {
  const ref = useRef(null);
  const videoRef = useRef(null);
  const inView = useInView(ref, { amount: 0.35, margin: "-5% 0px -5% 0px" });
  const [videoAspectRatio, setVideoAspectRatio] = useState(16/9); // Aspect ratio của video
  const cardMediaUrl = item?.previewMedia || item?.media || "";
  const isVideoCard = isVideoUrl(cardMediaUrl);
  
  // Ép các media vuông thành hình chữ nhật (ưu tiên 16:9)
  const normalizeRectRatio = (ratio) => {
    if (!ratio || !isFinite(ratio)) return 16/9;
    // Nếu gần vuông (0.95 - 1.05) thì ép thành 16:9
    if (ratio > 0.95 && ratio < 1.05) return 16/9;
    return ratio;
  };

  // Keep thumbnail autoplay stable: resume when tab returns, when stream stalls, or when browser pauses unexpectedly.
  useEffect(() => {
    if (!videoRef.current || !isVideoCard) return;

    const video = videoRef.current;
    let retryTimeoutId = null;
    let heartbeatId = null;

    const canAutoplay = () => inView && !document.hidden;

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
      if (!canAutoplay()) return;
      video.currentTime = 0;
      tryPlay();
    };

    if (canAutoplay()) {
      scheduleRetry(0);
    } else {
      video.pause();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    video.addEventListener("pause", onPause);
    video.addEventListener("canplay", tryPlay);
    video.addEventListener("stalled", onBuffering);
    video.addEventListener("waiting", onBuffering);
    video.addEventListener("suspend", onBuffering);
    video.addEventListener("ended", onEnded);

    // Safety net: some browsers pause muted background videos silently.
    heartbeatId = window.setInterval(() => {
      if (canAutoplay() && video.paused && !video.ended) {
        tryPlay();
      }
    }, 2500);

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
  }, [inView, isVideoCard, cardMediaUrl]);

  const handleImageLoad = (img) => {
    // Không cần orientation detection nữa vì đã cố định trong pattern
    const ratio = (img.naturalWidth || 1) / (img.naturalHeight || 1);
    setVideoAspectRatio(normalizeRectRatio(ratio));
  };

  const handleVideoLoadedMetadata = (e) => {
    const v = e.currentTarget;
    const ratio = (v.videoWidth || 1) / (v.videoHeight || 1);
    
    // Chỉ lưu aspect ratio, không thay đổi orientation (nhưng ép vuông -> chữ nhật)
    setVideoAspectRatio(normalizeRectRatio(ratio));
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={inView ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
      transition={{ 
        duration: 0.8, 
        ease: [0.43, 0.13, 0.23, 0.96],
        delay: index * 0.1 // Stagger animation based on index
      }}
      className={clsx(
        "relative group overflow-hidden rounded-2xl bg-transparent text-white shadow-xl cursor-pointer",
        "hover:shadow-2xl transition-all duration-300",
        // Sử dụng slotShape từ pattern thay vì orientation state
        slotShape === 'portrait'
          ? 'col-span-2 row-span-2'
          : slotShape === 'landscape'
          ? 'col-span-3 row-span-1'
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
              aspectRatio:
                forceAspectRatio ||
                (slotShape === 'portrait'
                  ? 9 / 16
                  : slotShape === 'landscape'
                  ? 16 / 9
                  : videoAspectRatio || 16 / 9),
            })
      }}
      whileHover={{ 
        scale: 1.03,
        y: -5,
        transition: { duration: 0.3, ease: "easeOut" }
      }}
      onClick={() => onOpen && onOpen(item)}
    >
      <div className="relative h-full w-full">
        {isVideoCard ? (
          <div className="relative h-full w-full overflow-hidden">
            <video
              ref={videoRef}
              src={cardMediaUrl}
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
              preload="metadata"
              poster={item.poster || ''}
              webkit-playsinline="true"
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              onContextMenu={(e) => e.preventDefault()}
              onLoadedMetadata={handleVideoLoadedMetadata}
              onError={(e) => {
                console.error('Video playback error:', e);
              }}
            />
          </div>
        ) : cardMediaUrl ? (
          <Image
            src={cardMediaUrl}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 50vw, 33vw"
            className={fillHeight ? "object-cover" : "object-cover"}
            loading="lazy"
            onLoad={handleImageLoad}
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
};

// Modal component removed - no more black overlay

// Main ProjectsGallery component
const ProjectsGallery = () => {
  const { ui } = useSiteContent();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  const openProject = (project) => {
    setSelectedProject(project);
    setIsModalOpen(true);
  };

  const closeProject = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedProject(null), 200);
  };
  
  // Close on ESC
  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeProject();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModalOpen]);

  useBodyScrollLock(isModalOpen);
  const [slide, setSlide] = useState(0);
  const [mobileSlide, setMobileSlide] = useState(0); // Separate state for mobile
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(DESKTOP_BREAKPOINT_QUERY);
    const updateViewport = () => setIsDesktopViewport(mediaQuery.matches);

    updateViewport();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateViewport);
      return () => mediaQuery.removeEventListener("change", updateViewport);
    }

    mediaQuery.addListener(updateViewport);
    return () => mediaQuery.removeListener(updateViewport);
  }, []);

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
            
            // Prefer new fields if available, fallback to legacy 'description'
            const rawFull = project.attributes?.fullDescription || project.attributes?.description || '';
            const rawShort = project.attributes?.shortDescription || project.attributes?.description || '';
            const fullDescription = blocksToPlainText(rawFull);
            const shortDescription = blocksToPlainText(rawShort);
            const excerpt = shortDescription
              ? (shortDescription.length > 160 ? shortDescription.slice(0, 160).trim() + '…' : shortDescription)
              : '';
            
            // Orientation: prefer Strapi field, fallback to media dimensions
            const mediaW = mediaAttributes?.width;
            const mediaH = mediaAttributes?.height;
            const orientation = normalizeOrientation(project.attributes?.orientation)
              || (mediaW && mediaH ? (mediaH > mediaW ? 'portrait' : 'landscape') : undefined);
            
            return {
              id: project.id,
              title: project.attributes?.title || 'Untitled',
              client: project.attributes?.client || '',
              tagline: excerpt,
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

  const allItems = useMemo(
    () => projects.map((p) => ({ ...p, medias: p.medias.length > 0 ? p.medias : [{ url: p.media }] })),
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

  // Keep slide indexes in bounds when data changes.
  useEffect(() => {
    setSlide((current) => (slides.length > 0 ? current % slides.length : 0));
  }, [slides.length]);

  useEffect(() => {
    setMobileSlide((current) => (mobileSlides.length > 0 ? current % mobileSlides.length : 0));
  }, [mobileSlides.length]);

  // Autoplay only for the active viewport to avoid timer contention.
  useEffect(() => {
    const activeLength = isDesktopViewport ? slides.length : mobileSlides.length;
    if (activeLength <= 1) return undefined;

    let intervalId;
    const tick = () => {
      if (document.hidden) return;
      if (isDesktopViewport) {
        setSlide((current) => (current + 1) % slides.length);
      } else {
        setMobileSlide((current) => (current + 1) % mobileSlides.length);
      }
    };

    const start = () => {
      if (intervalId) window.clearInterval(intervalId);
      intervalId = window.setInterval(tick, AUTOPLAY_INTERVAL_MS);
    };

    start();

    const onVisibilityChange = () => {
      if (!document.hidden) start();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isDesktopViewport, slides.length, mobileSlides.length]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onFocus = () => {
      if (isDesktopViewport) {
        setSlide((current) => (slides.length > 0 ? current % slides.length : 0));
      } else {
        setMobileSlide((current) => (mobileSlides.length > 0 ? current % mobileSlides.length : 0));
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isDesktopViewport, slides.length, mobileSlides.length]);

  const desktopAssignedSlots = useMemo(() => {
    const currentSlideItems = slides[slide] || [];
    const pattern = SLIDE_PATTERNS[slide % SLIDE_PATTERNS.length];
    return assignToPattern(currentSlideItems, pattern);
  }, [slides, slide]);


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
          <div className="relative pb-12 sm:pb-16 md:pb-20 sm:mt-24">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={isDesktopViewport ? slide : mobileSlide}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ 
                  duration: 0.8, 
                  ease: [0.43, 0.13, 0.23, 0.96],
                  staggerChildren: 0.1
                }}
                className="overflow-visible"
              >
                {/* Desktop dynamic grid với kích thước cố định - chỉ hiển thị trên desktop */}
                <div
                  className="hidden lg:grid gap-3 px-4 lg:px-6 projects-grid"
                  style={{
                    // Mở rộng cột 1 và 4 (portrait) để thẻ a và c to hơn
                    gridTemplateColumns: '1.35fr 1fr 1fr 1.35fr 1fr 1fr',
                    gridTemplateRows: 'repeat(2, auto)',
                    gridTemplateAreas: generateGridTemplateAreas(slide, slides[slide]?.length || 0).join(' '),
                    height: 'auto',
                    gap: 'clamp(8px, 1vw, 16px)',
                    willChange: 'transform',
                    alignItems: 'stretch',
                    justifyItems: 'stretch',
                    maxWidth: '100%',
                    margin: '0 auto'
                  }}
                >
                  {desktopAssignedSlots.map((slot, idx) => (
                    <FeaturedCard
                      key={`${slide}-${slot.item.id}-${idx}`}
                      areaName={slot.area}
                      slotShape={slot.shape}
                      item={slot.item}
                      onOpen={openProject}
                      index={idx}
                    />
                  ))}
                </div>

                {/* Mobile grids: pages 0-1 use 1P+4L, last page shows 2P */}
                <div className="px-4 lg:hidden">
                  {(() => {
                    const items = mobileSlides[mobileSlide] || [];
                    if (mobileSlide <= 1 && items.length >= 3) {
                      const a = items[0];
                      const b = items[1];
                      const c = items[2];
                      const d = items[3];
                      const e = items[4];
                      return (
                        <div className="grid grid-cols-2 grid-rows-3 gap-3">
                          {a && (
                            <div className="row-span-2">
                              <FeaturedCard item={a} onOpen={openProject} index={0} fillHeight forceAspectRatio={9/16} />
                            </div>
                          )}
                          {b && (
                            <div>
                              <FeaturedCard item={b} onOpen={openProject} index={1} fillHeight forceAspectRatio={16/9} />
                            </div>
                          )}
                          {c && (
                            <div>
                              <FeaturedCard item={c} onOpen={openProject} index={2} fillHeight forceAspectRatio={16/9} />
                            </div>
                          )}
                          <div className="col-span-2 grid grid-cols-2 gap-3">
                            {d && (
                              <div>
                                <FeaturedCard item={d} onOpen={openProject} index={3} fillHeight forceAspectRatio={16/9} />
                              </div>
                            )}
                            {e && (
                              <div>
                                <FeaturedCard item={e} onOpen={openProject} index={4} fillHeight forceAspectRatio={16/9} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    // Last page: 2 portraits side-by-side
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        {items.map((it, i) => (
                          <div key={i}>
                            <FeaturedCard item={it} onOpen={openProject} index={i} fillHeight forceAspectRatio={9/16} />
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Navigation indicators - inside motion div to stay with content */}
                <>
                  {/* Mobile - show horizontal dot indicators */}
                  {mobileSlides.length > 1 && (
                    <div className="md:hidden mt-8 flex flex-row justify-center items-center gap-2.5">
                      {mobileSlides.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setMobileSlide(idx)}
                          className={clsx(
                            "block h-2 w-2 min-h-0 min-w-0 rounded-full border-0 p-0 transition-colors duration-300 ease-out",
                            "focus:outline-none focus:ring-2 focus:ring-neutral-900/50",
                            idx === mobileSlide
                              ? "bg-neutral-900"
                              : "bg-neutral-900/30 hover:bg-neutral-900/50"
                          )}
                          style={{ minHeight: 0, minWidth: 0 }}
                          aria-label={`Trang ${idx + 1}`}
                        />
                      ))}
                    </div>
                  )}
                  
                  {/* Desktop - show dots based on desktop slides */}
                  {slides.length > 1 && (
                    <div className="hidden md:flex mt-8 sm:mt-10 justify-center items-center gap-3">
                      {slides.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSlide(idx)}
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
                </>

                {/* View all projects button */}
                <div className="mt-14 sm:mt-20 flex justify-center">
                  <Link
                    href="/videos"
                    className="inline-flex items-center rounded-full bg-neutral-950 px-6 py-3 text-white text-sm font-medium shadow hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-400 transition"
                  >
                    Xem tất cả dự án
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

        </div>
        
      {/* Navigation arrows - only show for desktop */}
        {slides.length > 1 && (
          <>
            <button
              onClick={() => setSlide((s) => (s - 1 + slides.length) % slides.length)}
              className="hidden sm:flex items-center justify-center absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-[55] h-8 w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 rounded-full bg-white/10 backdrop-blur-md border border-white/30 text-neutral-900 hover:bg-white/20 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 shadow-lg"
              aria-label="Trang trước"
            >
              <MdChevronLeft className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" />
            </button>

            <button
              onClick={() => setSlide((s) => (s + 1) % slides.length)}
              className="hidden sm:flex items-center justify-center absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-[55] h-8 w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 rounded-full bg-white/10 backdrop-blur-md border border-white/30 text-neutral-900 hover:bg-white/20 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 shadow-lg"
              aria-label="Trang tiếp theo"
            >
              <MdChevronRight className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" />
            </button>
          </>
        )}
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
                  className="relative z-[100000] p-2 rounded-full hover:bg-white/10 focus:outline-none"
                  aria-label="Đóng"
                >
                  ✕
                </button>
              </div>
              {/* Desktop floating close button */}
              <button
                onClick={(e)=>{ e.stopPropagation(); closeProject(); }}
                className="hidden sm:flex absolute top-3 right-3 z-10 h-10 w-10 items-center justify-center rounded-full bg-white/20 border border-white/30 text-white hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
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
