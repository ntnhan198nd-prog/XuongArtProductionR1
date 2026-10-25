import clsx from "clsx";
import Border from "@/components/Border";
import Button from "@/components/Button";
import Container from "@/components/Container";
import FadeIn, { FadeInStagger } from "@/components/FadeIn";
import PageIntro from "@/components/PageIntro";
import SectionIntro from "@/components/SectionIntro";
import Services from "@/components/Services";
import SocialMedia from "@/components/SocialMedia";
import { StatList, StatListItem } from "@/components/StatList";

// /whoweare is assembled from these blocks in the order (and visibility)
// the admin sets in `site.about.sections`. Every string rendered here comes
// from site content — see lib/siteContent.js for the defaults.
//
// Heading levels: the first rendered block gets the page's <h1>, every
// block after it uses <h2>, whatever order the admin chose.

const SECTION_GAP = "mt-24 sm:mt-32 lg:mt-40";

const BUTTON_CLASS =
  "inline-flex rounded-full px-4 py-1.5 text-sm font-semibold transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-[0.9] border-none outline-none";

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const LOOKS_LIKE_HOST = /^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/i;

// Normalise an admin-entered button link. Returns null for an empty link or
// for a scheme we refuse to render (javascript:, data:, …). Scheme-less
// hosts such as "m.me/xuongart" become https:// links; bare words become
// internal paths.
export function resolveButtonHref(raw = "") {
  const href = String(raw || "").trim();
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return { href, external: true, newTab: true };
  if (/^(mailto|tel):/i.test(href)) return { href, external: true, newTab: false };
  if (HAS_SCHEME.test(href)) return null;
  if (href.startsWith("/") || href.startsWith("#")) {
    return { href, external: false, newTab: false };
  }
  if (LOOKS_LIKE_HOST.test(href)) {
    return { href: `https://${href}`, external: true, newTab: true };
  }
  return { href: `/${href}`, external: false, newTab: false };
}

// Section heading with graceful degradation: no eyebrow + no title → only
// the description (or nothing), so a blanked-out field never leaves an
// empty <h2> behind.
function Intro({ eyebrow, title, description, invert = false, headingTag = "h2", className }) {
  if (!eyebrow && !title) {
    if (!description) return null;
    return (
      <Container className={className}>
        <FadeIn className="max-w-2xl">
          <p className={clsx("text-xl", invert ? "text-neutral-300" : "text-neutral-600")}>
            {description}
          </p>
        </FadeIn>
      </Container>
    );
  }
  return (
    <SectionIntro
      as={headingTag}
      eyebrow={eyebrow}
      title={title}
      invert={invert}
      className={className}
    >
      {description ? <p>{description}</p> : null}
    </SectionIntro>
  );
}

export function AboutHero({ content, headingTag = "h1" }) {
  const stats = Array.isArray(content.stats) ? content.stats : [];
  const paragraphs = Array.isArray(content.paragraphs) ? content.paragraphs : [];
  const hasHeading = Boolean(content.eyebrow || content.title);
  const hasBody = Boolean(content.lead) || paragraphs.length > 0;
  const showStats = Boolean(content.showStats) && stats.length > 0;
  if (!hasHeading && !hasBody && !showStats) return null;

  const body = (
    <>
      {content.lead ? <p>{content.lead}</p> : null}
      {paragraphs.length > 0 ? (
        <div className="mt-10 max-w-2xl space-y-6 text-base">
          {paragraphs.map((paragraph, idx) => (
            <p key={idx}>{paragraph}</p>
          ))}
        </div>
      ) : null}
    </>
  );

  return (
    <>
      {hasHeading ? (
        <PageIntro as={headingTag} eyebrow={content.eyebrow} title={content.title}>
          {body}
        </PageIntro>
      ) : hasBody ? (
        <Container className="mt-20 sm:mt-24 md:mt-32 lg:mt-40">
          <FadeIn>
            <div className="max-w-3xl text-base text-neutral-600 sm:text-lg md:text-xl">{body}</div>
          </FadeIn>
        </Container>
      ) : null}
      {showStats ? (
        <Container className={hasHeading || hasBody ? "mt-16" : "mt-20 sm:mt-24 md:mt-32 lg:mt-40"}>
          <StatList>
            {stats.map((stat, idx) => (
              <StatListItem key={idx} value={stat.value} label={stat.label} />
            ))}
          </StatList>
        </Container>
      ) : null}
    </>
  );
}

