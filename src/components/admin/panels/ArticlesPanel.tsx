"use client";

import Link from "next/link";
import { formatDate } from "@/lib/dateFormat";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Article } from "@/lib/db";

/** The articles tab as its own route component — delete state used to live in the dashboard parent. */
export default function ArticlesPanel({ articles }: { articles: Article[] }) {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[1.15rem] font-extrabold">Нийтлэлүүд</h2>
        <Link
          href="/admin/articles/new"
          className="text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2 rounded-full"
        >
          + Нийтлэл нэмэх
        </Link>
      </div>
      <div className="flex flex-col gap-2.5">
        {articles.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Одоогоор алга.</p>}
        {articles.map((a) => (
          <div
            key={a.id}
            className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
          >
            <div>
              {a.featured && (
                <span className="text-[.72rem] font-extrabold tracking-[.08em] uppercase text-gold-strong">
                  Онцлох
                </span>
              )}
              <b className="font-extrabold block">{a.title}</b>
              <span className="text-ink-3 font-semibold text-[.85rem]">
                {a.author} · {formatDate(a.createdAt)}
              </span>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/admin/articles/${a.id}/edit`}
                className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-3.5 py-2 rounded-full"
              >
                Засах
              </Link>
              <button
                type="button"
                disabled={busyId === a.id}
                onClick={() => removeArticle(a.id)}
                className="text-[.82rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-3.5 py-2 rounded-full disabled:opacity-50"
              >
                Устгах
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
