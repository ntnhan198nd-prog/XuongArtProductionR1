"use client";

import React from "react";
import Container from "./Container";
import FadeIn from "./FadeIn";
import StylizedImage from "./StylizedImage";
import imageLaptop from "../images/laptop.jpg";
import List, { ListItem } from "./List";
import { DEFAULT_SITE_CONTENT } from "@/lib/siteContent";
const Services = ({ content }) => {
  const data = content || DEFAULT_SITE_CONTENT.services;
  const services =
    Array.isArray(data?.items) && data.items.length > 0
      ? data.items
      : DEFAULT_SITE_CONTENT.services.items;

  return (
    <>
      <div className="mx-auto mt-20 w-[92vw] sm:mt-24 md:mt-32 lg:mt-40 lg:w-[80vw]">
        <FadeIn className="max-w-3xl">
          <div className="flex items-center gap-4">
            <span className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-accent-400">
              {data?.eyebrow || DEFAULT_SITE_CONTENT.services.eyebrow}
            </span>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>
          <h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-neutral-950 sm:text-4xl md:text-5xl [text-wrap:balance]">
            {data?.headingMain || DEFAULT_SITE_CONTENT.services.headingMain}{" "}
            <span className="text-accent-400">
              {data?.headingAccent || DEFAULT_SITE_CONTENT.services.headingAccent}
            </span>
          </h2>
          <p className="mt-6 text-base text-neutral-600 sm:text-lg">
            {data?.tagline || DEFAULT_SITE_CONTENT.services.tagline}
          </p>
        </FadeIn>
      </div>
      <Container className="mt-10 sm:mt-16">
        <div className="lg:flex lg:items-center lg:justify-end">
          <div className="flex justify-center lg:w-1/2 lg:justify-end lg:pr-12">
            <FadeIn className="w-full sm:w-[33.75rem] flex-none lg:w-[45rem]">
              <StylizedImage
                src={imageLaptop}
                sizes="(min-width: 1024px) 41rem, 31rem"
                className="justify-center lg:justify-end"
              />
            </FadeIn>
          </div>
          {/* List item */}
          <List className="mt-10 sm:mt-16 lg:mt-0 lg:w-1/2 lg:min-w-[33rem] lg:pl-4">
            {services.map((service, index) => (
              <ListItem key={index} title={service.title}>
                {service.description}
              </ListItem>
            ))}
          </List>
        </div>
      </Container>
    </>
  );
};

export default Services;
