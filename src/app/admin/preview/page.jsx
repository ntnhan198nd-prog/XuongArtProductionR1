import { cookies } from "next/headers";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import SitePreviewClient from "./SitePreviewClient";

// Live preview of the unsaved "Nội dung trang" draft, shown in an iframe
// next to the editor. Admin-only; it never reads or writes the store itself
// (the draft arrives by postMessage from the admin page).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Xem trước",
  robots: { index: false, follow: false },
};

export default function AdminSitePreviewPage() {
  // Same check as the admin API routes: isAdminAuthenticated only needs
  // `.cookies.get(name)?.value`, which next/headers' cookies() provides.
  if (!isAdminAuthenticated({ cookies: cookies() })) {
    return (
      <div className="px-4 py-10 text-sm text-neutral-700">
        Bạn cần đăng nhập trang quản trị để xem trước.
      </div>
    );
  }
  return <SitePreviewClient />;
}
