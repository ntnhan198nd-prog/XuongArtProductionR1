import React from "react";
import Image from "next/image";
import Container from "./Container";
import FadeIn from "./FadeIn";
import FooterNavigation from "./FooterNavigation";
import Link from "next/link";
import SocialMedia from "./SocialMedia";
import { DEFAULT_SITE_CONTENT } from "@/lib/siteContent";

const NewsletterForm = ({ heading, email, phone, social }) => {
  return (
    <div className="max-w-sm">
      <h2 className="font-display text-sm font-semibold tracking-wider text-neutral-950">
        {heading}
      </h2>
      <p className="mt-4 text-sm text-neutral-700">Email: {email}</p>
      <p className="mt-1 text-sm text-neutral-700">Phone: {phone}</p>
      <SocialMedia className="mt-6" content={social} />
    </div>
  );
};

const Footer = ({ content, social, cta, minimal = false, showContact = false }) => {
  const data = content || DEFAULT_SITE_CONTENT.footer;
  const heading = data?.heading || DEFAULT_SITE_CONTENT.footer.heading;
  const email = data?.email || DEFAULT_SITE_CONTENT.footer.email;
  const phone = data?.phone || DEFAULT_SITE_CONTENT.footer.phone;
  const copyright = data?.copyright || DEFAULT_SITE_CONTENT.footer.copyright;
  const ctaData = cta || DEFAULT_SITE_CONTENT.cta;

  // showContact also flips the footer to dark mode — the homepage gets one
  // unified black surface (logo strip + contact band) instead of the
  // earlier white-on-top / dark-on-bottom split. Logo, copyright text,
  // and the divider border all swap to their inverse-friendly variants.
  const dark = showContact;

  // Contact info — heading + address/phone/email + social icons. Rendered
  // inside the same dark outer footer so it visually merges with the
  // bottom strip rather than reading as a separate band.
  const contactBlock = showContact ? (
    <Container className="pb-10 sm:pb-12">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-white">
            {ctaData.contactsHeading || DEFAULT_SITE_CONTENT.cta.contactsHeading}
          </h3>
          <div className="mt-5 text-neutral-300">
            <p className="font-semibold text-white">
              {ctaData.officeName || DEFAULT_SITE_CONTENT.cta.officeName}
            </p>
            <p className="mt-2">
              {ctaData.address || DEFAULT_SITE_CONTENT.cta.address}
            </p>
            <p className="mt-1">
              {ctaData.phone || DEFAULT_SITE_CONTENT.cta.phone}
            </p>
            <p className="mt-1">
              {ctaData.email || DEFAULT_SITE_CONTENT.cta.email}
            </p>
          </div>
        </div>
        <SocialMedia className="shrink-0 sm:mt-1" invert content={social} />
      </div>
    </Container>
  ) : null;

  // Logo strip: same shape on both themes, just swaps the PNG (TRANG = white
  // on dark, DEN = black on light) and the copyright/border colours.
  const bottomStrip = (
    <div
      className={`mb-6 sm:mb-10 flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 sm:gap-x-6 gap-y-3 border-t ${
        dark ? "border-white/10" : "border-neutral-950/10"
      } ${minimal ? "mt-0 pt-3 sm:pt-4" : "mt-12 sm:mt-16 md:mt-24 pt-4 sm:pt-6"}`}
    >
      <Link
        href={"/"}
        className="inline-flex transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.92]"
      >
        <Image
          src={
            dark
              ? "/logos/XUONGARTLOGOTRANG.png"
              : "/logos/XUONGARTLOGODEN.png"
          }
          alt="XUONGART"
          width={256}
          height={256}
          className="h-20 w-20 sm:h-28 sm:w-28 object-contain"
          priority={false}
        />
      </Link>
      <p
        className={`text-xs sm:text-sm ${
          dark ? "text-neutral-400" : "text-neutral-700"
        }`}
      >
        © {copyright} {new Date().getFullYear()}
      </p>
    </div>
  );

  // FadeIn's whileInView shrinks the viewport by 200px at the bottom, which
  // means a short strip near the page bottom never crosses the threshold and
  // would stay at opacity:0 forever. The minimal footer is too thin for that
  // reveal, so we render it without FadeIn.
  return (
    <footer className={`w-full ${dark ? "bg-neutral-950" : "bg-white"}`}>
      {minimal ? (
        <Container className="mt-16 sm:mt-24 md:mt-32 lg:mt-40">
          {bottomStrip}
        </Container>
      ) : (
        <Container className="mt-16 sm:mt-24 md:mt-32 lg:mt-40">
          <FadeIn>
            <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:gap-y-16 lg:grid-cols-2">
              <FooterNavigation />
              <div className="flex lg:justify-end">
                <NewsletterForm heading={heading} email={email} phone={phone} social={social} />
              </div>
            </div>
            {bottomStrip}
          </FadeIn>
        </Container>
      )}
      {contactBlock}
    </footer>
  );
};

export default Footer;
