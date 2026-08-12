import type { Metadata } from "next";
import ArticlesPanel from "@/components/admin/panels/ArticlesPanel";
import {
  getArticleShareCounts,
  getPageViewCountsByPrefix,
  listArticles,
  listScheduledArticles,
} from "@/lib/db";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Нийтлэл — Админ" };

export default async function AdminArticlesPage() {
  await requireAdminSection("articles");
  const [articles, scheduled, viewCounts, shareCounts] = await Promise.all([
    // Scheduled articles are invisible to the public but must be listed here —
    // otherwise the admin couldn't see or edit what they just queued.
    listArticles({ includeScheduled: true }),
    listScheduledArticles(),
    getPageViewCountsByPrefix("/articles/").catch(() => ({})),
    getArticleShareCounts().catch(() => ({})),
  ]);
  return (
    <div className="px-6 lg:px-10 py-8">
      {/* ArticlesPanel carries its own heading + add button row. */}
      <ArticlesPanel
        articles={articles}
        viewCounts={viewCounts}
        shareCounts={shareCounts}
        scheduledIds={scheduled.map((a) => a.id)}
      />
    </div>
  );
}
