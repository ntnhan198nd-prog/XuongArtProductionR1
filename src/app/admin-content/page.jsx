import { redirect } from "next/navigation";

// Legacy route — Site Content editor was merged into /admin as a tab.
// Server-redirect so old bookmarks land on the right tab.
export default function AdminContentRedirect() {
  redirect("/admin?tab=content");
}
