import type { Metadata } from "next";
import AnalyticsPanel from "@/components/admin/panels/AnalyticsPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { getAnalyticsStatsForRange, getTotalPageViews, type AnalyticsRangeStats } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Аналитик — Админ" };

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

export default async function AdminAnalyticsPage() {
  // Defaults to the current calendar month — the filter bar lets the admin
  // pick a different range client-side.
  const now = new Date();
  const defaultTo = toDateStr(now);
  const defaultFrom = toDateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));

  const [analytics, viewsAllTime] = await Promise.all([
    getAnalyticsStatsForRange(defaultFrom, defaultTo).catch(() => EMPTY_ANALYTICS),
    getTotalPageViews().catch(() => 0),
  ]);

  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Аналитик" />
      <AnalyticsPanel
        initialData={analytics}
        initialFrom={defaultFrom}
        initialTo={defaultTo}
        viewsAllTime={viewsAllTime}
      />
    </div>
  );
}
