import ContactSection from "@/components/ContactSection";
import Container from "@/components/Container";
import Cultures from "@/components/Cultures";
import PageIntro from "@/components/PageIntro";
import { StatList, StatListItem } from "@/components/StatList";
import { readStore } from "@/lib/contentStore";
import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from "@/lib/siteContent";
import React from "react";

export const revalidate = 0;

const ContactPage = async () => {
  let site = DEFAULT_SITE_CONTENT;
  try {
    const store = await readStore();
    site = normalizeSiteContent(store.site);
  } catch (error) {
    console.warn("Failed to load site content for /contact:", error);
  }

  const aboutStats =
    Array.isArray(site.about.stats) && site.about.stats.length > 0
      ? site.about.stats
      : DEFAULT_SITE_CONTENT.about.stats;

  return (
    <>
      <PageIntro eyebrow={site.about.eyebrow} title={site.about.title}>
        <p>{site.about.lead}</p>
        <div className="mt-10 max-w-2xl space-y-6 text-base">
          {(site.about.paragraphs || []).map((paragraph, idx) => (
            <p key={idx}>{paragraph}</p>
          ))}
        </div>
      </PageIntro>
      <Container className="mt-16">
        <StatList>
          {aboutStats.map((stat, idx) => (
            <StatListItem key={idx} value={stat.value} label={stat.label} />
          ))}
        </StatList>
      </Container>
      <Cultures content={site.cultures} />
      <ContactSection content={site.cta} social={site.social} />
    </>
  );
};

export default ContactPage;
