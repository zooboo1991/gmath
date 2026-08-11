import type { Metadata } from "next";
import NotificationsPanel from "@/components/admin/panels/NotificationsPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { listCourses, listUsers, listYearlyPrograms } from "@/lib/db";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Мэдэгдэл — Админ" };

export default async function AdminNotificationsPage() {
  await requireAdminSection("notifications");
  const [users, courses, yearlyPrograms] = await Promise.all([
    listUsers(),
    listCourses(undefined, { includeDrafts: true }),
    listYearlyPrograms(),
  ]);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Мэдэгдэл" />
      <NotificationsPanel users={users} courses={courses} yearlyPrograms={yearlyPrograms} />
    </div>
  );
}
