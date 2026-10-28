"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import MathText from "@/components/assessment/MathText";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { apiError, readJson } from "@/lib/fetchJson";
import type { Problem } from "@/lib/assessment/types";
import type { ExamDetail } from "@/lib/assessment/exams";
import type { SubmissionState, TaskSubmission } from "@/lib/courseTasks";

/**
 * One homework/test paper of a course: its name, the window it is open in
 * (Ulaanbaatar time), the problems on it in order, and whether it is open.
 * Saved as a whole, like an exam — a half-saved paper is what must not be
 * possible to open by accident.
 */

/** What the page needs of a problem — never its answer key. */
export type ShownProblem = Pick<Problem, "id" | "topic" | "bodyLatex" | "category">;

/** ISO instant → "2026-10-20T09:00" in Ulaanbaatar time, for <input type="datetime-local">. */
const toLocalInput = (iso?: string) => (iso ? new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 16) : "");
/** And back: the typed time is Ulaanbaatar's whatever the admin's device thinks. */
const fromLocalInput = (value: string) => (value ? new Date(`${value}:00+08:00`).toISOString() : "");

export default function CourseTaskEditor({
  task,
  bank,
  courseHref,
  courseTitle,
  canEdit,
  submissions,
  windowOver,
  canGrade,
}: {
  task: Omit<ExamDetail, "problems"> & { problems: ShownProblem[] };
  bank: ShownProblem[];
  courseHref: string;
  courseTitle: string;
  canEdit: boolean;
  /** Each of the course's children against this paper; null when it could not be loaded. */
  submissions: TaskSubmission[] | null;
  /** The paper's window has shut: a sitting not handed in by now never will be. */
  windowOver: boolean;
  /** May open a sitting in the grading queue. */
  canGrade: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [opensAt, setOpensAt] = useState(toLocalInput(task.opensAt));
  const [closesAt, setClosesAt] = useState(toLocalInput(task.closesAt));
  const [status, setStatus] = useState(task.status);
  const [chosen, setChosen] = useState<string[]>(task.problems.map((p) => p.id));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kindLabel = task.kind === "test" ? "Сорил" : "Даалгавар";

  // Problems already on the paper stay listed even if archived since.
  const byId = useMemo(() => {
    const map = new Map<string, ShownProblem>();
    for (const p of [...bank, ...task.problems]) map.set(p.id, p);
    return map;
  }, [bank, task.problems]);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bank
      .filter((p) => !chosen.includes(p.id))
      .filter((p) => !q || `${p.topic} ${p.bodyLatex ?? ""} ${p.category ?? ""}`.toLowerCase().includes(q))
      .slice(0, 60);
  }, [bank, chosen, query]);

  const move = (id: string, delta: number) =>
    setChosen((current) => {
      const i = current.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= current.length) return current;
      const copy = [...current];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const save = async (nextStatus = status) => {
    if (!opensAt || !closesAt) {
      setError("Нээгдэх, хаагдах цагаа бөглөнө үү");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/course-tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          opensAt: fromLocalInput(opensAt),
          closesAt: fromLocalInput(closesAt),
          status: nextStatus,
          problemIds: chosen,
        }),
      });
      const json = await readJson<Record<string, unknown>>(res);
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

  // Only a paper no child has started can go: it is a mistake, not a record.
  const remove = async () => {
    if (!window.confirm(`«${task.title}»-г устгах уу? Буцаах боломжгүй.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/course-tasks/${task.id}`, { method: "DELETE" });
      const json = await readJson<Record<string, unknown>>(res);
      if (!res.ok) {
        setError(apiError(res, json, "Устгахад алдаа гарлаа"));
        return;
      }
      router.push(courseHref);
      router.refresh();
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1100px]">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <Link href={courseHref} className="font-extrabold text-[.9rem] text-blue-strong">
          {`← ${courseTitle}`}
        </Link>
        {canEdit && (
          <div className="flex items-center gap-2.5 flex-wrap">
            {status !== "open" ? (
              <button
                type="button"
                disabled={saving || chosen.length === 0}
                onClick={() => save("open")}
                className="font-extrabold text-[.88rem] text-white bg-green px-5 py-2.5 rounded-full disabled:opacity-50"
                title={chosen.length === 0 ? "Эхлээд бодлого сонгоно уу" : undefined}
              >
                Нээх
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => save("draft")}
                className="font-extrabold text-[.88rem] text-ink-2 bg-bg-soft px-5 py-2.5 rounded-full disabled:opacity-50"
              >
                Нооргоор болгох
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => save()}
              className="font-extrabold text-[.88rem] text-white bg-blue px-5 py-2.5 rounded-full disabled:opacity-50"
            >
              {saving ? "Хадгалж байна…" : "Хадгалах"}
            </button>
          </div>
        )}
      </div>

      <span
        className={`text-[.78rem] font-extrabold uppercase tracking-[.06em] px-2.5 py-1 rounded-full ${
          task.kind === "test" ? "text-gold-strong bg-gold-soft" : "text-blue-strong bg-blue-soft"
        }`}
      >
        {kindLabel}
      </span>
      <span className={`ml-2 text-[.78rem] font-extrabold px-2.5 py-1 rounded-full ${status === "open" ? "text-green bg-green-soft" : "text-gold-strong bg-gold-soft"}`}>
        {status === "open"
          ? "Нээлттэй — сурагчид цагтаа эхлүүлнэ"
          : status === "closed"
            ? "Хаагдсан — сурагчид эхлүүлэх боломжгүй"
            : "Ноорог — сурагчид эхлүүлэх боломжгүй"}
      </span>

      {error && <p className="text-red-soft font-bold text-[.9rem] mt-4">{error}</p>}
      {saved && <p className="text-green font-bold text-[.9rem] mt-4">Хадгалагдлаа.</p>}

      <div className="grid grid-cols-1 nav:grid-cols-[1fr_200px_200px] gap-3 mt-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[.78rem] font-extrabold text-ink-3">Нэр</span>
          <input className={INPUT_CLASS} value={title} disabled={!canEdit} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[.78rem] font-extrabold text-ink-3">Нээгдэх (УБ цаг)</span>
          <input type="datetime-local" className={INPUT_CLASS} value={opensAt} disabled={!canEdit} onChange={(e) => setOpensAt(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[.78rem] font-extrabold text-ink-3">Хаагдах (УБ цаг)</span>
          <input type="datetime-local" className={INPUT_CLASS} value={closesAt} disabled={!canEdit} onChange={(e) => setClosesAt(e.target.value)} />
        </label>
      </div>

      <Submissions submissions={submissions} over={windowOver} canGrade={canGrade} />

      <div className="grid grid-cols-1 nav:grid-cols-2 gap-6 mt-8">
        <div>
          <h2 className="text-[1.05rem] font-extrabold mb-3">{`Сонгосон бодлого (${chosen.length})`}</h2>
          {chosen.length === 0 ? (
            <p className="text-ink-3 font-semibold text-[.9rem]">Баруун талаас бодлого нэмнэ үү.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {chosen.map((id, i) => {
                const p = byId.get(id);
                return (
                  <li key={id} className="bg-surface border border-line rounded-md px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-[.9rem] font-extrabold">{`${i + 1}. ${p?.topic || "(сэдэвгүй)"}`}</b>
                      {canEdit && (
                        <span className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => move(id, -1)} className="px-2 py-1 text-ink-3 font-extrabold" aria-label="Дээш">↑</button>
                          <button type="button" onClick={() => move(id, 1)} className="px-2 py-1 text-ink-3 font-extrabold" aria-label="Доош">↓</button>
                          <button
                            type="button"
                            onClick={() => setChosen((c) => c.filter((x) => x !== id))}
                            className="px-2 py-1 text-red-soft font-extrabold"
                          >
                            Хасах
                          </button>
                        </span>
                      )}
                    </div>
                    {p?.bodyLatex && (
                      <div className="text-[.88rem] text-ink-2 mt-1.5 line-clamp-3">
                        <MathText source={p.bodyLatex} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {canEdit && (
          <div>
            <h2 className="text-[1.05rem] font-extrabold mb-3">Бодлогын сан</h2>
            <input
              className={`${INPUT_CLASS} mb-3`}
              placeholder="Сэдэв эсвэл бичвэрээр хайх…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex flex-col gap-2 max-h-[640px] overflow-y-auto pr-1">
              {found.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setChosen((c) => [...c, p.id])}
                  className="text-left bg-surface border border-line rounded-md px-3.5 py-3 hover:border-blue"
                >
                  <span className="flex items-center justify-between gap-2">
                    <b className="text-[.88rem] font-extrabold truncate">{p.topic || "(сэдэвгүй)"}</b>
                    <span className="text-[.75rem] font-bold text-ink-3 shrink-0">
                      {p.category ? `${p.category} ангилал` : ""} + Нэмэх
                    </span>
                  </span>
                  {p.bodyLatex && (
                    <span className="block text-[.85rem] text-ink-2 mt-1 line-clamp-2">
                      <MathText source={p.bodyLatex} />
                    </span>
                  )}
                </button>
              ))}
              {found.length === 0 && <p className="text-ink-3 font-semibold text-[.9rem]">Тохирох бодлого алга.</p>}
            </div>
          </div>
        )}
      </div>

      {canEdit && (
        <div className="mt-10 pt-6 border-t border-line">
          <button
            type="button"
            disabled={saving}
            onClick={remove}
            className="font-extrabold text-[.85rem] text-red-soft disabled:opacity-50"
          >
            {`${kindLabel} устгах`}
          </button>
          <p className="text-ink-3 font-semibold text-[.82rem] mt-1">Сурагч эхлүүлээгүй бол л устгана.</p>
        </div>
      )}
    </div>
  );
}

const STATE: Record<SubmissionState, { text: string; tone: string }> = {
  graded: { text: "Шалгасан", tone: "text-green bg-green-soft" },
  grading: { text: "Шалгаж байна", tone: "text-blue-strong bg-blue-soft" },
  submitted: { text: "Илгээсэн", tone: "text-blue-strong bg-blue-soft" },
  started: { text: "Эхлүүлсэн", tone: "text-gold-strong bg-gold-soft" },
  not_started: { text: "Эхлүүлээгүй", tone: "text-ink-3 bg-bg-soft" },
};

/**
 * Who has handed this paper in. A child who started but never pressed
 * «Илгээх» is told apart from one who never opened it — once the window has
 * shut, that is work the teacher may want to chase.
 */
function Submissions({
  submissions,
  over,
  canGrade,
}: {
  submissions: TaskSubmission[] | null;
  over: boolean;
  canGrade: boolean;
}) {
  if (submissions === null) {
    return <p className="text-red-soft font-bold text-[.9rem] mt-8">Илгээлтийн мэдээллийг ачаалж чадсангүй.</p>;
  }
  const real = submissions.filter((s) => !s.isTest);
  const handedIn = real.filter((s) => s.state === "submitted" || s.state === "grading" || s.state === "graded").length;
  return (
    <div className="mt-8">
      <h2 className="text-[1.05rem] font-extrabold mb-1">{`Илгээлт (${handedIn} / ${real.length})`}</h2>
      <p className="text-ink-3 font-semibold text-[.85rem] mb-3">
        Бодолтоо «Илгээх» дарж илгээсэн хүүхэд л шалгах дараалалд орно.
      </p>
      {submissions.length === 0 ? (
        <p className="text-ink-3 font-semibold text-[.9rem]">Сургалтад идэвхтэй бүртгэлтэй хүүхэд алга.</p>
      ) : (
        <div className="bg-surface border border-line rounded-md divide-y divide-line">
          {submissions.map((s) => {
            const st = s.state === "started" && over ? { text: "Илгээгээгүй", tone: "text-red-soft bg-red-soft/10" } : STATE[s.state];
            const linked = canGrade && s.assessmentId && s.state !== "started" && s.state !== "not_started";
            return (
              <div key={s.userId} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                <span className="font-extrabold text-[.9rem] min-w-0 flex-1">
                  {s.name}
                  {s.isTest && <span className="ml-1.5 text-[.75rem] font-bold text-ink-3">(тест)</span>}
                  {s.grade && <span className="ml-1.5 text-[.8rem] font-semibold text-ink-3">{s.grade}</span>}
                </span>
                {s.assessmentId && (
                  <span className="text-[.8rem] font-semibold text-ink-3">{`${s.photographed} бодлогын зураг`}</span>
                )}
                {s.total !== undefined && s.max !== undefined && (
                  <span className="text-[.85rem] font-extrabold tabular-nums">{`${s.total} / ${s.max}`}</span>
                )}
                <span className={`text-[.76rem] font-extrabold px-2.5 py-1 rounded-full ${st.tone}`}>{st.text}</span>
                {linked && (
                  <Link href={`/admin/grading/${s.assessmentId}`} className="text-[.82rem] font-extrabold text-blue-strong">
                    Шалгах →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
