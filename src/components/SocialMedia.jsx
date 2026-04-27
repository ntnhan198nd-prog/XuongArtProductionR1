import clsx from "clsx";
import {
  BsFacebook,
  BsInstagram,
  BsTwitter,
  BsYoutube,
  BsLinkedin,
} from "react-icons/bs";
import { DEFAULT_SITE_CONTENT } from "@/lib/siteContent";

// Static icon map. URLs come from site content (admin-editable). Items with
// empty/missing URLs are hidden so admins can disable a network without
// touching code.
const SOCIAL_PLATFORMS = [
  { key: "facebook", title: "Facebook", icon: BsFacebook },
  { key: "instagram", title: "Instagram", icon: BsInstagram },
  { key: "linkedin", title: "LinkedIn", icon: BsLinkedin },
  { key: "twitter", title: "Twitter / X", icon: BsTwitter },
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
