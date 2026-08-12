"use client";

import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/dateFormat";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Article } from "@/lib/db";

/** The articles tab as its own route component — delete state used to live in the dashboard parent. */
export default function ArticlesPanel({
  articles,
  viewCounts,
  shareCounts,
  scheduledIds,
}: {
  articles: Article[];
  /** Keyed by path ("/articles/<id>"), the shape getPageViewCountsByPrefix returns. */
  viewCounts: Record<string, number>;
  /** Keyed by article id. Counts clicks on the site's share button, not Facebook's own share total. */
  shareCounts: Record<string, number>;
  /**
   * Ids of the articles that haven't reached their publish time. Decided by
   * Postgres, not by comparing dates here: a component may not read a clock
   * during render, and the database is the same authority the public queries
   * use, so the admin list can't disagree with what visitors see.
   */
  scheduledIds: string[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const removeArticle = async (id: string) => {
    if (!confirm("Энэ нийтлэлийг устгах уу?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  // Queued posts first, in the order they'll go out — that's the list the
  // admin needs to act on. Everything already live keeps newest-first.
  const scheduledSet = new Set(scheduledIds);
  const scheduled = articles
    .filter((a) => scheduledSet.has(a.id))
    .sort((a, b) => Date.parse(a.publishAt!) - Date.parse(b.publishAt!));
  const live = articles.filter((a) => !scheduledSet.has(a.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[1.15rem] font-extrabold">Нийтлэл</h2>
        <Link
          href="/admin/articles/new"
          className="text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2 rounded-full"
        >
          + Нийтлэл нэмэх
        </Link>
      </div>

      {scheduled.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[.95rem] font-extrabold text-ink-2 mb-2.5">
            Хуваарьт ({scheduled.length})
          </h3>
          <div className="flex flex-col gap-2.5">
            {scheduled.map((a) => (
              <ArticleRow
                key={a.id}
                article={a}
                views={viewCounts[`/articles/${a.id}`] ?? 0}
                shares={shareCounts[a.id] ?? 0}
                busy={busyId === a.id}
                onRemove={removeArticle}
                scheduled
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {articles.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Одоогоор алга.</p>}
        {live.map((a) => (
          <ArticleRow
            key={a.id}
            article={a}
            views={viewCounts[`/articles/${a.id}`] ?? 0}
            shares={shareCounts[a.id] ?? 0}
            busy={busyId === a.id}
            onRemove={removeArticle}
            scheduled={false}
          />
        ))}
      </div>
    </div>
  );
}

function ArticleRow({
  article: a,
  views,
  shares,
  busy,
  onRemove,
  scheduled,
}: {
  article: Article;
  views: number;
  shares: number;
  busy: boolean;
  onRemove: (id: string) => void;
  scheduled: boolean;
}) {
  return (
    <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {a.featured && (
            <span className="text-[.72rem] font-extrabold tracking-[.08em] uppercase text-gold-strong">
              Онцлох
            </span>
          )}
          {scheduled && (
            <span className="text-[.7rem] font-extrabold text-gold-strong bg-gold-soft px-2 py-0.5 rounded-full">
              {formatDateTime(a.publishAt!)}-д нийтлэгдэнэ
            </span>
          )}
        </div>
        <b className="font-extrabold block">{a.title}</b>
        <span className="text-ink-3 font-semibold text-[.85rem]">
          {a.author} · {formatDate(a.createdAt)}
        </span>
        <div className="flex items-center gap-3 flex-wrap text-[.8rem] font-bold text-ink-3 mt-1.5">
          <span>
            Үзсэн <b className="font-extrabold text-ink-2">{views}</b>
          </span>
          <span>
            Хуваалцсан <b className="font-extrabold text-ink-2">{shares}</b>
          </span>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <Link
          href={`/articles/${a.id}`}
          target="_blank"
          className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-3.5 py-2 rounded-full"
        >
          Харах
        </Link>
        <Link
          href={`/admin/articles/${a.id}/edit`}
          className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-3.5 py-2 rounded-full"
        >
          Засах
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => onRemove(a.id)}
          className="text-[.82rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-3.5 py-2 rounded-full disabled:opacity-50"
        >
          Устгах
        </button>
      </div>
    </div>
  );
}
