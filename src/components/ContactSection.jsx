import React from "react";
import Container from "./Container";
import FadeIn from "./FadeIn";
import Button from "./Button";
import { DEFAULT_SITE_CONTENT } from "@/lib/siteContent";

const ContactSection = ({ content }) => {
  const data = content || DEFAULT_SITE_CONTENT.cta;
  return (
    <Container className="mt-24 sm:mt-32 lg:mt-40">
      <FadeIn className="-mx-6 rounded-4xl bg-neutral-950 px-6 py-20 sm:mx-0 sm:py-32 md:px-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-display text-3xl font-medium text-white [text-wrap:balance] sm:text-4xl">
            {data?.heading || DEFAULT_SITE_CONTENT.cta.heading}
          </h2>

          <div className="mt-6 flex">
            <Button href={"/contact"} invert>
              {data?.buttonText || DEFAULT_SITE_CONTENT.cta.buttonText}
            </Button>
          </div>
          <div className="mt-10 border-t border-white/10 pt-10">
            <h3 className="font-display text-base font-semibold text-white">
              {data?.contactsHeading || DEFAULT_SITE_CONTENT.cta.contactsHeading}
            </h3>
            <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-2 text-neutral-300">
              <div>
                <p className="font-semibold text-white">
                  {data?.officeName || DEFAULT_SITE_CONTENT.cta.officeName}
                </p>
                <p className="mt-2">{data?.address || DEFAULT_SITE_CONTENT.cta.address}</p>
                <p className="mt-1">{data?.phone || DEFAULT_SITE_CONTENT.cta.phone}</p>
                <p className="mt-1">{data?.email || DEFAULT_SITE_CONTENT.cta.email}</p>
              </div>
            </div>
          </div>
        </div>
      </FadeIn>
    </Container>
  );
};

export default ContactSection;
