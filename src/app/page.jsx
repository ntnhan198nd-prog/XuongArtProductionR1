import Clients from "@/components/Clients";
import Container from "@/components/Container";
import FadeIn from "@/components/FadeIn";
import FeaturedCtaLink from "@/components/FeaturedCtaLink";
import HeroShowreel from "@/components/HeroShowreel";
import ProjectsGallery from "@/components/ProjectsGallery";
import Stats from "@/components/Stats";
import { readStore } from "@/lib/contentStore";
import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from "@/lib/siteContent";

export const revalidate = 0;

export default async function Home() {
  let showreelUrl = "/showreel.mp4";
  let site = DEFAULT_SITE_CONTENT;
  try {
    const store = await readStore();
    if (store.showreel?.url) showreelUrl = store.showreel.url;
    site = normalizeSiteContent(store.site);
  } catch (error) {
    console.warn("Failed to load store for homepage:", error);
  }

  return (
    <main className="text-black">
      {/* New homepage flow: hero → featured projects (the work first) →
          stats (credibility) → clients (partners) → intro (manifesto
          closes the page). The CTA banner + Services moved to /whoweare;
          contact info lives in the footer via showContactInFooter. */}
      <HeroShowreel videoSrc={showreelUrl} content={site.hero} />

      <div id="projects-section" className="scroll-mt-20">
        {/* px-4 lg:px-6 mirrors the carousel grid's symmetric padding so
            both the heading's left edge AND the CTA's right edge line
            up with the gallery cards' visible bounds — no overhang on
            either side. */}
        <div className="mx-auto mt-20 w-[92vw] px-4 sm:mt-28 lg:w-[80vw] lg:px-6">
          <FadeIn>
            {/* Heading on the left, "Xem tất cả dự án" CTA on the
                right — same row on sm+ so the link sits at the top
                right of the gallery section. Stacks below the heading
                on mobile so the CTA never crowds the title. */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
              <div className="max-w-3xl">
                <div className="flex items-center gap-4">
                  <span className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-accent-400">
                    {site.featuredHeader.eyebrow}
                  </span>
                  <span className="h-px flex-1 bg-neutral-200" />
                </div>
                <h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-neutral-950 sm:text-4xl md:text-5xl [text-wrap:balance]">
                  {site.featuredHeader.headingMain}{" "}
                  <span className="text-accent-400">
                    {site.featuredHeader.headingAccent}
                  </span>
                </h2>
              </div>
              {/* Editorial-style "view all" — plain text + a small
                  outline circle holding the arrow. Differentiates from
                  the solid black /whoweare pill in the header so the
                  two CTAs read as different verbs. The component is
                  client-side because it broadcasts hover/focus events
                  for the header to highlight the matching "-động"
                  link in unison. */}
              <FeaturedCtaLink />
            </div>
          </FadeIn>
        </div>
        <ProjectsGallery />
      </div>

      <Stats content={site.stats} />
      <Clients content={site.clients} />

      <Container className="mt-20 pb-24 sm:mt-28 sm:pb-32 md:pb-40">
        <FadeIn className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-4xl font-medium tracking-tight text-neutral-950 [text-wrap:balance] sm:text-5xl md:text-6xl">
            {site.intro.headingMain}{" "}
            <span className="text-accent-400">{site.intro.headingAccent}</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base text-neutral-600 sm:text-lg">
            {site.intro.description}
          </p>
        </FadeIn>
      </Container>
    </main>
  );
}
