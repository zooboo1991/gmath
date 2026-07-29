import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { getDashboardStats, listAllRegistrations, listArticles, listCourses, listUsers } from "@/lib/db";
import { isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Админ хэсэг",
};

export default async function AdminPage() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const [registrations, courses, articles, users, stats] = await Promise.all([
    listAllRegistrations(),
    // Drafts are hidden from the public site but must be listed here —
    // otherwise unpublishing a course would make it vanish from the admin.
    listCourses(undefined, { includeDrafts: true }),
    listArticles(),
    listUsers(),
    getDashboardStats(),
  ]);

  return (
    <Suspense fallback={null}>
      <AdminDashboard
        initialRegistrations={registrations}
        initialCourses={courses}
        initialArticles={articles}
        initialUsers={users}
        stats={stats}
      />
    </Suspense>
  );
}
