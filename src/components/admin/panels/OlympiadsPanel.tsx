"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { apiError, readJson } from "@/lib/fetchJson";
import type { MiniOlympiad } from "@/lib/miniOlympiad/db";

type Program = { id: string; label: string };

const dot = (d: string) => d.replace(/-/g, ".");

export default function OlympiadsPanel({
  olympiads,
  programs,
  canEdit,
}: {
  olympiads: MiniOlympiad[];
  programs: Program[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [heldOn, setHeldOn] = useState("");
  const [problemCount, setProblemCount] = useState("10");
  const [maxPerProblem, setMaxPerProblem] = useState("7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labelOf = (id: string) => programs.find((p) => p.id === id)?.label ?? id;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/olympiads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          programId,
          heldOn,
          problemCount: Number(problemCount),
          maxPerProblem: Number(maxPerProblem),
        }),
      });
      const json = await readJson<{ olympiad: MiniOlympiad }>(res);
      if (!res.ok || !json.olympiad) {
        setError(apiError(res, json, "Үүсгэхэд алдаа гарлаа"));
        return;
      }
      router.push(`/admin/olympiads/${json.olympiad.id}`);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <form onSubmit={create} className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex flex-col gap-3">
          <b className="font-extrabold text-[1rem]">Шинэ олимпиад</b>
          <div className="grid grid-cols-1 nav:grid-cols-5 gap-3">
            <input
              className={`${INPUT_CLASS} nav:col-span-2`}
              placeholder="Нэр, жишээ нь «Мини олимпиад 1»"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
            />
            <select className={INPUT_CLASS} value={programId} onChange={(e) => setProgramId(e.target.value)}>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <input type="date" required className={INPUT_CLASS} value={heldOn} onChange={(e) => setHeldOn(e.target.value)} aria-label="Огноо" />
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="block text-[.72rem] font-extrabold text-ink-3">Бодлого</span>
                <input type="number" min={1} max={30} className={INPUT_CLASS} value={problemCount} onChange={(e) => setProblemCount(e.target.value)} />
              </label>
              <label className="flex-1">
                <span className="block text-[.72rem] font-extrabold text-ink-3">Дээд оноо</span>
                <input type="number" min={1} max={100} className={INPUT_CLASS} value={maxPerProblem} onChange={(e) => setMaxPerProblem(e.target.value)} />
              </label>
            </div>
          </div>
          {error && <p className="text-red-soft font-bold text-[.85rem]">{error}</p>}
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="self-start font-extrabold text-[.85rem] text-white bg-blue rounded-full px-5 py-2.5 disabled:opacity-50"
          >
            {busy ? "Үүсгэж байна…" : "Үүсгэх"}
          </button>
        </form>
      )}

      {olympiads.length === 0 ? (
        <p className="text-ink-3 font-semibold text-center py-10 bg-surface border border-line rounded-md">
          Одоогоор мини олимпиад алга.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {olympiads.map((o) => (
            <Link
              key={o.id}
              href={`/admin/olympiads/${o.id}`}
              className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 flex items-center justify-between gap-3 flex-wrap hover:border-blue transition-colors"
            >
              <div>
                <b className="font-extrabold text-[1rem] block">{o.title}</b>
                <span className="text-ink-3 font-semibold text-[.85rem]">
                  {labelOf(o.programId)} · {dot(o.heldOn)} · {o.problemCount} бодлого × {o.maxPerProblem} оноо
                </span>
              </div>
              <span
                className={`inline-flex items-center text-[.78rem] font-extrabold px-3 py-1.5 rounded-full ${
                  o.publishedAt ? "text-green bg-green-soft" : "text-gold-strong bg-gold-soft"
                }`}
              >
                {o.publishedAt ? "Нийтлэгдсэн" : "Ноорог"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
