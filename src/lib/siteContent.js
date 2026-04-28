// Default site content. Acts as fallback when the store has no override yet
// and as a reference shape for the admin UI / normalization.

export const DEFAULT_SITE_CONTENT = {
  hero: {
    showreelLabel: "Showreel · 2026",
    tagline: "Xưởng Art Production",
    headingMain: "Every frame",
    headingAccent: "tells a story",
    description:
      "Studio sản xuất video · TVC · MV · Livestream sự kiện · Hậu kỳ điện ảnh.",
    scrollHint: "Cuộn để xem dự án nổi bật",
  },
  intro: {
    headingMain: "Biến ý tưởng thành",
    headingAccent: "trải nghiệm số",
    description:
      "Studio sáng tạo nơi nghệ thuật gặp công nghệ. Chúng tôi sản xuất video và nội dung hình ảnh đậm chất điện ảnh — kể câu chuyện thương hiệu bằng ngôn ngữ thị giác tinh tế và cảm xúc thật.",
  },
  featuredHeader: {
    eyebrow: "Dự án nổi bật",
    headingMain: "Những thước phim làm nên",
    headingAccent: "dấu ấn Xưởng Art",
  },
  stats: {
    eyebrow: "Numbers that matter",
    heading: "Hành trình của Xưởng Art qua các con số",
    items: [
      { value: 200, suffix: "+", label: "Dự án đã sản xuất", decimals: 0 },
      { value: 50, suffix: "+", label: "Thương hiệu đối tác", decimals: 0 },
      { value: 8, suffix: "", label: "Năm kinh nghiệm", decimals: 0 },
      { value: 1.2, suffix: "M", label: "Lượt xem trên YouTube", decimals: 1 },
    ],
  },
  clients: {
    strategicHeading: "Đối tác chiến lược",
    strategicBrands: [
      { alt: "Samsung", logoUrl: "", logoKey: "" },
      { alt: "Apple", logoUrl: "", logoKey: "" },
      { alt: "Sony", logoUrl: "", logoKey: "" },
      { alt: "BYD", logoUrl: "", logoKey: "" },
      { alt: "Xiaomi", logoUrl: "", logoKey: "" },
    ],
    marqueeHeading:
      "Và các thương hiệu, đối tác sáng tạo đã đồng hành",
    marqueeShowDots: true,
    // Legacy field kept for backward-compat with previously-saved content.
    heading: "Chúng tôi đã đồng hành cùng nhiều thương hiệu & đối tác sáng tạo",
    brands: [
      "Redmi",
      "Asus",
      "Cellphones",
      "Oppo",
      "Huawei",
      "Monday VietNam",
      "HOYOVERSE",
      "PGI",
      "INNO",
    ],
  },
  services: {
    eyebrow: "Dịch vụ",
    headingMain: "Chúng tôi giúp bạn kể câu chuyện thương hiệu bằng",
    headingAccent: "hình ảnh chuyển động",
    tagline: "Every frame tells a story.",
    image: { url: "", key: "", alt: "" },
    items: [
      {
        title: "Post-Production",
        description:
          "Dựng phim, biên tập, hiệu ứng hình ảnh, chỉnh màu – đảm bảo từng chi tiết đạt chất điện ảnh.",
      },
      {
        title: "Livestream & Event Coverage",
        description:
          "Giải pháp ghi hình và phát trực tiếp sự kiện, talkshow, hội nghị với chất lượng cao và tương tác mạnh mẽ.",
      },
      {
        title: "Creative Content",
        description:
          "Nội dung hình ảnh sáng tạo cho doanh nghiệp và thương hiệu: phim doanh nghiệp, video social media, chiến dịch truyền thông.",
      },
      {
        title: "Video Production",
        description:
          "Từ TVC quảng cáo, viral clip đến music video – chúng tôi tạo nên những thước phim giàu cảm xúc và chuyên nghiệp.",
      },
    ],
  },
  cta: {
    heading: "Hãy chia sẻ với chúng tôi về dự án của bạn",
    buttonText: "👉 Bắt đầu hợp tác",
    contactsHeading: "Thông tin liên hệ",
    officeName: "Our Office – Hồ Chí Minh City",
    address: "📍 172 Lâm Văn Bền, phường Tân Quy, Quận 7, HCM, Vietnam",
    phone: "☎ 036 499 4647",
    email: "📧 ntnhan198.nd@gmail.com",
  },
  about: {
    eyebrow: "Về chúng tôi",
    title: "XưởngArt – Kể chuyện bằng hình ảnh chuyển động",
    lead: "Chúng tôi là studio sáng tạo chuyên về sản xuất video và nội dung hình ảnh. Mục tiêu của XưởngArt là giúp thương hiệu kể được câu chuyện của mình một cách giàu cảm xúc, hiện đại và hiệu quả.",
    paragraphs: [
      "Từ quảng cáo, MV, social video đến ghi hình sự kiện, mỗi dự án đều được thực hiện theo quy trình chuẩn điện ảnh: tiền kỳ kỹ lưỡng, sản xuất gọn gàng và hậu kỳ tỉ mỉ.",
      "Chúng tôi tin rằng Every frame tells a story – mỗi khung hình đều có sức mạnh khơi gợi cảm xúc và truyền tải thông điệp rõ ràng.",
    ],
    stats: [
      { value: "50+", label: "Dự án đã thực hiện" },
      { value: "20+", label: "Thương hiệu đồng hành" },
      { value: "5+ năm", label: "Kinh nghiệm đội ngũ" },
    ],
  },
  cultures: {
    eyebrow: "Văn hoá",
    title: "Đam mê sáng tạo, cân bằng cuộc sống.",
    description:
      "Chúng tôi đề cao tinh thần hợp tác, tôn trọng lẫn nhau và luôn hướng đến trải nghiệm tốt nhất cho khách hàng.",
    items: [
      {
        title: "Cam kết",
        description:
          "Đồng hành cùng thương hiệu, giữ lời hứa về chất lượng và tiến độ.",
      },
      {
        title: "Tin cậy",
        description: "Quy trình rõ ràng, giao tiếp minh bạch, ưu tiên hiệu quả.",
      },
      {
        title: "Thấu cảm",
        description:
          "Luôn lắng nghe câu chuyện của khách hàng để truyền tải đúng cảm xúc.",
      },
    ],
  },
  footer: {
    heading: "Liên hệ nhanh",
    email: "ntnhan198.nd@gmail.com",
    phone: "036 499 4647",
    copyright: "XUONGART Inc.",
  },
  social: {
    facebook: "https://www.facebook.com/xuongartproduction",
    instagram: "",
    tiktok: "",
    zalo: "",
  },
  ui: {
    loadingProjectsText: "Đang tải dự án...",
  },
};

