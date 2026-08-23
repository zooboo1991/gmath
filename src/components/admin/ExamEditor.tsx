"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import MathText from "@/components/assessment/MathText";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { apiError, readJson } from "@/lib/fetchJson";
import { PROBLEM_CATEGORIES, type Problem, type ProblemCategory } from "@/lib/assessment/types";
import type { ExamDetail } from "@/lib/assessment/exams";

/**
 * Composing one exam: its name and price, the problems on it, and the children
 * who sit it for free.
 *
 * Everything is saved with one button rather than field by field. An exam is
 * read as a whole by the children who sit it, and a half-saved one — problems
 * chosen but the price still wrong — is exactly what should not be possible to
 * publish by accident.
 */
export default function ExamEditor({
  exam,
  bank,
  courses,
}: {
  exam: ExamDetail;
  bank: Problem[];
  /** Everything a student can be registered on — courses and yearly programmes. */
  courses: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(exam.title);
  const [category, setCategory] = useState<ProblemCategory>(exam.category);
  const [fee, setFee] = useState(exam.fee);
  const [status, setStatus] = useState(exam.status);
  const [chosen, setChosen] = useState<string[]>(exam.problems.map((p) => p.id));
  const [freeCourses, setFreeCourses] = useState<string[]>(exam.freeCourses.map((c) => c.programId));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Problems already on the exam stay listed even if they are not in the live
  // bank any more (archived after the exam was built).
  const byId = useMemo(() => {
    const map = new Map<string, Problem>();
    for (const p of [...bank, ...exam.problems]) map.set(p.id, p);
    return map;
  }, [bank, exam.problems]);

  const available = useMemo(
    () => bank.filter((p) => p.category === category || chosen.includes(p.id)),
    [bank, category, chosen]
  );

  const toggleProblem = (id: string) =>
    setChosen((current) => (current.includes(id) ? current.filter((p) => p !== id) : [...current, id]));

  const move = (id: string, delta: number) =>
    setChosen((current) => {
      const index = current.indexOf(id);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });

  const toggleFreeCourse = (id: string) =>
    setFreeCourses((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]));

  const save = async (nextStatus = status) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/exams/${exam.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          fee,
          status: nextStatus,
          problemIds: chosen,
          freeCourseIds: freeCourses,
        }),
      });
      const json = await readJson<{ exam: ExamDetail }>(res);
      if (!res.ok) {
        setError(apiError(res, json, "Хадгалахад алдаа гарлаа"));
        return;
      }
      setStatus(nextStatus);
      setSaved(true);
      router.refresh();
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("Энэ шалгалтыг устгах уу?")) return;
    const res = await fetch(`/api/admin/exams/${exam.id}`, { method: "DELETE" });
    const json = await readJson<Record<string, unknown>>(res);
    if (!res.ok) {
      setError(apiError(res, json, "Устгахад алдаа гарлаа"));
      return;
    }
    router.push("/admin/exams");
  };

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1100px]">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <Link href="/admin/exams" className="font-extrabold text-[.9rem] text-blue-strong">
          ← Шалгалтууд
        </Link>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href={`/admin/exams/${exam.id}/preview`}
            className="font-extrabold text-[.88rem] text-ink-2 bg-bg-soft px-4 py-2.5 rounded-full"
          >
            Шалгалт харах
          </Link>
          {status !== "open" ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => save("open")}
              className="font-extrabold text-[.88rem] text-white bg-green px-5 py-2.5 rounded-full disabled:opacity-50"
            >
              Нээх
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => save("closed")}
              className="font-extrabold text-[.88rem] text-ink-2 bg-bg-soft px-5 py-2.5 rounded-full disabled:opacity-50"
            >
              Хаах
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => save()}
            className="font-extrabold text-[.88rem] text-white bg-blue shadow-blue px-5 py-2.5 rounded-full disabled:opacity-50"
          >
            {saving ? "Хадгалж байна…" : "Хадгалах"}
          </button>
        </div>
      </div>

      {error && (
        <p className="bg-[oklch(0.97_0.03_25)] text-red-soft font-semibold text-[.9rem] rounded-md px-4 py-3 mb-4">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="text-green font-extrabold text-[.9rem] mb-4">✓ Хадгаллаа</p>
      )}

      <div className="card-flat px-[22px] py-[20px] mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_160px] gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Нэр</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLASS} />
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
        </div>
        <p className="text-[.82rem] text-ink-3 font-semibold mt-2.5">
          Төлөв: <b className="text-ink-2">{status === "open" ? "Нээлттэй" : status === "draft" ? "Ноорог" : "Хаасан"}</b>
          {status === "open" && " — энэ ангиллын сурагчид одоо орж байна."}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card-flat px-[22px] py-[20px]">
          <b className="text-[1.02rem] font-extrabold block mb-1">
            Шалгалтын бодлогууд ({chosen.length})
          </b>
          <p className="text-[.84rem] text-ink-3 font-semibold mb-3">
            Сурагч эдгээрийг энэ дарааллаар нэг нэгээр нь харна.
          </p>
          {chosen.length === 0 ? (
            <p className="text-ink-3 font-semibold text-[.88rem] py-6 text-center">
              Баруун талаас бодлогоо сонгоно уу.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {chosen.map((id, index) => {
                const problem = byId.get(id);
                return (
                  <li
                    key={id}
                    className="flex items-start gap-2.5 border border-line rounded-sm px-3 py-2.5"
                  >
                    <span className="text-[.78rem] font-extrabold text-blue-strong bg-blue-soft w-6 h-6 rounded-full grid place-items-center shrink-0">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <b className="text-[.88rem] font-extrabold block truncate">
                        {problem?.topic || "(сэдэвгүй)"}
                      </b>
                      {problem?.bodyLatex && (
                        <span className="text-[.8rem] text-ink-3 font-medium line-clamp-1 block">
                          {problem.bodyLatex}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => move(id, -1)}
                        aria-label="Дээш"
                        className="w-7 h-7 rounded-full bg-bg-soft text-ink-2 grid place-items-center"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(id, 1)}
                        aria-label="Доош"
                        className="w-7 h-7 rounded-full bg-bg-soft text-ink-2 grid place-items-center"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleProblem(id)}
                        aria-label="Хасах"
                        className="w-7 h-7 rounded-full bg-bg-soft text-ink-3 hover:text-red-soft grid place-items-center"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="card-flat px-[22px] py-[20px]">
          <b className="text-[1.02rem] font-extrabold block mb-1">{category} ангиллын бодлогын сан</b>
          <p className="text-[.84rem] text-ink-3 font-semibold mb-3">
            {available.length === 0
              ? "Энэ ангилалд идэвхтэй бодлого алга байна."
              : "Дарж нэмнэ."}
          </p>
          <div className="max-h-[420px] overflow-y-auto flex flex-col gap-2">
            {available.map((p) => {
              const picked = chosen.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProblem(p.id)}
                  className={`text-left border rounded-sm px-3 py-2.5 transition-colors ${
                    picked ? "border-blue bg-blue-soft/40" : "border-line hover:border-blue-soft-2"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-[.88rem] font-extrabold truncate">{p.topic || "(сэдэвгүй)"}</b>
                    <span className="text-[.78rem] font-extrabold text-blue-strong shrink-0">
                      {picked ? "Сонгосон ✓" : "Нэмэх +"}
                    </span>
                  </div>
                  {p.bodyLatex && (
                    <div className="text-[.82rem] text-ink-2 mt-1 line-clamp-2">
                      <MathText source={p.bodyLatex} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card-flat px-[22px] py-[20px] mt-5">
        <b className="text-[1.02rem] font-extrabold block mb-1">
          Үнэгүй хамрагдах сургалтууд ({freeCourses.length})
        </b>
        <p className="text-[.84rem] text-ink-3 font-semibold mb-3">
          Сонгосон сургалтад <b className="text-ink-2">идэвхтэй бүртгэлтэй</b> бүх сурагч энэ
          шалгалтыг үнэгүй өгнө — маргааш нэгдсэн сурагч ч мөн адил. Бусад нь {fee} төлнө.
          Түвшин тогтоох хаалттай байсан ч эдгээр сурагчид орж чадна.
        </p>
        <div className="max-h-[280px] overflow-y-auto flex flex-col gap-1.5">
          {courses.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2.5 px-3 py-2 border border-line rounded-sm hover:bg-bg-soft cursor-pointer"
            >
              <input
                type="checkbox"
                checked={freeCourses.includes(c.id)}
                onChange={() => toggleFreeCourse(c.id)}
              />
              <span className="text-[.88rem] font-semibold">{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={remove}
        className="text-[.85rem] font-bold text-ink-3 hover:text-red-soft mt-6"
      >
        Шалгалтыг устгах
      </button>
    </div>
  );
}
