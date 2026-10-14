import { WhoWeAreSections } from "@/components/WhoWeAreSections";
import { readStore } from "@/lib/contentStore";
import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from "@/lib/siteContent";

export const revalidate = 0;

// Every block on this page (order, visibility and copy) is driven by
// `site.about` — edited in the admin under "Trang /whoweare".
const WhoWeArePage = async () => {
  let site = normalizeSiteContent(DEFAULT_SITE_CONTENT);
  try {
    const store = await readStore();
    site = normalizeSiteContent(store.site);
  } catch (error) {
    console.warn("Failed to load site content for /whoweare:", error);
  }

  return <WhoWeAreSections site={site} />;
};

export default WhoWeArePage;