const isString = (v) => typeof v === "string";
const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const isFiniteNum = (v) => Number.isFinite(Number(v));

function pickString(value, fallback) {
  if (isString(value)) return value;
  return fallback;
}

function pickNumber(value, fallback) {
  if (isFiniteNum(value)) return Number(value);
  return fallback;
}

function pickArray(value, fallback, mapItem) {
  if (!Array.isArray(value)) return fallback;
  return value.map(mapItem).filter((item) => item !== null && item !== undefined);
}

// Deep-merge user-provided site content with the defaults so missing fields
// fall back automatically and the frontend never sees `undefined`.
export function normalizeSiteContent(input) {
  const src = isObject(input) ? input : {};
  const d = DEFAULT_SITE_CONTENT;

  return {
    hero: {
      ...d.hero,
      ...(isObject(src.hero) ? src.hero : {}),
    },
    intro: {
      ...d.intro,
      ...(isObject(src.intro) ? src.intro : {}),
    },
    featuredHeader: {
      ...d.featuredHeader,
      ...(isObject(src.featuredHeader) ? src.featuredHeader : {}),
    },
    stats: {
      eyebrow: pickString(src.stats?.eyebrow, d.stats.eyebrow),
      heading: pickString(src.stats?.heading, d.stats.heading),
      items: pickArray(src.stats?.items, d.stats.items, (item) => {
        if (!isObject(item)) return null;
        return {
          value: pickNumber(item.value, 0),
          suffix: pickString(item.suffix, ""),
          label: pickString(item.label, ""),
          decimals: pickNumber(item.decimals, 0),
        };
      }),
    },
    clients: (() => {
      const rawStrategic = Array.isArray(src.clients?.strategicBrands)
        ? src.clients.strategicBrands
        : d.clients.strategicBrands;
      const emptySlot = { alt: "", logoUrl: "", logoKey: "" };
      const cleanedStrategic = rawStrategic.map((item) => {
        // Legacy string entries: keep as alt text so they still render until a
        // logo is uploaded.
        if (isString(item)) {
          return { alt: item.trim(), logoUrl: "", logoKey: "" };
        }
        if (isObject(item)) {
          return {
            alt: pickString(item.alt, ""),
            logoUrl: pickString(item.logoUrl, ""),
            logoKey: pickString(item.logoKey, ""),
          };
        }
        return { ...emptySlot };
      });
      const strategicBrands = [
        ...cleanedStrategic,
        emptySlot,
        emptySlot,
        emptySlot,
        emptySlot,
        emptySlot,
      ].slice(0, 5);
      // Fall back to legacy `heading` if `marqueeHeading` not present so saved
      // content from before this split keeps rendering correctly.
      const marqueeHeading =
        pickString(src.clients?.marqueeHeading, undefined) ??
        pickString(src.clients?.heading, d.clients.marqueeHeading);
      return {
        strategicHeading: pickString(
          src.clients?.strategicHeading,
          d.clients.strategicHeading
        ),
        strategicBrands,
        marqueeHeading,
        marqueeShowDots:
          typeof src.clients?.marqueeShowDots === "boolean"
            ? src.clients.marqueeShowDots
            : d.clients.marqueeShowDots,
        heading: pickString(src.clients?.heading, d.clients.heading),
        brands: pickArray(src.clients?.brands, d.clients.brands, (item) => {
          if (!isString(item)) return null;
          const v = item.trim();
          return v || null;
        }),
      };
    })(),
    services: {
      eyebrow: pickString(src.services?.eyebrow, d.services.eyebrow),
      headingMain: pickString(src.services?.headingMain, d.services.headingMain),
      headingAccent: pickString(src.services?.headingAccent, d.services.headingAccent),
      tagline: pickString(src.services?.tagline, d.services.tagline),
      image: (() => {
        const img = src.services?.image;
        if (isObject(img)) {
          return {
            url: pickString(img.url, ""),
            key: pickString(img.key, ""),
            alt: pickString(img.alt, ""),
          };
        }
        return { ...d.services.image };
      })(),
      items: pickArray(src.services?.items, d.services.items, (item) => {
        if (!isObject(item)) return null;
        const title = pickString(item.title, "").trim();
        const description = pickString(item.description, "").trim();
        if (!title && !description) return null;
        return { title, description };
      }),
    },
    cta: {
      ...d.cta,
      ...(isObject(src.cta) ? src.cta : {}),
    },
    about: {
      eyebrow: pickString(src.about?.eyebrow, d.about.eyebrow),
      title: pickString(src.about?.title, d.about.title),
      lead: pickString(src.about?.lead, d.about.lead),
      paragraphs: pickArray(src.about?.paragraphs, d.about.paragraphs, (item) => {
        if (!isString(item)) return null;
        const v = item.trim();
        return v || null;
      }),
      stats: pickArray(src.about?.stats, d.about.stats, (item) => {
        if (!isObject(item)) return null;
        return {
          value: pickString(item.value, ""),
          label: pickString(item.label, ""),
        };
      }),
    },
    cultures: {
      eyebrow: pickString(src.cultures?.eyebrow, d.cultures.eyebrow),
      title: pickString(src.cultures?.title, d.cultures.title),
      description: pickString(src.cultures?.description, d.cultures.description),
      items: pickArray(src.cultures?.items, d.cultures.items, (item) => {
        if (!isObject(item)) return null;
        const title = pickString(item.title, "").trim();
        const description = pickString(item.description, "").trim();
        if (!title && !description) return null;
        return { title, description };
      }),
    },
    footer: {
      ...d.footer,
      ...(isObject(src.footer) ? src.footer : {}),
    },
    social: {
      ...d.social,
      ...(isObject(src.social) ? src.social : {}),
    },
    ui: {
      ...d.ui,
      ...(isObject(src.ui) ? src.ui : {}),
    },
  };
}
