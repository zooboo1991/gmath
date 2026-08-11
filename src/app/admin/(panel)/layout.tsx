import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { getAdminRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Shell for every admin page except /admin/login (which lives outside this
 * route group precisely so it renders without the rail). The auth guard here
 * covers all child pages. Which sections the read-only account may open is a
 * per-page decision (requireAdminSection), because this layout can't see the
 * pathname.
 */
export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const role = await getAdminRole();
  if (!role) {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen bg-bg-soft">
      <AdminSidebar role={role} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
