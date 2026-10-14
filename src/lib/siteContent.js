// Default site content. Acts as fallback when the store has no override yet
// and as a reference shape for the admin UI / normalization.

export const DEFAULT_SITE_CONTENT = {
  hero: {
    showreelLabel: "Showreel · 2026",
    tagline: "XUONGART Production",
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
    headingAccent: "dấu ấn XUONGART",
  },
  stats: {
    eyebrow: "Numbers that matter",
    heading: "Hành trình của XUONGART qua các con số",
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
    // Shared contact details: homepage dark footer + fallback for the
    // /whoweare CTA block.
    officeName: "Văn phòng XUONGART",
    address: "172 Lâm Văn Bền, phường Tân Quy, Quận 7, TP.HCM",
    phone: "036 499 4647",
    email: "xuongart.stu@gmail.com",
  },
  // /whoweare. Every section is admin-editable; `sections` controls the
  // order and visibility of the blocks on the page. Sections whose key is
  // not listed here are appended (enabled by default) at normalize time.
  about: {
    sections: [
      { key: "hero", enabled: true },
      { key: "founder", enabled: true },
      { key: "values", enabled: true },
      { key: "process", enabled: true },
      { key: "testimonials", enabled: true },
      { key: "services", enabled: false },
      { key: "cta", enabled: true },
    ],
    hero: {
      eyebrow: "Xưởng phim Quận 7",
      title: "Đúng brief. Đúng hẹn. Xem lại vẫn thích.",
      lead: "XUONGART làm TVC, MV, social video, phim doanh nghiệp, livestream và ghi hình sự kiện, hậu kỳ điện ảnh. Deadline gấp, brief đổi phút chót, revision vòng ba: chúng tôi quen rồi.",
      paragraphs: [],
      showStats: true,
      stats: [
        { value: "200+", label: "dự án đã giao" },
        { value: "50+", label: "thương hiệu, từ Sony đến HOYOVERSE" },
        { value: "10 năm", label: "founder trong nghề, từ 2016" },
      ],
    },
    founder: {
      eyebrow: "Người cầm lái",
      name: "Nguyễn Trọng Nhân",
      role: "Founder & Director",
      story: [
        "Nhân vào nghề năm 2016. Năm năm trên set dạy anh một điều: ý tưởng hay thì nhiều, người theo tới khung hình cuối mới hiếm.",
        "Năm 2021, anh lập XUONGART tại TP.HCM để làm phim theo cách mình tin: ekip cố định hiểu ý nhau, cộng mạng lưới freelance tin cậy khi cần thêm tay.",
      ],
      quote: "Khách không cần tôi tài hoa lúc 2 giờ sáng, họ cần file đúng hẹn lúc 9 giờ.",
      photo: { url: "", key: "", alt: "" },
    },
    values: {
      eyebrow: "Cách chúng tôi làm",
      title: "Ba thứ không thương lượng",
      description: "Khách lớn hay nhỏ, TVC hay livestream, cách làm vẫn vậy.",
      theme: "dark",
      items: [
        {
          title: "Hỏi trước",
          description: "Câu hỏi khó hỏi trước ngày quay, để ngày quay chỉ còn việc quay.",
        },
        {
          title: "Chịu nhiệt",
          description: "Mưa trên set hay livestream không có nút pause, ekip vẫn về đủ hình.",
        },
        {
          title: "Có gu",
          description: "Đẹp là mức tối thiểu, khung hình còn phải đúng tông thương hiệu.",
        },
      ],
    },
    process: {
      eyebrow: "Từ brief đến file",
      title: "Brief vào, phim ra",
      description: "",
      numbered: true,
      steps: [
        {
          title: "Nhận brief",
          description: "Hỏi kỹ mục tiêu, kênh phát, ngân sách, deadline thật, rồi gửi đề xuất kèm báo giá.",
        },
        {
          title: "Tiền kỳ",
          description: "Kịch bản, storyboard, casting, bối cảnh: chốt trên giấy trước khi ra set.",
        },
        {
          title: "Quay",
          description: "DOP và đạo diễn bám set tới shot cuối, phát sinh xử lý tại chỗ.",
        },
        {
          title: "Hậu kỳ",
          description: "Dựng, VFX, chỉnh màu, duyệt theo số vòng đã chốt, giao file đúng chuẩn từng kênh.",
        },
      ],
    },
    // Rendered only when at least one item exists, so the page never shows
    // an empty "what clients say" block.
    testimonials: {
      eyebrow: "Khách nói gì",
      title: "Người ngồi cạnh monitor",
      description: "",
      items: [],
    },
    // officeName / address / phone / email are page-specific; clearing one
    // in the admin makes it fall back to the shared `cta` block (homepage
    // footer). They ship filled because the live store may still carry the
    // older shared contact copy (emoji prefixes, previous email).
    cta: {
      heading: "Nhắn cho chúng tôi trước khi deadline nhắn cho bạn.",
      buttonText: "Bắt đầu hợp tác",
      buttonUrl: "https://m.me/xuongartproduction",
      contactsHeading: "Hoặc liên hệ trực tiếp",
      officeName: "Văn phòng XUONGART",
      address: "172 Lâm Văn Bền, phường Tân Quy, Quận 7, TP.HCM",
      phone: "036 499 4647",
      email: "xuongart.stu@gmail.com",
      tagline: "Every frame tells a story.",
      theme: "dark",
      showSocial: true,
    },
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
    youtube: "",
    zalo: "",
  },
  ui: {
    loadingProjectsText: "Đang tải dự án...",
  },
  portfolio: {
    // Whitelist of category labels surfaced in the search dropdown of each
    // gallery. Empty array = fall back to auto-collecting from project data.
    searchCategories: ["Commercial", "TVC", "Recap", "MV", "Social Media"],
    imageSearchCategories: ["Fashion", "Product", "Event", "Portrait"],
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

function pickBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function pickTheme(value, fallback) {
  return value === "dark" || value === "light" ? value : fallback;
}

function pickImage(value, fallback) {
  if (isObject(value)) {
    return {
      url: pickString(value.url, ""),
      key: pickString(value.key, ""),
      alt: pickString(value.alt, ""),
    };
  }
  return { ...fallback };
}

function pickStringList(value, fallback) {
  return pickArray(value, fallback, (item) => {
    if (!isString(item)) return null;
    const v = item.trim();
    return v || null;
  });
}

function pickTitledList(value, fallback) {
  return pickArray(value, fallback, (item) => {
    if (!isObject(item)) return null;
    const title = pickString(item.title, "").trim();
    const description = pickString(item.description, "").trim();
    if (!title && !description) return null;
    return { title, description };
  });
}

// /whoweare sections. Order here is the default page order; the admin can
// reorder and toggle each one through `about.sections`.
export const ABOUT_SECTION_KEYS = [
  "hero",
  "founder",
  "values",
  "process",
  "testimonials",
  "services",
  "cta",
];

export const ABOUT_SECTION_LABELS = {
  hero: "Mở đầu + số liệu",
  founder: "Founder",
  values: "Giá trị / cách làm",
  process: "Quy trình",
  testimonials: "Khách nói gì",
  services: "Dịch vụ (nội dung lấy từ block Dịch vụ)",
  cta: "Liên hệ (CTA)",
};

// Keep saved order, drop unknown/duplicate keys, append anything missing
// (new sections added in code show up automatically, enabled per default).
function normalizeAboutSections(input, defaults) {
  const seen = new Set();
  const out = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      const key = isObject(item) ? item.key : item;
      if (!ABOUT_SECTION_KEYS.includes(key) || seen.has(key)) continue;
      seen.add(key);
      const def = defaults.find((entry) => entry.key === key);
      out.push({
        key,
        enabled: pickBool(isObject(item) ? item.enabled : undefined, def ? def.enabled : true),
      });
    }
  }
  for (const def of defaults) {
    if (!seen.has(def.key)) out.push({ ...def });
  }
  return out;
}

