"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { getProjects, getStrapiImageUrl, getStrapiVideoUrl, extractTextFromRichText } from "@/lib/strapi";
import Container from "@/components/Container";
import AuthorAvatar from "@/components/AuthorAvatar";
import TimeAgo from "@/components/TimeAgo";
import RichTextRenderer from "@/components/RichTextRenderer";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import SearchWithCategoryDropdown from "@/components/SearchWithCategoryDropdown";
import CategoryQuickPicker from "@/components/CategoryQuickPicker";
import { useSiteContent } from "@/components/SiteContentProvider";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

// Pattern bất đối xứng 3 cột mô phỏng layout tham chiếu (lặp tuần tự)
// Mỗi slot xác định cột, số hàng (row span) và orientation mong muốn để gán item phù hợp
// Giá trị row tương thích với gridAutoRows=8px (row span 32 ~ 256px + gaps)
const MASONRY_PATTERN = [
  { col: 1, row: 32, desired: 'portrait' },
  { col: 2, row: 18, desired: 'landscape' },
  { col: 3, row: 18, desired: 'landscape' },
  { col: 2, row: 26, desired: 'landscape' },
  { col: 3, row: 32, desired: 'portrait' },
  { col: 1, row: 18, desired: 'landscape' },
  { col: 2, row: 18, desired: 'landscape' },
];

