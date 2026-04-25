import Container from "./Container";
import FadeIn from "./FadeIn";

const clients = [
  "Redmi",
  "Asus",
  "Samsung",
  "Cellphones",
  "Oppo",
  "Huawei",
  "Monday VietNam",
  "Apple",
  "Sony",
];

const Clients = () => {
  // Duplicate the list so the marquee loops seamlessly when shifted by -50%.
  const track = [...clients, ...clients];

  return (
    <div className="mt-20 sm:mt-24 md:mt-32 lg:mt-56 rounded-4xl bg-neutral-950 py-12 sm:py-20 md:py-28 overflow-hidden">
      <Container>
        <FadeIn className="flex flex-col sm:flex-row items-center gap-x-8 gap-y-4">
          <h2 className="text-center text-base sm:text-xl md:text-2xl font-sans font-semibold tracking-normal text-white sm:text-left">
            Chúng tôi đã đồng hành cùng nhiều thương hiệu & đối tác sáng tạo
          </h2>
          <div className="h-px w-full sm:w-auto sm:flex-auto bg-neutral-800" />
        </FadeIn>
      </Container>

      <FadeIn className="group relative mt-10 sm:mt-14">
        {/* Edge fade masks */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 sm:w-32 bg-gradient-to-r from-neutral-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 sm:w-32 bg-gradient-to-l from-neutral-950 to-transparent" />

        <div className="flex w-max animate-marquee items-center gap-12 will-change-transform group-hover:[animation-play-state:paused] sm:gap-20">
          {track.map((name, idx) => (
            <span
              key={`${name}-${idx}`}
              className="flex shrink-0 items-center gap-12 whitespace-nowrap font-display text-2xl font-semibold text-white sm:gap-20 sm:text-3xl md:text-4xl"
              aria-hidden={idx >= clients.length}
            >
              {name}
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-accent-400/80"
                aria-hidden="true"
              />
            </span>
          ))}
        </div>
      </FadeIn>
    </div>
  );
};

export default Clients;
