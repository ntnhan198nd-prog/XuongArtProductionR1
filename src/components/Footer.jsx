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

  // sm:items-center pulls the copyright onto the logo's vertical midline
  // (was sm:items-end — the small text sat flush with the logo's bottom
  // edge, looking offset). Margins/paddings shrunk roughly 50% so the
  // strip reads as a thin closing line instead of a heavy banner.
  const bottomStrip = (
    <div
      className={`mb-6 sm:mb-10 flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 sm:gap-x-6 gap-y-3 border-t border-neutral-950/10 ${
        minimal ? "mt-0 pt-3 sm:pt-4" : "mt-12 sm:mt-16 md:mt-24 pt-4 sm:pt-6"
      }`}
    >
      {/* The PNG already includes the "xưởng" wordmark inside the mark, so
          a separate text "XUONGART" sat redundantly next to it. Now the
          image carries the whole brand name — Link picks up its accessible
          name from alt instead of an explicit aria-label.

          Click animation matches the header wordmark: ease-out-back curve
          with a brief active:scale-[0.92] press. The .logo-shine-wrap span
          paints an orange shine sweep across the image, masked to the
          logo's alpha so the highlight only catches the ink — same
          treatment as the homepage stats numbers. */}
      <Link
        href={"/"}
        className="inline-flex transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.92]"
      >
        <span className="logo-shine-wrap">
          <Image
            src="/logos/XUONGARTLOGODEN.png"
            alt="XUONGART"
            width={256}
            height={256}
            className="h-20 w-20 sm:h-28 sm:w-28 object-contain"
            priority={false}
          />
        </span>
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
