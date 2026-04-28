"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getProjects, getStrapiImageUrl, getStrapiVideoUrl, extractTextFromRichText } from "@/lib/strapi";
import Container from "@/components/Container";
import AuthorAvatar from "@/components/AuthorAvatar";
import TimeAgo from "@/components/TimeAgo";
import RichTextRenderer from "@/components/RichTextRenderer";
import Image from "next/image";
import Link from "next/link";
import { useSiteContent } from "@/components/SiteContentProvider";
// Sử dụng icon SVG đơn giản thay vì heroicons

export default function ProjectDetailPage() {
  const { ui } = useSiteContent();
  const params = useParams();
  const slug = params.slug;
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const response = await getProjects();
        
        if (response.data) {
          const foundProject = response.data.find(p => p.attributes?.slug === slug);
          
          if (foundProject) {
            const attrs = foundProject.attributes || {};
            const mediaData = attrs.media?.data;
            const mediaList = Array.isArray(mediaData) ? mediaData : (mediaData ? [mediaData] : []);
            
            // Process media
            const firstImageAttrs = mediaList.find(m => m?.attributes?.mime?.startsWith("image/"))?.attributes || {};
            const firstVideoAttrs = mediaList.find(m => m?.attributes?.mime?.startsWith("video/"))?.attributes || null;
            
            const formattedProject = {
              id: foundProject.id,
              title: attrs.title,
              client: attrs.client,
              tagline: attrs.tagline,
              category: attrs.category,
              slug: attrs.slug,
              media: getStrapiImageUrl(firstImageAttrs.url || "") || firstImageAttrs.url || "",
              video: firstVideoAttrs ? (getStrapiVideoUrl(firstVideoAttrs?.url) || getStrapiImageUrl(firstVideoAttrs?.url)) : "",
              description: attrs.description,
              fullDescription: attrs.fullDescription,
              duration: attrs.duration,
              order: attrs.order,
              completionDate: attrs.completionDate,
            };
            
            setProject(formattedProject);
          } else {
            setError('Dự án không tồn tại');
          }
        }
      } catch (error) {
        console.error('Error fetching project:', error);
        setError('Lỗi khi tải dự án');
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchProject();
    }
  }, [slug]);

  if (loading) {
    return (
      <main className="bg-white text-black min-h-screen">
        <Container className="pt-24 sm:pt-32">
          <div className="flex justify-center">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900"></div>
              <p className="mt-4 text-gray-600">{ui.loadingProjectsText}</p>
            </div>
          </div>
        </Container>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="bg-white text-black min-h-screen">
        <Container className="pt-24 sm:pt-32">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Dự án không tồn tại</h1>
            <p className="text-gray-600 mb-8">{error || 'Không tìm thấy dự án này'}</p>
            <Link 
              href="/portfolio" 
              className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Quay lại Portfolio
            </Link>
          </div>
        </Container>
      </main>
    );
  }

  return (
    <main className="bg-white text-black min-h-screen">
      <Container className="pt-24 sm:pt-32">
        {/* Back button */}
        <div className="mb-8">
          <Link 
            href="/portfolio" 
            className="inline-flex items-center gap-2 text-gray-600 hover:text-black transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Quay lại Portfolio
          </Link>
        </div>

        {/* Project header */}
        <div className="mb-8 sm:mb-12">
          {project.category && (
            <div className="text-xs sm:text-sm uppercase tracking-widest text-gray-500 mb-2">{project.category}</div>
          )}
          <h1 className="font-display text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold mb-3 sm:mb-4">{project.title}</h1>
          {project.client && (
            <div className="text-base sm:text-xl text-gray-600 mb-3 sm:mb-4">{project.client}</div>
          )}
          {project.tagline && (
            <p className="text-sm sm:text-lg text-gray-700 leading-relaxed mb-5 sm:mb-6">{project.tagline}</p>
          )}
          
          {/* Author section */}
          <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-xs sm:text-sm text-gray-500">Tác giả</div>
            <AuthorAvatar size="md" />
          </div>
          
          {/* Completion time */}
          {project.completionDate && (
            <div className="mt-3 sm:mt-4">
              <TimeAgo completionDate={project.completionDate} className="text-xs sm:text-sm" />
            </div>
          )}
        </div>

        {/* Media */}
        <div className="mb-8 sm:mb-12">
          {project.video ? (
            <div className="relative w-full h-[50vh] sm:h-[60vh] bg-black rounded-xl sm:rounded-2xl overflow-hidden">
              <video
                src={project.video}
                className="h-full w-full object-contain"
                controls
                autoPlay
                playsInline
              />
            </div>
          ) : project.media ? (
            <div className="relative w-full h-[50vh] sm:h-[60vh] bg-gray-100 rounded-xl sm:rounded-2xl overflow-hidden">
              <Image
                src={project.media}
                alt={project.title}
                fill
                className="object-contain"
              />
            </div>
          ) : (
            <div className="w-full h-[50vh] sm:h-[60vh] bg-gray-100 rounded-xl sm:rounded-2xl flex items-center justify-center">
              <span className="text-sm sm:text-base text-gray-400">Không có media</span>
            </div>
          )}
        </div>

        {/* Description */}
        {(project.description || project.fullDescription) && (
          <div className="max-w-4xl">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6">Về dự án</h2>
            <div className="prose prose-sm sm:prose-lg max-w-none">
              {project.fullDescription && (
                <div className="mb-4 sm:mb-6">
                  <RichTextRenderer 
                    content={project.fullDescription} 
                    className="text-sm sm:text-base text-gray-700 leading-relaxed" 
                  />
                </div>
              )}
              {project.description && !project.fullDescription && (
                <div>
                  <RichTextRenderer 
                    content={project.description} 
                    className="text-sm sm:text-base text-gray-700 leading-relaxed" 
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Duration */}
        {project.duration && (
          <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-gray-200">
            <div className="text-xs sm:text-sm text-gray-500">Thời lượng</div>
            <div className="text-base sm:text-lg font-medium">{project.duration}</div>
          </div>
        )}
      </Container>
    </main>
  );
}
