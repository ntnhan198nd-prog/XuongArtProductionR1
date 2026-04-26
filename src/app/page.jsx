import Clients from "@/components/Clients";
import ContactSection from "@/components/ContactSection";
import Container from "@/components/Container";
import FadeIn from "@/components/FadeIn";
import HeroShowreel from "@/components/HeroShowreel";
import Services from "@/components/Services";
import ProjectsGallery from "@/components/ProjectsGallery";
import Stats from "@/components/Stats";
import Testimonials from "@/components/Testimonials";
import logoPhobiaDark from "@/images/clients/phobia/logo-dark.svg";

export default function Home() {
  return (
    <main className="text-black">
      {/* Hero banner with showreel video loop */}
      <HeroShowreel videoSrc="/showreel.mp4" />
      {/* Intro — centered manifesto */}
      <Container className="mt-20 sm:mt-28">
        <FadeIn className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-4xl font-medium tracking-tight text-neutral-950 [text-wrap:balance] sm:text-5xl md:text-6xl">
            Biến ý tưởng thành{" "}
            <span className="text-accent-400">trải nghiệm số</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base text-neutral-600 sm:text-lg">
            Studio sáng tạo nơi nghệ thuật gặp công nghệ. Chúng tôi sản xuất
            video và nội dung hình ảnh đậm chất điện ảnh — kể câu chuyện
            thương hiệu bằng ngôn ngữ thị giác tinh tế và cảm xúc thật.
          </p>
        </FadeIn>
      </Container>
      {/* Featured projects below the intro */}
      <div id="projects-section" className="scroll-mt-20">
        <div className="mx-auto mt-20 w-[92vw] sm:mt-28 lg:w-[80vw]">
          <FadeIn className="max-w-3xl">
            <div className="flex items-center gap-4">
              <span className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-accent-400">
                Dự án nổi bật
              </span>
              <span className="h-px flex-1 bg-neutral-200" />
            </div>
            <h2 className="mt-4 font-display text-3xl font-medium tracking-tight text-neutral-950 sm:text-4xl md:text-5xl [text-wrap:balance]">
              Những thước phim làm nên{" "}
              <span className="text-accent-400">dấu ấn Xưởng Art</span>
            </h2>
          </FadeIn>
        </div>
        <ProjectsGallery />
      </div>
      <Stats />
      <Clients />
      {/* Testimonials section removed by request */}
      <Services />
      <ContactSection />
    </main>
  );
}
