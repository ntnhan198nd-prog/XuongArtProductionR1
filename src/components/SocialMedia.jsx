import clsx from "clsx";
import { BsFacebook, BsInstagram } from "react-icons/bs";
import { SiTiktok } from "react-icons/si";
import { DEFAULT_SITE_CONTENT } from "@/lib/siteContent";

// Custom Zalo glyph instead of react-icons/si's SiZalo. SiZalo renders
// Zalo's official wordmark (the cursive "zalo" logotype), which sits next
// to the abstract glyphs of FB / IG / TikTok and reads as text — not an
// icon. This replacement is a chat bubble with a "Z" cut out via evenodd,
// matching the visual weight and silhouette of the rest of the row.
function ZaloIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      role="img"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 1.5C6.201 1.5 1.5 6.201 1.5 12c0 1.84.473 3.567 1.305 5.07l-1.165 4.36c-.13.488.328.946.815.815l4.36-1.165C8.433 22.027 10.16 22.5 12 22.5c5.799 0 10.5-4.701 10.5-10.5S17.799 1.5 12 1.5zM9.225 8.475c-.414 0-.75.336-.75.75s.336.75.75.75h3.945l-4.815 5.788a.75.75 0 0 0-.101.802c.124.266.39.435.683.435h6a.75.75 0 0 0 0-1.5h-4.233l4.815-5.788c.186-.224.225-.537.101-.802a.75.75 0 0 0-.683-.435z"
      />
    </svg>
  );
}

// Static icon map. URLs come from site content (admin-editable). Items with
// empty/missing URLs are hidden so admins can disable a network without
// touching code.
const SOCIAL_PLATFORMS = [
  { key: "facebook", title: "Facebook", icon: BsFacebook },
  { key: "instagram", title: "Instagram", icon: BsInstagram },
  { key: "tiktok", title: "TikTok", icon: SiTiktok },
  { key: "zalo", title: "Zalo", icon: ZaloIcon },
];

export function buildSocialProfiles(content) {
  const data = content || DEFAULT_SITE_CONTENT.social;
  return SOCIAL_PLATFORMS.map((platform) => ({
    title: platform.title,
    href: (data?.[platform.key] || "").trim() || null,
    icon: platform.icon,
  })).filter((item) => Boolean(item.href));
}

// Backwards-compatible export for any caller that imported the static list.
export const SocialMediaProfiles = buildSocialProfiles(DEFAULT_SITE_CONTENT.social);

const SocialMedia = ({ className, invert = false, content }) => {
  const profiles = content ? buildSocialProfiles(content) : SocialMediaProfiles;
  if (profiles.length === 0) return null;
  return (
    <ul
      role="list"
      className={clsx(
        "flex gap-x-10",
        invert ? "text-white" : "text-neutral-950",
        className
      )}
    >
      {profiles.map((item) => (
        <li key={item.title}>
          <a
            href={item.href}
            target="_blank"
            rel="noreferrer"
            aria-label={item.title}
            className={clsx(
              "transition",
              invert ? "hover:text-neutral-200" : "hover:text-neutral-700"
            )}
          >
            <item.icon className="h-6 w-6 fill-current" />
          </a>
        </li>
      ))}
    </ul>
  );
};

export default SocialMedia;
