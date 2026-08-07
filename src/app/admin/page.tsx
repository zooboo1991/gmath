import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/admin/AdminDashboard";
import {
  getAnalyticsStatsForRange,
  getDashboardStats,
  getPageViewCountsByPrefix,
  getTotalPageViews,
  listAllRegistrations,
  listArticles,
  listCertificates,
  listCourses,
  listUsers,
  listYearlyPrograms,
  type AnalyticsRangeStats,
} from "@/lib/db";
import { getAssessmentFee } from "@/lib/assessment/db";
import { DEFAULT_ASSESSMENT_FEE } from "@/lib/assessment/config";
import { isAdmin } from "@/lib/session";

const EMPTY_ANALYTICS: AnalyticsRangeStats = {
  views: 0,
  visitors: 0,
  topPages: [],
  topReferrers: [],
  daily: [],
  newRegistrations: 0,
  newRevenue: 0,
  newUsers: 0,
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Админ хэсэг",
};

export default async function AdminPage() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const [registrations, courses, yearlyPrograms, articles, users, stats] = await Promise.all([
    listAllRegistrations(),
    // Drafts are hidden from the public site but must be listed here —
    // otherwise unpublishing a course would make it vanish from the admin.
    listCourses(undefined, { includeDrafts: true }),
    listYearlyPrograms(),
    listArticles(),
    listUsers(),
    getDashboardStats(),
  ]);

  // Analytics defaults to the current calendar month — the filter bar in
  // the Хандалт tab lets the admin pick a different range client-side.
  const now = new Date();
  const defaultTo = toDateStr(now);
  const defaultFrom = toDateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));

  // page_views, certificates and app_settings are newer tables — on a site
  // that hasn't run the latest schema.sql yet these throw, and the whole
  // admin page must not go down over one tab's data.
  const [analytics, viewsAllTime, certificates, assessmentFee, viewCounts] = await Promise.all([
    getAnalyticsStatsForRange(defaultFrom, defaultTo).catch(() => EMPTY_ANALYTICS),
    getTotalPageViews().catch(() => 0),
    listCertificates().catch(() => []),
    getAssessmentFee().catch(() => DEFAULT_ASSESSMENT_FEE),
    getPageViewCountsByPrefix("/courses/").catch(() => ({})),
  ]);

  return (
    <Suspense fallback={null}>
      <AdminDashboard
        initialRegistrations={registrations}
        initialCourses={courses}
        yearlyPrograms={yearlyPrograms}
        initialArticles={articles}
        initialUsers={users}
        initialCertificates={certificates}
        assessmentFee={assessmentFee}
        stats={stats}
        analytics={analytics}
        analyticsFrom={defaultFrom}
        analyticsTo={defaultTo}
        viewsAllTime={viewsAllTime}
        viewCounts={viewCounts}
      />
    </Suspense>
  );
}
