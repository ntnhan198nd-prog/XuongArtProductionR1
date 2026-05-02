import Clients from "@/components/Clients";
import Container from "@/components/Container";
import FadeIn from "@/components/FadeIn";
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
        <div className="mx-auto mt-20 w-[92vw] sm:mt-28 lg:w-[80vw]">
          <FadeIn className="max-w-3xl">
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
