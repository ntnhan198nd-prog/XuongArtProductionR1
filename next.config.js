const extraImagePatterns = [];

if (process.env.R2_PUBLIC_URL) {
  try {
    const parsed = new URL(process.env.R2_PUBLIC_URL);
    extraImagePatterns.push({
      protocol: parsed.protocol.replace(":", ""),
      hostname: parsed.hostname,
      pathname: "/**",
      ...(parsed.port ? { port: parsed.port } : {}),
    });
  } catch {
    // Keep build working even if env value is malformed.
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.cloudflarestorage.com",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/**",
      },
      ...extraImagePatterns,
    ],
    unoptimized: false,
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },
  compress: true,
  swcMinify: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  },
  // Permanent redirects so bookmarks / inbound SEO links to the previous
  // /portfolio and /contact paths land on the new /videos and /whoweare
  // routes instead of 404ing.
  async redirects() {
    return [
      { source: "/portfolio", destination: "/videos", permanent: true },
      { source: "/portfolio/:slug*", destination: "/videos/:slug*", permanent: true },
      { source: "/contact", destination: "/whoweare", permanent: true },
    ];
  },
};

module.exports = nextConfig;
