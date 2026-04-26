import { SocialMediaProfiles } from "@/components/SocialMedia";

export const navigation = [
  {
    title: "Dự án",
    links: [
      {
        title: "Xem tất cả",
        href: "/portfolio",
      },
    ],
  },
  {
    title: "Công ty",
    links: [
      { title: "Liên hệ", href: "/contact" },
    ],
  },
  {
    title: "Kết nối",
    links: SocialMediaProfiles,
  },
];
