"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { apiError, readJson } from "@/lib/fetchJson";
import { PROBLEM_CATEGORIES, type ProblemCategory } from "@/lib/assessment/types";
import type { Exam } from "@/lib/assessment/exams";

type ExamRow = Exam & { problemCount: number; freeCount: number };

const STATUS_LABEL: Record<Exam["status"], string> = {
  draft: "Ноорог",
  open: "Нээлттэй",
  closed: "Хаасан",
};

const STATUS_CLASS: Record<Exam["status"], string> = {
  draft: "text-ink-3 bg-bg-soft",
  open: "text-green bg-green-soft",
  closed: "text-ink-3 bg-surface-2",
};

/**
 * The exams the teacher has composed.
 *
 * An exam starts as a draft with nothing in it, which is why creating one is a
 * name and a category and nothing else: the problems and the free list are
 * chosen on the exam's own page, where there is room to see them.
 */
export default function ExamsPanel({ initialExams }: { initialExams: ExamRow[] }) {
  const router = useRouter();
  const [exams] = useState(initialExams);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ProblemCategory>("C");
  const [fee, setFee] = useState("20,000₮");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!title.trim()) {
      setError("Нэрээ бичнэ үү");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), category, fee }),
      });
      const json = await readJson<{ exam: { id: string } }>(res);
      if (!res.ok || !json.exam) {
        setError(apiError(res, json, "Үүсгэхэд алдаа гарлаа"));
        return;
      }
      // Straight into the editor: an exam with no problems is not finished.
      router.push(`/admin/exams/${json.exam.id}`);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-6 lg:px-10 py-8">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-[1.4rem] font-extrabold tracking-[-.02em]">Шалгалтууд</h1>
          <p className="text-ink-3 font-semibold text-[.88rem] mt-1">
            Түвшин тогтоох шалгалт бүр өөрийн бодлого, төлбөр, үнэгүй хамрагдах сурагчидтай.
          </p>
        </div>
        <Link href="/admin/assessment" className="font-extrabold text-[.9rem] text-blue-strong">
          ← Үнэлгээ рүү
        </Link>
      </div>

      <div className="card-flat px-[22px] py-[20px] mb-6">
        <b className="text-[1.02rem] font-extrabold block mb-3">Шинэ шалгалт</b>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_160px_auto] gap-2.5 items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Нэр</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ж: 2026 оны 9 сарын түвшин тогтоох"
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Ангилал</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ProblemCategory)}
              className={INPUT_CLASS}
            >
              {PROBLEM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c} ангилал ({c === "C" ? "5-6" : "7-8"} анги)
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Төлбөр</span>
            <input value={fee} onChange={(e) => setFee(e.target.value)} className={INPUT_CLASS} />
          </label>
          <button
            type="button"
            disabled={creating}
            onClick={create}
            className="font-extrabold rounded-full bg-blue text-white shadow-blue px-6 py-3 text-[.9rem] disabled:opacity-50"
          >
            {creating ? "…" : "Үүсгэх"}
          </button>
        </div>
        {error && <p className="text-[.85rem] font-bold text-red-soft mt-2">{error}</p>}
      </div>

      {exams.length === 0 ? (
        <p className="text-ink-3 font-semibold text-[.9rem] text-center py-12">
          Одоогоор шалгалт алга. Дээрээс үүсгэнэ үү.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {exams.map((exam) => (
            <Link
              key={exam.id}
              href={`/admin/exams/${exam.id}`}
              className="bg-surface border border-line rounded-md shadow-xs px-6 py-5 flex items-center justify-between gap-4 flex-wrap hover:border-blue-soft-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[.72rem] font-extrabold px-2.5 py-1 rounded-full ${STATUS_CLASS[exam.status]}`}
                  >
                    {STATUS_LABEL[exam.status]}
                  </span>
                  <span className="text-[.72rem] font-extrabold text-gold-strong bg-gold-soft px-2.5 py-1 rounded-full">
                    {exam.category} ангилал
                  </span>
                </div>
                <b className="font-extrabold text-[1.05rem] block mt-1.5">{exam.title}</b>
                <span className="text-ink-3 font-semibold text-[.85rem]">
                  {exam.problemCount} бодлого · {exam.fee}
                  {exam.freeCount > 0 && ` · ${exam.freeCount} үнэгүй сурагч`}
                </span>
              </div>
              <span className="text-[.85rem] font-extrabold text-blue-strong shrink-0">Нээх →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
