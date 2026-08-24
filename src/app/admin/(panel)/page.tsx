import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardPanel from "@/components/admin/panels/DashboardPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { getDashboardStats } from "@/lib/db";
import { canView } from "@/lib/adminSections";
import { TEACHER_LANDING } from "@/lib/adminAccess";
import { getAdminRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Хяналтын самбар — Админ",
};

/** Every tab of the old single-page dashboard is now its own route under /admin/<tab>. */
const TAB_ROUTES = new Set([
  "registrations",
  "courses",
  "articles",
  "users",
  "analytics",
  "certificates",
  "assessment",
  "notifications",
  "chat",
  "logs",
]);

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // The old ?tab=X deep links (bookmarks, the complaint push's /admin?tab=chat)
  // keep working by redirecting onto the route that replaced the tab.
  const { tab } = await searchParams;
  if (tab && TAB_ROUTES.has(tab)) {
    redirect(`/admin/${tab}`);
  }

  // The dashboard leads with total revenue, which a teacher's account has no
  // business seeing — so it is not one of their sections, and /admin sends
  // them to the page they actually came for.
  const role = await getAdminRole();
  if (role && !canView(role, "dashboard")) {
    redirect(TEACHER_LANDING);
  }

  const stats = await getDashboardStats();

  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Хяналтын самбар" />
      <DashboardPanel stats={stats} />
    </div>
  );
}
