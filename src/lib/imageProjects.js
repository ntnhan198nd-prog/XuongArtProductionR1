const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Helper function to get Strapi image URL
export const getStrapiImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${APP_URL}${url}`;
};

// Helper function to get Strapi video URL
export const getStrapiVideoUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${APP_URL}${url}`;
};

// Fetch image projects from our API
export const getImageProjects = async () => {
  try {
    const response = await fetch('/api/image-projects', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching image projects:', error);
    throw error;
  }
};

// Format image project data
export const formatImageProject = (project) => {
  const attrs = project.attributes || {};
  const mediaData = attrs.media?.data;
  const mediaList = Array.isArray(mediaData) ? mediaData : (mediaData ? [mediaData] : []);
  
  console.log('📸 Formatting project:', project.id, 'Media data:', mediaList);
  
  // Get all images
  const allImages = mediaList
    .filter(m => m?.attributes?.mime?.startsWith("image/"))
    .map(m => ({
      url: getStrapiImageUrl(m.attributes.url) || m.attributes.url,
      width: m.attributes.width,
      height: m.attributes.height,
      alt: m.attributes.alternativeText || attrs.title,
      formats: m.attributes.formats
    }));

  console.log('🖼️ All images:', allImages);

  // Get main image (first image or thumbnail)
  const mainImage = allImages[0] || null;
  const thumbnail = attrs.thumbnail?.data?.attributes;
  const thumbnailUrl = thumbnail ? getStrapiImageUrl(thumbnail.url) : (mainImage?.url || '');

  return {
    id: project.id,
    title: attrs.title,
    client: attrs.client,
    tagline: attrs.tagline,
    category: attrs.category,
    categories: attrs.categories || (attrs.category ? [attrs.category] : []),
    featured: attrs.featured,
    slug: attrs.slug,
    media: mainImage?.url || '',
    thumbnail: thumbnailUrl,
    width: mainImage?.width,
    height: mainImage?.height,
    mime: mainImage?.mime,
    description: attrs.description,
    fullDescription: attrs.fullDescription,
    order: attrs.order,
    completionDate: attrs.completionDate,
    orientation: attrs.orientation,
    allImages: allImages,
  };
};
