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

  // showContact flips the footer to a unified dark layout for the homepage.
  // Light footer (other pages) keeps the existing minimal/full structure
  // further down so this branch only owns the redesigned dark variant.
  const dark = showContact;

  // Light-theme logo strip used on /videos, /images, /whoweare and the
  // full footer below. The dark homepage variant has its own layout
  // upstream and never reaches this component.
  const bottomStrip = (
    <div
      className={`mb-6 sm:mb-10 flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 sm:gap-x-6 gap-y-3 border-t border-neutral-950/10 ${
        minimal ? "mt-0 pt-3 sm:pt-4" : "mt-12 sm:mt-16 md:mt-24 pt-4 sm:pt-6"
      }`}
    >
      <Link
        href={"/"}
        className="inline-flex transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.92]"
      >
        <Image
          src="/logos/XUONGARTLOGODEN.png"
          alt="XUONGART"
          width={256}
          height={256}
          className="h-20 w-20 sm:h-28 sm:w-28 object-contain"
          priority={false}
        />
      </Link>
      <p className="text-xs sm:text-sm text-neutral-700">
        © {copyright} {new Date().getFullYear()}
      </p>
    </div>
  );

  // Homepage variant: contact info + social icons on the left, oversized
  // brand mark + copyright on the right. The "Thông tin liên hệ" heading
  // is dropped — Office name in bold acts as its own opening line, and
  // dropping the heading lets the contact column read as one block.
  if (dark) {
    return (
      <footer className="w-full bg-neutral-950 text-white">
        <Container className="py-10 sm:py-14">
          <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between sm:gap-8 md:gap-12">
            <div className="flex flex-col gap-6 min-w-0">
              <div className="text-sm leading-relaxed text-neutral-300 sm:text-base">
                <p className="font-semibold text-white">
                  {ctaData.officeName || DEFAULT_SITE_CONTENT.cta.officeName}
                </p>
                <p className="mt-3">
                  {ctaData.address || DEFAULT_SITE_CONTENT.cta.address}
                </p>
                <p className="mt-1">
                  {ctaData.phone || DEFAULT_SITE_CONTENT.cta.phone}
                </p>
                <p className="mt-1">
                  {ctaData.email || DEFAULT_SITE_CONTENT.cta.email}
                </p>
              </div>
              <SocialMedia invert content={social} />
            </div>

            <div className="flex flex-col items-start sm:items-end">
              {/* Inner column groups the logo and copyright with their own
                  centre alignment. Width auto-fits to the wider child
                  (the copyright text), so the logo is horizontally
                  centred relative to the copyright caption rather than
                  hard-aligned to the column edge. */}
              <div className="flex flex-col items-center gap-2">
                <Link
                  href={"/"}
                  className="inline-flex shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.92]"
                >
                  <Image
                    src="/logos/XUONGARTLOGOTRANG.png"
                    alt="XUONGART"
                    width={512}
                    height={512}
                    className="h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 object-contain"
                    priority={false}
                  />
                </Link>
                <p className="text-xs sm:text-sm text-neutral-400 whitespace-nowrap">
                  © {copyright} {new Date().getFullYear()}
                </p>
              </div>
            </div>
          </div>
        </Container>
      </footer>
    );
  }

  // FadeIn's whileInView shrinks the viewport by 200px at the bottom, which
  // means a short strip near the page bottom never crosses the threshold and
  // would stay at opacity:0 forever. The minimal footer is too thin for that
  // reveal, so we render it without FadeIn.
  return (
    <footer className="w-full bg-white">
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
    </footer>
  );
};

export default Footer;