// Component cho từng project card với masonry layout
const MasonryCard = ({ item, onOpen, index = 0 }) => {
  const videoRef = useRef(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState(16/9);
  const [isMobile, setIsMobile] = useState(false);

  // Detect screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);
  
  // Detect if media is video
  const isVideo = item.video && /\.(mp4|webm|ogg|mov|avi)$/i.test(item.video);

  const orientation = useMemo(() => {
    if (item.orientationField && item.orientationField !== 'square') {
      return item.orientationField;
    }
    if (isVideo && item.width && item.height) {
      const ratio = item.width / item.height;
      return ratio >= 1.0 ? 'landscape' : 'portrait';
    }
    if (item.thumbWidth && item.thumbHeight) {
      const ratio = item.thumbWidth / item.thumbHeight;
      return ratio >= 1.0 ? 'landscape' : 'portrait';
    }
    return 'portrait';
  }, [isVideo, item.width, item.height, item.thumbWidth, item.thumbHeight, item.orientationField]);

  // Masonry 3 cột: mọi item đều giữ 1 cột, vị trí thực tế set bằng inline style
  const gridSpanClasses = 'col-span-1 sm:col-span-1';

  // Video metadata load handler (không cần auto-play nữa)
  useEffect(() => {
    if (!videoRef.current || !isVideo) return;
    
    const video = videoRef.current;
    
    const handleError = () => {
      setIsVideoPlaying(false);
    };

    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('error', handleError);
    };
  }, [isVideo]);

  // Handle video metadata load
  const handleVideoLoadedMetadata = (e) => {
    const video = e.currentTarget;
    setVideoAspectRatio(video.videoWidth / video.videoHeight);
  };

  // Aspect ratio để hiển thị đúng theo orientation Strapi
  const aspectRatioValue = useMemo(() => {
    if (orientation === 'portrait') return 9/16;
    if (orientation === 'landscape') return 16/9;
    // Fallback theo kích thước thật nếu orientation không xác định
    if (item.thumbWidth && item.thumbHeight) return item.thumbWidth / item.thumbHeight;
    if (item.width && item.height) return item.width / item.height;
    return 16/9;
  }, [orientation, item.thumbWidth, item.thumbHeight, item.width, item.height]);

  // Style cho mobile vs desktop
  const cardStyle = useMemo(() => {
    // Desktop dùng row-span cố định theo pattern, không ép aspectRatio
    if (!isMobile) return {};
    // Mobile giữ aspectRatio để đúng tỉ lệ
    return { aspectRatio: aspectRatioValue };
  }, [aspectRatioValue, isMobile]);

  // Xếp theo pattern cố định dựa vào index (không phụ thuộc tải media)
  const slot = useMemo(() => MASONRY_PATTERN[index % MASONRY_PATTERN.length], [index]);
  const gridStyle = useMemo(() => {
    // Mobile uses a flex column stack — masonry slots / row spans only apply
    // on the sm:grid layout. Returning {} on mobile keeps cards in normal flow.
    if (isMobile) return {};
    const style = { gridColumn: `${slot.col} / span 1` };
    if (slot.row) {
      // gridAutoRows = 8px nên row 32 ~ 256px (chưa tính gap)
      return { ...style, gridRowEnd: `span ${slot.row}` };
    }
    return style;
  }, [slot, isMobile]);

  // Tính span động theo chiều cao thực tế để khít, tránh chồng chéo (chỉ dùng trên mobile)
  const containerRef = useRef(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const rowHeight = 8; // khớp gridAutoRows
      const gap = 8; // khớp gap 2 (0.5rem = 8px)
      const height = el.getBoundingClientRect().height;
      const span = Math.ceil((height + gap) / (rowHeight + gap));
      el.style.gridRowEnd = `span ${span}`;
    };
    if (isMobile) {
      compute();
      window.addEventListener('resize', compute);
      return () => window.removeEventListener('resize', compute);
    }
  }, [aspectRatioValue, orientation, isMobile]);

  return (
    <motion.div
      ref={containerRef}
      className={`relative group overflow-hidden rounded-2xl bg-neutral-900 text-white shadow-lg cursor-pointer ${gridSpanClasses}`}
      // Hover transition is shorter and uses Apple's signature ease curve so the
      // scale-up settles fast without inheriting the 0.5s entry transition.
      whileHover={{ scale: 1.02, transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] } }}
      onClick={() => onOpen && onOpen(item)}
      initial={{ opacity: 0, scale: 0.98 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "0px 0px -50px" }}
      transition={{ duration: 0.5, delay: Math.min(index, 6) * 0.06 }}
      style={{ ...cardStyle, ...gridStyle }}
    >
      <div className="relative w-full h-full overflow-hidden bg-neutral-800">
        {isVideo ? (
          // Hiển thị thumbnail cho video thay vì autoplay
          <div className="relative h-full w-full group">
            {item.thumbnail ? (
              <Image
                src={item.thumbnail}
                alt={item.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className={isMobile ? "object-contain" : "object-cover"}
                loading="lazy"
              />
            ) : (
              <div className="relative h-full w-full bg-neutral-700 flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={item.video}
                  className={isMobile ? "h-full w-full object-contain" : "h-full w-full object-cover"}
                  muted
                  playsInline
                  controls={false}
                  preload="metadata"
                  poster=""
                  controlsList="nodownload nofullscreen noremoteplayback"
                  disablePictureInPicture
                  onContextMenu={(e) => e.preventDefault()}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onError={() => setIsVideoPlaying(false)}
                />
                {/* Fallback content if video fails to load */}
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-800 text-white text-sm">
                  <div className="text-center">
                    <div className="text-lg font-semibold">{item.title}</div>
                    <div className="text-xs text-neutral-400 mt-1">Video</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : item.media ? (
          <Image
            src={item.media}
            alt={item.title || "Project"}
            fill
            className={isMobile ? "object-contain" : "object-cover"}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-800">
            <span className="text-neutral-400 text-sm">Không có media</span>
          </div>
        )}
      </div>
      
      {/* Overlay with project info — opacity-only transition (avoids
          animating layout/transform together) and 200ms so info reveals just
          ahead of the card scale settling. */}
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]">
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          {/* Display multiple categories */}
          {item.categories && item.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {item.categories.map((cat, index) => (
                <span key={index} className="text-xs uppercase tracking-widest text-neutral-300 bg-white/20 px-2 py-1 rounded">
                  {cat}
                </span>
              ))}
            </div>
          )}
          {!item.categories && item.category && (
            <div className="text-xs uppercase tracking-widest text-neutral-300 mb-2">{item.category}</div>
          )}
          <div className="mt-1 font-display text-xl font-semibold">{item.title}</div>
          {item.client && (
            <div className="mt-1 text-sm text-neutral-400">{item.client}</div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default function PortfolioPage() {
  const { ui, portfolio: portfolioContent } = useSiteContent();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tất cả");
  const [page, setPage] = useState(1);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [pageSize, setPageSize] = useState(20); // Default to desktop size

  // Detect screen size and adjust page size
  useEffect(() => {
    const updatePageSize = () => {
      // 640px is the sm breakpoint in Tailwind
      setPageSize(window.innerWidth < 640 ? 8 : 20);
    };

    // Set initial value
    updatePageSize();

    // Listen for resize events
    window.addEventListener('resize', updatePageSize);

    return () => {
      window.removeEventListener('resize', updatePageSize);
    };
  }, []);

  // Fetch projects from Strapi
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await getProjects();
        if (response.data) {
          const formattedProjects = response.data.map(project => {
            const attrs = project.attributes || {};
            const mediaData = attrs.media?.data;
            const mediaList = Array.isArray(mediaData) ? mediaData : (mediaData ? [mediaData] : []);
            const thumbnailAttr = attrs.thumbnail?.data?.attributes || null;
            
            let thumbAttrs = thumbnailAttr;
            if (!thumbAttrs) {
              const firstImage = mediaList.find(m => m?.attributes?.mime?.startsWith("image/"));
              if (firstImage) thumbAttrs = firstImage.attributes;
            }
            const firstImageAttrs = mediaList.find(m => m?.attributes?.mime?.startsWith("image/"))?.attributes || {};
            const firstVideoAttrs = mediaList.find(m => m?.attributes?.mime?.startsWith("video/"))?.attributes || null;
            
            const thumbUrl = thumbAttrs?.formats?.medium?.url || thumbAttrs?.formats?.small?.url || thumbAttrs?.url || "";
            let thumbnail = thumbUrl ? (getStrapiImageUrl(thumbUrl) || thumbUrl) : "";
            const thumbWidth = (thumbAttrs?.formats?.medium?.width || thumbAttrs?.formats?.small?.width || thumbAttrs?.width) || undefined;
            const thumbHeight = (thumbAttrs?.formats?.medium?.height || thumbAttrs?.formats?.small?.height || thumbAttrs?.height) || undefined;
            
            // If no thumbnail but has video from Cloudinary, use previewUrl or generate thumbnail
            if (!thumbnail && firstVideoAttrs?.previewUrl) {
              thumbnail = firstVideoAttrs.previewUrl;
            }

            const width = firstImageAttrs.width || undefined;
            const height = firstImageAttrs.height || undefined;
            const video = firstVideoAttrs ? (getStrapiVideoUrl(firstVideoAttrs?.url) || getStrapiImageUrl(firstVideoAttrs?.url)) : "";

            return {
              id: project.id,
              title: attrs.title,
              client: attrs.client,
              tagline: attrs.tagline,
              category: attrs.category,
              categories: attrs.categories || (attrs.category ? [attrs.category] : []),
              featured: attrs.featured,
              slug: attrs.slug,
              media: getStrapiImageUrl(firstImageAttrs.url || "") || firstImageAttrs.url || "",
              width,
              height,
              mime: firstImageAttrs.mime,
              orientation: width && height ? (height > width ? "portrait" : "landscape") : undefined,
              thumbnail,
              thumbWidth,
              thumbHeight,
              video,
              description: attrs.description,
              fullDescription: attrs.fullDescription,
              duration: attrs.duration,
              order: attrs.order,
              orientationField: attrs.orientation,
              completionDate: attrs.completionDate,
            };
          });
          
          formattedProjects.sort((a, b) => {
            const ao = a.order || a.id;
            const bo = b.order || b.id;
            return ao - bo;
          });

          setProjects(formattedProjects);
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  // Modal state
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const openProject = (item) => {
    setSelected(item);
    setIsOpen(true);
  };

  const closeProject = () => {
    setIsOpen(false);
    setTimeout(() => setSelected(null), 200);
  };

  // Ensure details are expanded on desktop, collapsible on mobile
  useEffect(() => {
    const onResize = () => {
      if (typeof window === 'undefined') return;
      setShowInfo(window.innerWidth >= 640); // sm and up shows details by default
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeProject();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  useBodyScrollLock(isOpen);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = projects.filter((p) =>
      [p.title, p.client, p.tagline].some((x) => (x || "").toLowerCase().includes(q))
    );
    if (category !== "Tất cả") {
      items = items.filter((p) => {
        // Check both single category and multiple categories
        const singleCategory = p.category === category;
        const multipleCategories = p.categories && p.categories.includes(category);
        return singleCategory || multipleCategories;
      });
    }
    return items;
  }, [query, category, projects]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => setPage(1), [query, category]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  // Chuẩn hóa orientation từ Strapi / kích thước để sắp xếp vào slot mong muốn
  const normalizeOrientation = (val) => {
    if (val === undefined || val === null) return undefined;
    const s = String(val).trim().toLowerCase();
    if (["portrait", "doc", "dọc", "vertical", "v", "p"].includes(s)) return "portrait";
    if (["landscape", "ngang", "horizontal", "h", "l"].includes(s)) return "landscape";
    return undefined;
  };

  // Sắp xếp lại item theo orientation cho khớp với pattern (không đổi kích thước/spans)
  const orderedPageItems = useMemo(() => {
    const items = [...pageItems];
    if (!items.length) return items;

    const getItemOrientation = (it) => {
      const o1 = normalizeOrientation(it.orientationField || it.orientation);
      if (o1) return o1;
      const w = it.width || it.thumbWidth;
      const h = it.height || it.thumbHeight;
      if (w && h) return h > w ? 'portrait' : 'landscape';
      return 'portrait';
    };

    // Hàng đợi theo orientation, giữ thứ tự hiện có
    const portraits = items.filter((it) => getItemOrientation(it) === 'portrait');
    const landscapes = items.filter((it) => getItemOrientation(it) === 'landscape');
    const fallback = items.filter((it) => !portraits.includes(it) && !landscapes.includes(it));

    const take = (arr) => arr.length ? arr.shift() : undefined;

    const result = [];
    for (let i = 0; i < items.length; i++) {
      const slot = MASONRY_PATTERN[i % MASONRY_PATTERN.length];
      let picked;
      if (slot.desired === 'portrait') {
        picked = take(portraits) || take(landscapes) || take(fallback);
      } else if (slot.desired === 'landscape') {
        picked = take(landscapes) || take(portraits) || take(fallback);
      } else {
        picked = take(landscapes) || take(portraits) || take(fallback);
      }
      if (picked) result.push(picked);
    }

    // Nếu còn thừa, nối vào cuối (không phá bố cục index trước)
    const remaining = [...portraits, ...landscapes, ...fallback];
    return result.concat(remaining);
  }, [pageItems]);

  // Categories shown in the search dropdown:
  // - Prefer the admin-curated whitelist from site content (lets editors hide
  //   noisy/internal tags from the picker even when projects still carry them).
  // - If the whitelist is empty, fall back to auto-collecting every category
  //   that appears on at least one project.
  const categories = useMemo(() => {
    const curated = (portfolioContent?.searchCategories || [])
      .map((c) => String(c).trim())
      .filter(Boolean);
    if (curated.length > 0) {
      return ["Tất cả", ...curated];
    }
    const allCategories = new Set();
    projects.forEach((p) => {
      if (p.category) allCategories.add(p.category);
      if (p.categories && Array.isArray(p.categories)) {
        p.categories.forEach((cat) => allCategories.add(cat));
      }
    });
    return ["Tất cả", ...Array.from(allCategories).sort()];
  }, [projects, portfolioContent]);

  // When the user starts typing a free-text query, clear any active category
  // filter so the search runs across the full project list. Prevents the
  // confusing "Recap + CellphoneS = no results" combination where the two
  // restrictive filters AND together.
  const handleQueryChange = (next) => {
    setQuery(next);
    if (next.trim().length > 0 && category !== "Tất cả") {
      setCategory("Tất cả");
    }
  };

  return (
    <main className="bg-white text-black">
      <Container className="pt-12 sm:pt-16">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-4xl font-semibold sm:text-6xl">Dự án Video</h1>
            <p className="mt-2 text-gray-600">
              {category && category !== "Tất cả" ? (
                <>
                  Tất cả dự án{" "}
                  <CategoryQuickPicker
                    active={category}
                    categories={categories}
                    onSelect={setCategory}
                  />{" "}
                  của XUONGART
                </>
              ) : (
                <>Tất cả dự án của XUONGART</>
              )}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <SearchWithCategoryDropdown
              query={query}
              onQueryChange={handleQueryChange}
              categories={categories}
              onCategorySelect={setCategory}
              projects={projects}
              onProjectSelect={openProject}
            />
          </div>
        </div>

        {loading ? (
          <div className="mt-10 flex justify-center">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900"></div>
              <p className="mt-4 text-gray-600">{ui.loadingProjectsText}</p>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <motion.div
              layout
              className="mt-10 flex flex-col gap-3 sm:grid sm:grid-cols-3 sm:gap-2 lg:grid-cols-3"
              style={{
                gridAutoRows: '8px',
                gridAutoFlow: 'dense',
                maxWidth: '1400px',
                margin: '0 auto',
                alignItems: 'stretch'
              }}
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
            >
              {orderedPageItems.map((item, i) => (
                <MasonryCard
                  key={item.id}
                  item={item}
                  onOpen={openProject}
                  index={i}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Pagination */}
        <div className="mt-10 flex justify-center gap-2 pb-16">
          {Array.from({ length: totalPages }).map((_, i) => {
            const n = i + 1;
            const active = n === page;
            return (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`min-h-[44px] min-w-[44px] rounded-md px-3 py-2 text-sm transition ${
                  active ? "bg-black text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </Container>

      {/* Modal */}
      <AnimatePresence>
        {isOpen && selected && (
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
              <div className="sm:hidden sticky top-0 z-20 bg-black/90 text-white px-4 py-3 flex justify-end">
                <button
                  onClick={closeProject}
                  className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full hover:bg-white/10 focus:outline-none"
                  aria-label="Đóng"
                >
                  ✕
                </button>
              </div>
              {/* Desktop floating close button */}
              <button
                onClick={closeProject}
                className="hidden sm:flex absolute top-3 right-3 z-10 h-11 w-11 items-center justify-center rounded-full bg-white/20 border border-white/30 text-white hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
                aria-label="Đóng"
              >
                ✕
              </button>

              <div className="flex flex-col lg:flex-row h-full w-full">
                <div className="relative w-full lg:w-2/3 h-1/2 lg:h-full bg-black">
                  {selected.video ? (
                    <video
                      src={selected.video}
                      className="h-full w-full object-contain"
                      controls
                      controlsList="nodownload nofullscreen noremoteplayback"
                      disablePictureInPicture
                      onContextMenu={(e) => e.preventDefault()}
                      autoPlay
                      playsInline
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
                  ) : selected.media ? (
                    <Image
                      src={selected.media}
                      alt={selected.title || "Project"}
                      fill
                      className="object-contain"
                    />
                  ) : selected.thumbnail ? (
                    <Image
                      src={selected.thumbnail}
                      alt={selected.title || "Project"}
                      fill
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white">Không có media</div>
                  )}
                </div>
                <div className="w-full lg:w-1/3 h-1/2 lg:h-full overflow-y-auto p-4 lg:p-6 bg-neutral-900/40 border-t lg:border-t-0 lg:border-l border-white/10">
                  {/* Mobile toggle for details */}
                  <div className="sm:hidden mb-3">
                    <button
                      onClick={() => setShowInfo(v => !v)}
                      className="inline-flex items-center rounded-full bg-white/10 text-white px-4 py-2 text-sm border border-white/20"
                    >
                      {showInfo ? 'Ẩn thông tin' : 'Xem thông tin'}
                    </button>
                  </div>
                  {(showInfo || typeof window === 'undefined') && (
                    <>
                      {/* 1. Tên dự án */}
                      <div className="font-display text-xl lg:text-2xl font-bold text-white leading-tight pr-8 lg:pr-16">
                        {selected.title}
                      </div>

                  {/* 2. Thời gian hoàn thành và Thể loại cùng hàng */}
                  <div className="mt-3 lg:mt-4 flex items-center gap-2 lg:gap-4 flex-wrap">
                    {selected.completionDate && (
                      <TimeAgo completionDate={selected.completionDate} className="text-neutral-300" />
                    )}
                    {/* Display multiple categories */}
                    {selected.categories && selected.categories.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {selected.categories.map((cat, index) => (
                          <div key={index} className="inline-block px-2 py-1 bg-white/10 rounded-full text-xs text-white border border-white/20">
                            {cat}
                          </div>
                        ))}
                      </div>
                    )}
                    {!selected.categories && selected.category && (
                      <div className="inline-block px-2 py-1 bg-white/10 rounded-full text-xs text-white border border-white/20">
                        {selected.category}
                      </div>
                    )}
                  </div>

                      {/* 4. Author (không có label "Tác giả") */}
                      <div className="mt-4 lg:mt-6">
                        <AuthorAvatar size="md" textColor="text-white" />
                      </div>

                      {/* 5. Mô tả chi tiết */}
                      <div className="mt-4 lg:mt-6 space-y-2 lg:space-y-3 text-xs lg:text-sm text-neutral-200">
                        {selected.description && (
                          <div>
                            <RichTextRenderer 
                              content={selected.description} 
                              className="text-neutral-200 leading-relaxed" 
                            />
                          </div>
                        )}
                        {selected.fullDescription && (
                          <div>
                            <RichTextRenderer 
                              content={selected.fullDescription} 
                              className="text-neutral-200 leading-relaxed" 
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}