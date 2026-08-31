"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/dateFormat";
import type { ContractTemplate } from "@/lib/contracts/db";

/**
 * Гэрээний загваруудын жагсаалт.
 *
 * Гэрээ бүр Word файл дээр суурилна: эзэн файлаа байршуулж, доторх тагуудыг
 * системийн талбартай холбоод, аль сургалтад хамаарахыг заана.
 */
export default function ContractsPanel({ templates }: { templates: ContractTemplate[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Үүсгэж чадсангүй");
        return;
      }
      router.push(`/admin/contracts/${json.template.id}`);
    } catch {
      setError("Сүлжээний алдаа");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-[1.5rem] font-extrabold">Гэрээ</h1>
          <p className="text-ink-3 font-semibold text-[.88rem] mt-1 max-w-[62ch] leading-[1.6]">
            Word дээр бичсэн гэрээгээ байршуулаад доторх тагуудыг системийн талбартай холбоно. Дараа
            нь сурагч бүрийн гэрээг бөглөсөн хэлбэрээр нь татаж авна.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Шинэ гэрээний нэр"
            className="h-11 w-[240px] rounded-md border border-line px-3.5 font-semibold text-[.9rem] bg-surface"
          />
          <button
            type="button"
            onClick={create}
            disabled={creating || !title.trim()}
            className="h-11 px-5 rounded-md bg-navy text-white font-extrabold text-[.88rem] disabled:opacity-50"
          >
            {creating ? "Үүсгэж байна…" : "Нэмэх"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-red-soft font-bold text-[.88rem] mb-4">{error}</p>
      )}

      {templates.length === 0 ? (
        <div className="bg-surface border border-line rounded-md px-6 py-12 text-center">
          <b className="block font-extrabold text-[1.05rem]">Гэрээний загвар алга байна</b>
          <p className="text-ink-2 font-medium text-[.9rem] mt-1.5 max-w-[52ch] mx-auto leading-[1.6]">
            Дээрх талбарт нэр өгөөд «Нэмэх» дарна уу. Дараагийн алхамд Word файлаа байршуулна.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-md overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-bg-soft text-ink-3 text-[.72rem] font-extrabold uppercase tracking-[.04em]">
              <tr>
                <th className="px-4 py-3">Нэр</th>
                <th className="px-4 py-3">Файл</th>
                <th className="px-4 py-3">Таг</th>
                <th className="px-4 py-3">Сургалт</th>
                <th className="px-4 py-3">Төлөв</th>
                <th className="px-4 py-3">Үүсгэсэн</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {templates.map((t) => {
                const mapped = t.tags.filter((tag) => tag.field).length;
                return (
                  <tr key={t.id} className="hover:bg-bg-soft">
                    <td className="px-4 py-3">
                      <Link href={`/admin/contracts/${t.id}`} className="font-extrabold text-[.92rem] text-blue-strong">
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[.85rem] font-semibold text-ink-2">
                      {t.fileName ?? <span className="text-ink-3">— байхгүй</span>}
                    </td>
                    <td className="px-4 py-3 text-[.85rem] font-semibold text-ink-2">
                      {t.tags.length === 0 ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        `${mapped}/${t.tags.length} холбогдсон`
                      )}
                    </td>
                    <td className="px-4 py-3 text-[.85rem] font-semibold text-ink-2">
                      {t.programIds.length || <span className="text-ink-3">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-[.85rem] font-semibold text-ink-3">
                      {formatDate(t.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function StatusBadge({ status }: { status: "draft" | "active" }) {
  return status === "active" ? (
    <span className="inline-flex items-center text-[.75rem] font-extrabold text-green bg-green-soft px-2.5 py-1 rounded-full">
      Идэвхтэй
    </span>
  ) : (
    <span className="inline-flex items-center text-[.75rem] font-extrabold text-ink-3 bg-bg-soft px-2.5 py-1 rounded-full">
      Ноорог
    </span>
  );
}
