import RootLayout from "@/components/RootLayout";
import { SiteContentProvider } from "@/components/SiteContentProvider";
import { readStore } from "@/lib/contentStore";
import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from "@/lib/siteContent";
import "./globals.css";

export const revalidate = 0;

export const metadata = {
  title: {
    template: "XưởngArt",
    default: "XưởngArt",
  },
};

export default async function Layout({ children }) {
  let site = DEFAULT_SITE_CONTENT;
  try {
    const store = await readStore();
    site = normalizeSiteContent(store.site);
  } catch (error) {
    console.warn("Failed to load site content for layout:", error);
  }

  return (
    <html
      lang="en"
      className="h-full bg-neutral-950 text-base antialiased text-neutral-100"
    >
      <body className="flex min-h-full flex-col">
        <RootLayout footerContent={site.footer} socialContent={site.social}>
          <SiteContentProvider value={site}>{children}</SiteContentProvider>
        </RootLayout>
      </body>
    </html>
  );
}
