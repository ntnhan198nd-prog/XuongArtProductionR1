import React from "react";
import SectionIntro from "./SectionIntro";
import Container from "./Container";
import { GridList, GridListItem } from "./GridList";
import { DEFAULT_SITE_CONTENT } from "@/lib/siteContent";

const Cultures = ({ content }) => {
  const data = content || DEFAULT_SITE_CONTENT.cultures;
  const items =
    Array.isArray(data?.items) && data.items.length > 0
      ? data.items
      : DEFAULT_SITE_CONTENT.cultures.items;

  return (
    <div className="mt-24 rounded-4xl bg-neutral-950 py-24 sm:mt-32 lg:mt-40 lg:py-32">
      <SectionIntro
        eyebrow={data?.eyebrow || DEFAULT_SITE_CONTENT.cultures.eyebrow}
        title={data?.title || DEFAULT_SITE_CONTENT.cultures.title}
        invert
      >
        <p>{data?.description || DEFAULT_SITE_CONTENT.cultures.description}</p>
      </SectionIntro>
      <Container className="mt-16">
        <GridList>
          {items.map((item, idx) => (
            <GridListItem key={idx} title={item.title} invert>
              {item.description}
            </GridListItem>
          ))}
        </GridList>
      </Container>
    </div>
  );
};

export default Cultures;
