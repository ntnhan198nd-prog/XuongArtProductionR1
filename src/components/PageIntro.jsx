import React from "react";
import Container from "./Container";
import FadeIn from "./FadeIn";
import clsx from "clsx";

// `as` lets a page that starts with another block demote this to <h2>.
const PageIntro = ({ eyebrow, title, children, centered = false, as: Heading = "h1" }) => {
  return (
    <Container
      className={clsx("mt-20 sm:mt-24 md:mt-32 lg:mt-40", centered && "text-center")}
    >
      <FadeIn>
        <Heading>
          {eyebrow ? (
            <>
              <span className="block font-display text-sm sm:text-base font-semibold text-neutral-950">
                {eyebrow}
              </span>
              <span className="sr-only"> - </span>
            </>
          ) : null}
          <span
            className={clsx(
              "mt-4 sm:mt-6 block max-w-5xl font-display text-3xl sm:text-5xl md:text-6xl font-medium tracking-tight text-neutral-950 [text-wrap:balance]",
              centered && "mx-auto"
            )}
          >
            {title}
          </span>
        </Heading>
        <div
          className={clsx(
            "mt-4 sm:mt-6 max-w-3xl text-base sm:text-lg md:text-xl text-neutral-600",
            centered && "mx-auto"
          )}
        >
          {children}
        </div>
      </FadeIn>
    </Container>
  );
};

export default PageIntro;
