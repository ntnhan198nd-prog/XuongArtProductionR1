import React from "react";
import Image from "next/image";
import Container from "./Container";
import FadeIn from "./FadeIn";
import FooterNavigation from "./FooterNavigation";
import Logo from "./Logo";
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

const Footer = ({ content, social, minimal = false }) => {
  const data = content || DEFAULT_SITE_CONTENT.footer;
  const heading = data?.heading || DEFAULT_SITE_CONTENT.footer.heading;
  const email = data?.email || DEFAULT_SITE_CONTENT.footer.email;
  const phone = data?.phone || DEFAULT_SITE_CONTENT.footer.phone;
  const copyright = data?.copyright || DEFAULT_SITE_CONTENT.footer.copyright;

  // The minimal footer (homepage) shows only the bottom strip — logo +
  // copyright with a thin top border — because the social + contact info
  // already lives in the CTA banner above. The full footer (other pages)
  // additionally renders FooterNavigation + the newsletter/contact column.

  const bottomStrip = (
    <div
      className={`mb-12 sm:mb-20 flex flex-col sm:flex-row flex-wrap items-start sm:items-end justify-between gap-4 sm:gap-x-6 gap-y-4 border-t border-neutral-950/10 ${
        minimal ? "mt-0 pt-6 sm:pt-8" : "mt-12 sm:mt-16 md:mt-24 pt-8 sm:pt-12"
      }`}
    >
      <Link
        href={"/"}
        aria-label="Home"
        className="flex items-center gap-2 sm:gap-3"
      >
        {/* alt="" because the text wordmark right next to it already
            announces the brand to screen readers — the image is purely
            decorative reinforcement, not redundant naming. */}
        <Image
          src="/logos/XUONGARTLOGODEN.png"
          alt=""
          width={64}
          height={64}
          className="h-7 w-7 sm:h-9 sm:w-9 object-contain"
          priority={false}
        />
        {/* leading-none collapses the default 1.4× line-box padding around
            the text so its visual centre lines up with the square mark
            once the row is items-center'd. Without it the glyphs sit lower
            than the image's centre. */}
        <Logo className="text-xl sm:text-2xl leading-none">XUONGART</Logo>
      </Link>
      <p className="text-xs sm:text-sm text-neutral-700">
        © {copyright} {new Date().getFullYear()}
      </p>
    </div>
  );

  // FadeIn's whileInView shrinks the viewport by 200px at the bottom, which
  // means a short strip near the page bottom never crosses the threshold and
  // would stay at opacity:0 forever. The minimal footer is too thin for that
  // reveal, so we render it without FadeIn.
  if (minimal) {
    return (
      <Container as="footer" className="mt-16 sm:mt-24 md:mt-32 lg:mt-40 w-full">
        {bottomStrip}
      </Container>
    );
  }

  return (
    <Container as="footer" className="mt-16 sm:mt-24 md:mt-32 lg:mt-40 w-full">
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
  );
};

export default Footer;
