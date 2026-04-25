const DEFAULT_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 7000);

function getAppBaseUrl() {
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function toApiUrl(pathname) {
  const base = getAppBaseUrl();
  if (!base) return pathname;
  return `${base}${pathname}`;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export const strapi = {
  async fetch(pathname, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

    try {
      const normalizedPath = pathname.startsWith("/api") ? pathname : `/api${pathname}`;
      const response = await fetch(toApiUrl(normalizedPath), {
        method: "GET",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await safeJson(response);
        const message = payload?.error || `API error: ${response.status}`;
        throw new Error(message);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async getProjects() {
    try {
      return await this.fetch("/api/projects");
    } catch (error) {
      console.error("Error fetching projects:", error);
      return { data: [] };
    }
  },

  async getProject(id) {
    const response = await this.getProjects();
    const item = (response?.data || []).find((project) => Number(project.id) === Number(id));
    return { data: item || null };
  },

  async getFeaturedProjects() {
    try {
      return await this.fetch("/api/projects?type=featured");
    } catch (error) {
      console.error("Error fetching featured projects:", error);
      return { data: [] };
    }
  },

  async getGeneralProjects() {
    try {
      return await this.fetch("/api/projects?type=general");
    } catch (error) {
      console.error("Error fetching general projects:", error);
      return { data: [] };
    }
  },
};

export function getStrapiImageUrl(image) {
  if (!image) return null;
  if (typeof image === "string") return image;
  if (image?.data?.attributes?.url) return image.data.attributes.url;
  return null;
}

export function getStrapiVideoUrl(video) {
  if (!video) return null;
  if (typeof video === "string") return video;
  if (video?.data?.attributes?.url) return video.data.attributes.url;
  return null;
}

export function formatStrapiDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function extractTextFromRichText(richText) {
  if (!richText) return "";
  if (typeof richText === "string") return richText;

  if (Array.isArray(richText)) {
    return richText
      .map((block) => {
        if (block.type === "paragraph" && block.children) {
          return block.children.map((child) => child.text || "").join("");
        }
        return "";
      })
      .join(" ");
  }

  return "";
}

export function richTextToHtml(richText) {
  if (!richText) return "";
  if (typeof richText === "string") return richText;

  if (Array.isArray(richText)) {
    return richText
      .map((block) => {
        if (block.type === "paragraph" && block.children) {
          const paragraphHtml = block.children
            .map((child) => {
              let text = child.text || "";
              if (child.bold) text = `<strong>${text}</strong>`;
              if (child.italic) text = `<em>${text}</em>`;
              if (child.underline) text = `<u>${text}</u>`;
              if (child.strikethrough) text = `<s>${text}</s>`;
              if (child.code) text = `<code>${text}</code>`;
              return text;
            })
            .join("");
          return `<p>${paragraphHtml}</p>`;
        }
        return "";
      })
      .join("");
  }

  return "";
}

export const getProjects = () => strapi.getProjects();
export const getProject = (id) => strapi.getProject(id);
export const getFeaturedProjects = () => strapi.getFeaturedProjects();
export const getGeneralProjects = () => strapi.getGeneralProjects();

export default strapi;