export function AboutFounder({ content, headingTag = "h2" }) {
  const hasPhoto = Boolean(content.photo?.url);
  const story = Array.isArray(content.story) ? content.story : [];
  if (!content.name && story.length === 0 && !content.quote) return null;
  const Heading = headingTag;
  return (
    <div id="founder" className="scroll-mt-20">
      <Container className={SECTION_GAP}>
        {content.eyebrow ? (
          <FadeIn>
            <span className="block font-display text-base font-semibold text-neutral-950">
              {content.eyebrow}
            </span>
          </FadeIn>
        ) : null}
        <div
          className={clsx(
            "grid grid-cols-1 gap-10",
            content.eyebrow && "mt-8",
            hasPhoto && "lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-16"
          )}
        >
          {hasPhoto ? (
            <FadeIn>
              <div
                className="w-full max-w-[22rem] overflow-hidden rounded-3xl bg-neutral-100"
                style={{ aspectRatio: "4 / 5" }}
              >
                {/* Remote R2 asset — plain <img> like the rest of the admin-driven media. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={content.photo.url}
                  alt={content.photo.alt || content.name || ""}
                  className="h-full w-full object-cover"
                />
              </div>
            </FadeIn>
          ) : null}
          <FadeIn className="min-w-0">
            {content.name ? (
              <Heading className="font-display text-3xl font-medium tracking-tight text-neutral-950 [text-wrap:balance] sm:text-4xl">
                {content.name}
              </Heading>
            ) : null}
            {content.role ? <p className="mt-1 text-neutral-600">{content.role}</p> : null}
            {story.length > 0 ? (
              <div className="mt-6 max-w-2xl space-y-4 text-base text-neutral-600 sm:text-lg">
                {story.map((paragraph, idx) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>
            ) : null}
            {content.quote ? (
              <blockquote className="mt-8 max-w-xl border-l-[3px] border-accent-400 pl-6 font-display text-xl font-medium leading-snug tracking-tight text-neutral-950 sm:text-2xl">
                “{content.quote}”
              </blockquote>
            ) : null}
          </FadeIn>
        </div>
      </Container>
    </div>
  );
}

export function AboutValues({ content, headingTag = "h2" }) {
  const items = Array.isArray(content.items) ? content.items : [];
  if (items.length === 0) return null;
  const invert = content.theme !== "light";
  const hasIntro = Boolean(content.eyebrow || content.title || content.description);
  return (
    <div
      id="values"
      className={clsx(
        "mt-24 scroll-mt-20 rounded-4xl py-24 sm:mt-32 lg:mt-40 lg:py-32",
        invert ? "bg-neutral-950" : "bg-neutral-50"
      )}
    >
      <Intro
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
        invert={invert}
        headingTag={headingTag}
      />
      <Container className={hasIntro ? "mt-16" : ""}>
        <FadeInStagger>
          <ul role="list" className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, idx) => (
              <li
                key={idx}
                className={clsx("min-w-0 text-base", invert ? "text-neutral-300" : "text-neutral-600")}
              >
                <FadeIn>
                  <Border position="left" className="pl-8" invert={invert}>
                    {item.title ? (
                      <strong
                        className={clsx("font-semibold", invert ? "text-white" : "text-neutral-950")}
                      >
                        {item.title}.
                      </strong>
                    ) : null}
                    {item.title && item.description ? " " : null}
                    {item.description}
                  </Border>
                </FadeIn>
              </li>
            ))}
          </ul>
        </FadeInStagger>
      </Container>
    </div>
  );
}

export function AboutProcess({ content, headingTag = "h2" }) {
  const steps = Array.isArray(content.steps) ? content.steps : [];
  if (steps.length === 0) return null;
  const hasIntro = Boolean(content.eyebrow || content.title || content.description);
  const columns =
    steps.length >= 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : steps.length === 3
      ? "sm:grid-cols-3"
      : "sm:grid-cols-2";
  return (
    <section id="process" className={clsx(SECTION_GAP, "scroll-mt-20")}>
      <Intro
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
        headingTag={headingTag}
      />
      <Container className={hasIntro ? "mt-16" : ""}>
        <FadeInStagger>
          <ol className={clsx("grid grid-cols-1 gap-10", columns)}>
            {steps.map((step, idx) => (
              <li key={idx} className="min-w-0">
                <FadeIn className="relative border-t border-neutral-950/10 pt-6">
                  <span className="absolute left-0 top-0 h-px w-6 bg-neutral-950" />
                  {content.numbered ? (
                    <span className="block font-display text-xs font-semibold tracking-[0.14em] text-accent-500 [font-variant-numeric:tabular-nums]">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                  ) : null}
                  {step.title ? (
                    <h3 className="mt-3 font-display text-xl font-semibold tracking-tight text-neutral-950">
                      {step.title}
                    </h3>
                  ) : null}
                  {step.description ? (
                    <p className={clsx("text-base text-neutral-600", step.title ? "mt-2" : "mt-3")}>
                      {step.description}
                    </p>
                  ) : null}
                </FadeIn>
              </li>
            ))}
          </ol>
        </FadeInStagger>
      </Container>
    </section>
  );
}

export function AboutTestimonials({ content, headingTag = "h2" }) {
  const items = Array.isArray(content.items) ? content.items : [];
  if (items.length === 0) return null;
  const hasIntro = Boolean(content.eyebrow || content.title || content.description);
  return (
    <section id="testimonials" className={clsx(SECTION_GAP, "scroll-mt-20")}>
      <Intro
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
        headingTag={headingTag}
      />
      <Container className={hasIntro ? "mt-16" : ""}>
        <FadeInStagger>
          <ul role="list" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, idx) => (
              <li key={idx} className="min-w-0">
                <FadeIn className="h-full">
                  <figure className="flex h-full flex-col justify-between gap-8 rounded-3xl border border-neutral-200 p-8">
                    <blockquote className="font-display text-lg font-medium leading-snug tracking-tight text-neutral-950">
                      “{item.quote}”
                    </blockquote>
                    {item.name || item.role ? (
                      <figcaption className="text-sm text-neutral-600">
                        {item.name ? (
                          <span className="block font-semibold text-neutral-950">{item.name}</span>
                        ) : null}
                        {item.role}
                      </figcaption>
                    ) : null}
                  </figure>
                </FadeIn>
              </li>
            ))}
          </ul>
        </FadeInStagger>
      </Container>
    </section>
  );
}

// `shared` = site.cta (office/address/phone/email also used by the homepage
// footer). Empty fields on the about CTA fall back to it so the address only
// has to be maintained in one place.
export function AboutCta({ content, shared, social, headingTag = "h2" }) {
  const invert = content.theme !== "light";
  const officeName = content.officeName || shared?.officeName || "";
  const address = content.address || shared?.address || "";
  const phone = content.phone || shared?.phone || "";
  const email = content.email || shared?.email || "";
  const hasContacts = Boolean(officeName || address || phone || email);
  const link = content.buttonText ? resolveButtonHref(content.buttonUrl) : null;
  const Heading = headingTag;
  const buttonClass = clsx(
    BUTTON_CLASS,
    invert
      ? "bg-white text-neutral-950 hover:bg-neutral-200"
      : "bg-neutral-950 text-white hover:bg-neutral-800"
  );

  if (!content.heading && !link && !hasContacts && !content.showSocial && !content.tagline) {
    return null;
  }

  return (
    <div id="contact" className="scroll-mt-20">
      <Container className={SECTION_GAP}>
        <FadeIn
          className={clsx(
            // -mx-4 / px-4 cancel Container's px-4 below `sm` so the panel
            // sits flush with the viewport instead of overshooting it.
            "-mx-4 rounded-4xl px-4 py-[2.7rem] sm:mx-0 sm:px-6 sm:py-[4.5rem] md:px-12 md:py-[6.3rem]",
            invert ? "bg-neutral-950 text-white" : "bg-neutral-50 text-neutral-950"
          )}
        >
          <div className="mx-auto max-w-4xl">
            {content.heading ? (
              <Heading className="font-display text-3xl font-medium [text-wrap:balance] sm:text-4xl">
                {content.heading}
              </Heading>
            ) : null}

            {link ? (
              <div className="mt-6 flex">
                {link.external ? (
                  <a
                    href={link.href}
                    target={link.newTab ? "_blank" : undefined}
                    rel={link.newTab ? "noreferrer" : undefined}
                    className={buttonClass}
                  >
                    <span>{content.buttonText}</span>
                  </a>
                ) : (
                  <Button href={link.href} invert={invert}>
                    {content.buttonText}
                  </Button>
                )}
              </div>
            ) : null}

            {hasContacts || content.showSocial ? (
              <div
                className={clsx(
                  "mt-8 border-t pt-8",
                  invert ? "border-white/10" : "border-neutral-950/10"
                )}
              >
                <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    {content.contactsHeading ? (
                      <h3 className="font-display text-base font-semibold">
                        {content.contactsHeading}
                      </h3>
                    ) : null}
                    {hasContacts ? (
                      <div className={clsx("mt-5", invert ? "text-neutral-300" : "text-neutral-600")}>
                        {officeName ? (
                          <p className={clsx("font-semibold", invert ? "text-white" : "text-neutral-950")}>
                            {officeName}
                          </p>
                        ) : null}
                        {address ? <p className="mt-2">{address}</p> : null}
                        {phone ? <p className="mt-1">{phone}</p> : null}
                        {email ? <p className="mt-1">{email}</p> : null}
                      </div>
                    ) : null}
                  </div>
                  {content.showSocial ? (
                    <SocialMedia className="shrink-0 sm:mt-1" invert={invert} content={social} />
                  ) : null}
                </div>
              </div>
            ) : null}

            {content.tagline ? (
              <p
                className={clsx(
                  "mt-10 text-xs font-semibold uppercase tracking-[0.2em]",
                  invert ? "text-neutral-400" : "text-neutral-500"
                )}
              >
                {content.tagline}
              </p>
            ) : null}
          </div>
        </FadeIn>
      </Container>
    </div>
  );
}

export function WhoWeAreSections({ site }) {
  const about = site.about;
  const enabled = (Array.isArray(about?.sections) ? about.sections : []).filter(
    (section) => section.enabled
  );
  return enabled.map(({ key }, idx) => {
    const headingTag = idx === 0 ? "h1" : "h2";
    switch (key) {
      case "hero":
        return <AboutHero key={key} content={about.hero} headingTag={headingTag} />;
      case "founder":
        return <AboutFounder key={key} content={about.founder} headingTag={headingTag} />;
      case "values":
        return <AboutValues key={key} content={about.values} headingTag={headingTag} />;
      case "process":
        return <AboutProcess key={key} content={about.process} headingTag={headingTag} />;
      case "testimonials":
        return (
          <AboutTestimonials key={key} content={about.testimonials} headingTag={headingTag} />
        );
      case "services":
        // Bare wrapper = anchor only; margins collapse through it.
        return (
          <div key={key} id="services" className="scroll-mt-20">
            <Services content={site.services} />
          </div>
        );
      case "cta":
        return (
          <AboutCta
            key={key}
            content={about.cta}
            shared={site.cta}
            social={site.social}
            headingTag={headingTag}
          />
        );
      default:
        return null;
    }
  });
}
