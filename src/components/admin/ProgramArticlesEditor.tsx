"use client";

import { useMemo, useState } from "react";
import { IconClose } from "@/components/icons";
import { INPUT_CLASS } from "@/components/admin/panels/shared";

export type ArticleOption = { id: string; title: string; createdAt: string };

/**
 * Picks which articles sit beside a course on its public page.
 *
 * A plain multi-select was the first idea and the wrong one: it neither shows
 * the chosen order nor survives an article list that keeps growing. So this is
 * a search box that adds, and an ordered list that removes — the order is the
 * order they appear on the site, which is the only ordering the teacher cares
 * about.
 *
 * Holds the selection in the parent's form state (`value`/`onChange`) so it
 * saves with the rest of the course, in one request.
 */
export default function ProgramArticlesEditor({
  articles,
  value,
  onChange,
}: {
  articles: ArticleOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");

  const byId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);
  const chosen = value.map((id) => byId.get(id)).filter((a): a is ArticleOption => a !== undefined);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return articles
      .filter((a) => !value.includes(a.id) && a.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [search, articles, value]);

  const add = (id: string) => {
    onChange([...value, id]);
    setSearch("");
  };

  const move = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Нийтлэлийн гарчгаар хайж нэмэх"
          className={INPUT_CLASS}
        />
        {matches.length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-surface border border-line rounded-md shadow-md py-1.5 z-20">
            {matches.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => add(a.id)}
                className="block w-full text-left font-bold text-[.88rem] text-ink px-3.5 py-2 hover:bg-blue-soft"
              >
                {a.title}
              </button>
            ))}
          </div>
        )}
        {search.trim() && matches.length === 0 && (
          <p className="text-ink-3 font-semibold text-[.82rem] mt-1.5">Тохирох нийтлэл олдсонгүй.</p>
        )}
      </div>

      {chosen.length === 0 ? (
        <p className="text-ink-3 font-semibold text-[.85rem]">
          Нийтлэл холбоогүй байна. Холбосон нийтлэл сургалтын хуудасны доод хэсэгт харагдана.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {chosen.map((a, i) => (
            <li
              key={a.id}
              className="flex items-center gap-2.5 bg-surface-2 border border-line rounded-md px-3 py-2.5"
            >
              <span className="w-6 h-6 rounded-full bg-blue-soft text-blue-strong font-extrabold text-[.75rem] grid place-items-center shrink-0">
                {i + 1}
              </span>
              <span className="flex-1 min-w-0 font-bold text-[.88rem] text-ink truncate">{a.title}</span>
              <span className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Дээш"
                  className="w-7 h-7 rounded-xs text-ink-2 hover:bg-blue-soft disabled:opacity-30 font-extrabold"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === chosen.length - 1}
                  aria-label="Доош"
                  className="w-7 h-7 rounded-xs text-ink-2 hover:bg-blue-soft disabled:opacity-30 font-extrabold"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((id) => id !== a.id))}
                  aria-label="Хасах"
                  className="w-7 h-7 rounded-xs text-red-soft hover:bg-red-soft/12 grid place-items-center"
                >
                  <IconClose className="w-3.5 h-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
