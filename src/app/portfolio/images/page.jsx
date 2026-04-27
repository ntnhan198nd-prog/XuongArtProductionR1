"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { getImageProjects, formatImageProject } from "@/lib/imageProjects";
import { extractTextFromRichText } from "@/lib/strapi";
import Container from "@/components/Container";
import AuthorAvatar from "@/components/AuthorAvatar";
import TimeAgo from "@/components/TimeAgo";
import RichTextRenderer from "@/components/RichTextRenderer";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { FiSearch, FiX, FiChevronLeft, FiChevronRight } from "react-icons/fi";

const PAGE_SIZE = 20;

// Component cho từng project card với layout dọc
const ImageProjectCard = ({ item, onOpen, index = 0 }) => {
  return (
    <motion.div
      layout
      className="relative group overflow-hidden rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-lg cursor-pointer transition-all duration-300"
      whileHover={{ y: -4 }}
      onClick={() => onOpen && onOpen(item)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <div className="relative w-full h-64 sm:h-80 overflow-hidden bg-gray-100">
        {item.media ? (
          <Image
            src={item.media}
            alt={item.title || "Project"}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-100">
            <span className="text-gray-400 text-sm">Không có media</span>
          </div>
        )}
        
        {/* Hover overlay with project info */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end">
          <div className="p-4 sm:p-6 text-white w-full">
            {/* Display categories */}
            {(item.categories && item.categories.length > 0) && (
              <div className="flex flex-wrap gap-1 mb-2">
                {item.categories.map((cat, index) => (
                  <span key={index} className="text-xs uppercase tracking-widest text-gray-300 bg-white/20 px-2 py-1 rounded">
                    {cat}
                  </span>
                ))}
              </div>
            )}
            {!item.categories && item.category && (
              <div className="text-xs uppercase tracking-widest text-gray-300 mb-2">{item.category}</div>
            )}
            <div className="font-display text-lg sm:text-xl font-semibold">{item.title}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default function ImageProjectsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tất cả");
  const [page, setPage] = useState(1);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Fetch image projects from dedicated API
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        console.log('🔍 Image Projects: Fetching image projects...');
        const response = await getImageProjects();
        console.log('📊 Image Projects response:', response);
        
        if (response.data && response.data.length > 0) {
          const formattedProjects = response.data.map(project => formatImageProject(project));
          
          console.log('📋 Formatted projects:', formattedProjects);
          
          // Sort by order or id
          formattedProjects.sort((a, b) => {
            const ao = a.order || a.id;
            const bo = b.order || b.id;
            return ao - bo;
          });
          
          setProjects(formattedProjects);
        } else {
          // No data from API
          console.log('No data from API');
          setProjects([]);
        }
      } catch (error) {
        console.error('Error fetching image projects:', error);
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
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const openProject = (item) => {
    setSelected(item);
    setCurrentImageIndex(0);
    setIsOpen(true);
  };

  const closeProject = () => {
    setIsOpen(false);
    setTimeout(() => {
      setSelected(null);
      setCurrentImageIndex(0);
    }, 200);
  };

  

  const nextImage = () => {
    if (selected && selected.allImages) {
      setCurrentImageIndex((prev) => 
        prev < selected.allImages.length - 1 ? prev + 1 : 0
      );
    }
  };

  const prevImage = () => {
    if (selected && selected.allImages) {
      setCurrentImageIndex((prev) => 
        prev > 0 ? prev - 1 : selected.allImages.length - 1
      );
    }
  };

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeProject();
      if (e.key === 'ArrowLeft') prevImage();
      if (e.key === 'ArrowRight') nextImage();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, selected]);

  // Lock body scroll when modal open (mobile + desktop), but allow scrolling inside modal
  useEffect(() => {
    if (!isOpen) return;
    const prev = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overscrollBehaviorY: document.body.style.overscrollBehaviorY,
    };
    const scrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overscrollBehaviorY = 'contain';
    document.documentElement.classList.add('modal-open');
    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.overscrollBehaviorY = prev.overscrollBehaviorY;
      document.documentElement.classList.remove('modal-open');
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // Close suggestions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showSuggestions && !event.target.closest('.search-container')) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSuggestions]);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => setPage(1), [query, category]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // Get unique categories from projects
  const categories = useMemo(() => {
    const allCategories = new Set();
    
    projects.forEach(p => {
      // Add single category
      if (p.category) allCategories.add(p.category);
      
      // Add multiple categories
      if (p.categories && Array.isArray(p.categories)) {
        p.categories.forEach(cat => allCategories.add(cat));
      }
    });
    
    const cats = ["Tất cả", ...Array.from(allCategories).sort()];
    return cats;
  }, [projects]);

  // Handle category selection from suggestions
  const handleCategorySelect = (selectedCategory) => {
    setCategory(selectedCategory);
    setShowSuggestions(false);
    setIsSearchFocused(false);
  };

  return (
    <main className="bg-white text-black">
      <Container className="pt-12 sm:pt-16">
        <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl md:text-6xl font-semibold">Dự án Hình ảnh</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600">Tất cả dự án hình ảnh của XUONGART</p>
          </div>
          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
            <div className="search-container relative">
              <motion.div
                initial={false}
                animate={{
                  width: isSearchFocused ? 600 : 260,
                  borderTopLeftRadius: showSuggestions ? 18 : 9999,
                  borderTopRightRadius: showSuggestions ? 18 : 9999,
                  borderBottomLeftRadius: showSuggestions ? 0 : 9999,
                  borderBottomRightRadius: showSuggestions ? 0 : 9999,
                }}
                transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                className={`overflow-hidden border-2 bg-white ${
                  showSuggestions
                    ? "border-gray-200 border-b-transparent shadow-md"
                    : isSearchFocused
                    ? "border-gray-300 shadow-md"
                    : "border-transparent shadow-sm"
                }`}
                style={{ minWidth: 260 }}
              >
                <div className="relative flex items-center">
                  <FiSearch className="pointer-events-none absolute left-5 text-lg text-gray-500" />
                  <input
                    className="w-full border-none bg-transparent py-3.5 pl-12 pr-4 text-sm text-black placeholder:text-gray-500 focus:outline-none"
                    placeholder="Tìm dự án, khách hàng..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                      setIsSearchFocused(true);
                      setShowSuggestions(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setIsSearchFocused(false);
                        setShowSuggestions(false);
                      }, 150);
                    }}
                    onClick={() => {
                      setIsSearchFocused(true);
                      setShowSuggestions(true);
                    }}
                  />
                </div>
              </motion.div>
              <AnimatePresence>
                {showSuggestions && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.25, delay: 0.15, ease: [0.32, 0.72, 0, 1] },
                    }}
                    exit={{
                      opacity: 0,
                      y: -8,
                      transition: { duration: 0.18, ease: [0.32, 0.72, 0, 1] },
                    }}
                    className="absolute left-0 top-full z-50 max-h-60 overflow-y-auto rounded-b-2xl border-2 border-t-0 border-gray-200 bg-white shadow-md"
                    style={{
                      width: isSearchFocused ? "600px" : "260px",
                      minWidth: "260px",
                    }}
                  >
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => handleCategorySelect(cat)}
                        className="w-full border-b border-gray-100 px-5 py-3 text-left text-sm text-black transition-colors last:border-b-0 hover:bg-gray-50"
                      >
                        {cat}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="mt-10 flex justify-center">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900"></div>
              <p className="mt-4 text-gray-600">Đang tải dự án...</p>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <motion.div
              layout
              className="mt-10 grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
            >
              {pageItems.map((item, i) => (
                <ImageProjectCard
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
                className={`min-w-[2rem] rounded-md px-3 py-2 text-sm transition ${
                  active ? "bg-black text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </Container>

      {/* Modal Gallery - Popup Style */}
      <AnimatePresence>
        {isOpen && selected && (
          <>
            {/* Backdrop - Covers entire screen including header */}
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99998]" onClick={closeProject} style={{ top: 0, left: 0, right: 0, bottom: 0 }} />
            {/* Modal content */}
            <div className="fixed inset-0 flex items-center justify-center z-[99999] pointer-events-none px-4 pt-4 sm:pt-0">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="w-[98vw] max-w-7xl h-[85vh] sm:h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden pointer-events-auto mt-8 sm:mt-0"
                onClick={(e) => e.stopPropagation()}
              >
              {/* Header */}
              <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <AuthorAvatar size="xs" textColor="text-gray-600" />
                    {/* Hide project title next to author on mobile */}
                    <span className="hidden sm:inline text-gray-500">•</span>
                    <h2 className="hidden sm:block text-xl font-semibold text-gray-900">{selected.title}</h2>
                    {selected.allImages && selected.allImages.length > 1 && (
                      <>
                        <span className="text-gray-500">•</span>
                        <span className="text-sm text-gray-500">
                          {selected.allImages.length} ảnh
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={closeProject}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="Đóng"
                  >
                    <FiX className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="h-[calc(100%-80px)] overflow-y-auto">
                <div className="max-w-5xl mx-auto px-6 py-6">
                  {/* Project info */}
                  <div className="mb-8 border-b border-gray-200 pb-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Main info */}
                      <div className="lg:col-span-2">
                        <h3 className="text-2xl font-bold text-gray-900 mb-4">{selected.title}</h3>
                        
                        {selected.description && (
                          <div className="mb-4">
                            <RichTextRenderer 
                              content={selected.description} 
                              className="text-gray-700 leading-relaxed" 
                            />
                          </div>
                        )}
                        
                        {selected.fullDescription && (
                          <div className="mb-4">
                            <RichTextRenderer 
                              content={selected.fullDescription} 
                              className="text-gray-700 leading-relaxed" 
                            />
                          </div>
                        )}
                      </div>

                      {/* Sidebar info */}
                      <div className="space-y-4">
                      {/* Display multiple categories */}
                      {(selected.categories && selected.categories.length > 0) && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Thể loại</h4>
                          <div className="flex flex-wrap gap-2">
                            {selected.categories.map((cat, index) => (
                              <span key={index} className="inline-block px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-900">
                                {cat}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {!selected.categories && selected.category && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Thể loại</h4>
                          <p className="text-gray-900 text-sm">{selected.category}</p>
                        </div>
                      )}
                        
                        {selected.client && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Khách hàng</h4>
                            <p className="text-gray-900 text-sm">{selected.client}</p>
                          </div>
                        )}
                        
                        {selected.completionDate && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Ngày hoàn thành</h4>
                            <TimeAgo completionDate={selected.completionDate} className="text-gray-900 text-sm" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Images grid */}
                  {selected.allImages && selected.allImages.length > 0 ? (
                    <div className="space-y-4">
                      {selected.allImages.map((img, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, delay: index * 0.1 }}
                          className="relative group"
                        >
                          <div className="relative w-full bg-gray-100 rounded-lg overflow-hidden">
                            <Image
                              src={img.url}
                              alt={img.alt}
                              width={img.width || 1200}
                              height={img.height || 800}
                              className="w-full h-auto object-contain"
                              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 60vw"
                            />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : selected.media ? (
                    <div className="relative w-full bg-gray-100 rounded-lg overflow-hidden">
                      <Image
                        src={selected.media}
                        alt={selected.title || "Project"}
                        width={1200}
                        height={800}
                        className="w-full h-auto object-contain"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 60vw"
                      />
                    </div>
                  ) : (
                    <div className="flex h-64 w-full items-center justify-center text-gray-500">
                      Không có ảnh
                    </div>
                  )}
                </div>
              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
