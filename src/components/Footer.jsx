import React from "react";
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

const Footer = ({ content, social }) => {
  const data = content || DEFAULT_SITE_CONTENT.footer;
  const heading = data?.heading || DEFAULT_SITE_CONTENT.footer.heading;
  const email = data?.email || DEFAULT_SITE_CONTENT.footer.email;
  const phone = data?.phone || DEFAULT_SITE_CONTENT.footer.phone;
  const copyright = data?.copyright || DEFAULT_SITE_CONTENT.footer.copyright;

  return (
    <Container as="footer" className="mt-16 sm:mt-24 md:mt-32 lg:mt-40 w-full">
      <FadeIn>
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:gap-y-16 lg:grid-cols-2">
          <FooterNavigation />
          <div className="flex lg:justify-end">
            <NewsletterForm heading={heading} email={email} phone={phone} social={social} />
          </div>
        </div>
        <div className="mb-12 sm:mb-20 mt-12 sm:mt-16 md:mt-24 flex flex-col sm:flex-row flex-wrap items-start sm:items-end justify-between gap-4 sm:gap-x-6 gap-y-4 border-t border-neutral-950/10 pt-8 sm:pt-12">
          <Link href={"/"} aria-label="Home">
            <Logo className="h-6 sm:h-8 text-xl sm:text-2xl">
              XUONGART
            </Logo>
          </Link>
          <p className="text-xs sm:text-sm text-neutral-700">
            © {copyright} {new Date().getFullYear()}
          </p>
        </div>
      </FadeIn>
    </Container>
  );
};

export default Footer;
