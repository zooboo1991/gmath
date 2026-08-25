import type { Metadata } from "next";
import AnalyticsPanel from "@/components/admin/panels/AnalyticsPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { getAnalyticsStatsForRange, getTotalPageViews, type AnalyticsRangeStats } from "@/lib/db";
import { getActivityStats, type ActivityStats } from "@/lib/activityStats";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Аналитик — Админ" };

const EMPTY_ANALYTICS: AnalyticsRangeStats = {
  views: 0,
  visitors: 0,
  sessions: 0,
  totalMinutes: 0,
  avgSessionMinutes: 0,
  pagesPerSession: 0,
  bounceRate: 0,
  newVisitors: 0,
  topPages: [],
  topReferrers: [],
  daily: [],
  byHour: [],
  byWeekday: [],
  newRegistrations: 0,
  newRevenue: 0,
  newUsers: 0,
};

const EMPTY_ACTIVITY: ActivityStats = {
  assessment: { started: 0, submitted: 0, completed: 0 },
  waitlist: 0,
  chat: { conversations: 0, issues: 0 },
  certificates: { downloads: 0, verifies: 0 },
  attended: 0,
  notifications: 0,
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AdminAnalyticsPage() {
  await requireAdminSection("analytics");

  // Defaults to the current calendar month — the filter bar lets the admin
  // pick a different range client-side.
  const now = new Date();
  const defaultTo = toDateStr(now);
  const defaultFrom = toDateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));

  const [analytics, activity, viewsAllTime] = await Promise.all([
    getAnalyticsStatsForRange(defaultFrom, defaultTo).catch(() => EMPTY_ANALYTICS),
    getActivityStats(defaultFrom, defaultTo).catch(() => EMPTY_ACTIVITY),
    getTotalPageViews().catch(() => 0),
  ]);

  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Аналитик" />
      <AnalyticsPanel
        initialData={analytics}
        initialActivity={activity}
        initialFrom={defaultFrom}
        initialTo={defaultTo}
        viewsAllTime={viewsAllTime}
      />
    </div>
  );
}