// The pre-redesign `about` shape ({ eyebrow, title, lead, paragraphs, stats }
// at the top level) is deliberately NOT migrated: the live site only ever
// showed its defaults, and carrying them over would put the old hero copy
// on top of the new sections.
function normalizeAbout(input, d) {
  const src = isObject(input) ? input : {};
  const hero = isObject(src.hero) ? src.hero : {};
  const founder = isObject(src.founder) ? src.founder : {};
  const values = isObject(src.values) ? src.values : {};
  const process = isObject(src.process) ? src.process : {};
  const testimonials = isObject(src.testimonials) ? src.testimonials : {};
  const cta = isObject(src.cta) ? src.cta : {};

  return {
    sections: normalizeAboutSections(src.sections, d.sections),
    hero: {
      eyebrow: pickString(hero.eyebrow, d.hero.eyebrow),
      title: pickString(hero.title, d.hero.title),
      lead: pickString(hero.lead, d.hero.lead),
      paragraphs: pickStringList(hero.paragraphs, d.hero.paragraphs),
      showStats: pickBool(hero.showStats, d.hero.showStats),
      stats: pickArray(hero.stats, d.hero.stats, (item) => {
        if (!isObject(item)) return null;
        const value = pickString(item.value, "").trim();
        const label = pickString(item.label, "").trim();
        if (!value && !label) return null;
        return { value, label };
      }),
    },
    founder: {
      eyebrow: pickString(founder.eyebrow, d.founder.eyebrow),
      name: pickString(founder.name, d.founder.name),
      role: pickString(founder.role, d.founder.role),
      story: pickStringList(founder.story, d.founder.story),
      quote: pickString(founder.quote, d.founder.quote),
      photo: pickImage(founder.photo, d.founder.photo),
    },
    values: {
      eyebrow: pickString(values.eyebrow, d.values.eyebrow),
      title: pickString(values.title, d.values.title),
      description: pickString(values.description, d.values.description),
      theme: pickTheme(values.theme, d.values.theme),
      items: pickTitledList(values.items, d.values.items),
    },
    process: {
      eyebrow: pickString(process.eyebrow, d.process.eyebrow),
      title: pickString(process.title, d.process.title),
      description: pickString(process.description, d.process.description),
      numbered: pickBool(process.numbered, d.process.numbered),
      steps: pickTitledList(process.steps, d.process.steps),
    },
    testimonials: {
      eyebrow: pickString(testimonials.eyebrow, d.testimonials.eyebrow),
      title: pickString(testimonials.title, d.testimonials.title),
      description: pickString(testimonials.description, d.testimonials.description),
      items: pickArray(testimonials.items, d.testimonials.items, (item) => {
        if (!isObject(item)) return null;
        const quote = pickString(item.quote, "").trim();
        if (!quote) return null;
        return {
          quote,
          name: pickString(item.name, "").trim(),
          role: pickString(item.role, "").trim(),
        };
      }),
    },
    cta: {
      heading: pickString(cta.heading, d.cta.heading),
      buttonText: pickString(cta.buttonText, d.cta.buttonText),
      buttonUrl: pickString(cta.buttonUrl, d.cta.buttonUrl),
      contactsHeading: pickString(cta.contactsHeading, d.cta.contactsHeading),
      officeName: pickString(cta.officeName, d.cta.officeName),
      address: pickString(cta.address, d.cta.address),
      phone: pickString(cta.phone, d.cta.phone),
      email: pickString(cta.email, d.cta.email),
      tagline: pickString(cta.tagline, d.cta.tagline),
      theme: pickTheme(cta.theme, d.cta.theme),
      showSocial: pickBool(cta.showSocial, d.cta.showSocial),
    },
  };
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
    about: normalizeAbout(src.about, d.about),
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
    portfolio: {
      searchCategories: pickArray(
        src.portfolio?.searchCategories,
        d.portfolio.searchCategories,
        (item) => {
          if (!isString(item)) return null;
          const v = item.trim();
          return v || null;
        }
      ),
      imageSearchCategories: pickArray(
        src.portfolio?.imageSearchCategories,
        d.portfolio.imageSearchCategories,
        (item) => {
          if (!isString(item)) return null;
          const v = item.trim();
          return v || null;
        }
      ),
    },
  };
}
