import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/admin/AdminDashboard";
import {
  getAnalyticsStats,
  getDashboardStats,
  listAllRegistrations,
  listArticles,
  listCertificates,
  listCourses,
  listUsers,
  type AnalyticsStats,
} from "@/lib/db";
import { isAdmin } from "@/lib/session";

const EMPTY_ANALYTICS: AnalyticsStats = {
  viewsAllTime: 0,
  viewsToday: 0,
  viewsWeek: 0,
  viewsMonth: 0,
  visitorsToday: 0,
  visitorsWeek: 0,
  visitorsMonth: 0,
  topPages: [],
  topReferrers: [],
  daily: [],
};

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

  // page_views and certificates are newer tables — on a site that hasn't run
  // the latest schema.sql yet these throw, and the whole admin page must not
  // go down over one tab's data.
  const [analytics, certificates] = await Promise.all([
    getAnalyticsStats().catch(() => EMPTY_ANALYTICS),
    listCertificates().catch(() => []),
  ]);

  return (
    <Suspense fallback={null}>
      <AdminDashboard
        initialRegistrations={registrations}
        initialCourses={courses}
        initialArticles={articles}
        initialUsers={users}
        initialCertificates={certificates}
        stats={stats}
        analytics={analytics}
      />
    </Suspense>
  );
}
