import type { Metadata } from "next";
import CoursesPanel from "@/components/admin/panels/CoursesPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { getPageViewCountsByPrefix, listAllRegistrations, listCourses, listYearlyPrograms } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Сургалтууд — Админ" };

export default async function AdminCoursesPage() {
  const [courses, yearlyPrograms, registrations, viewCounts] = await Promise.all([
    // Drafts are hidden from the public site but must be listed here —
    // otherwise unpublishing a course would make it vanish from the admin.
    listCourses(undefined, { includeDrafts: true }),
    listYearlyPrograms(),
    listAllRegistrations(),
    getPageViewCountsByPrefix("/courses/").catch(() => ({})),
  ]);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Сургалтууд" />
      <CoursesPanel
        initialCourses={courses}
        yearlyPrograms={yearlyPrograms}
        registrations={registrations}
        viewCounts={viewCounts}
      />
    </div>
  );
}
