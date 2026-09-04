"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import MathText from "@/components/assessment/MathText";
import { IconArrowLeft, IconCheckCircle, IconClock } from "@/components/icons";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { apiError, readJson } from "@/lib/fetchJson";
import type { PlacementProblem } from "@/lib/assessment/placementDb";

/**
 * Шаталсан түвшин тогтоолтын бодлогын сан.
 *
 * Бодлого бүр (анги, сэдэв, түвшин) гурвалд яг нэг байрлана. Хариултгүй
 * бодлого идэвхжихгүй — жагсаалт үүнийг шараар анхааруулж, засварын форм
 * хариултын талбараа тод байрлуулна.
 */
export default function PlacementProblemsPanel({
  initialProblems,
  initialFee,
  initialMinutes,
  initialOpenGrades,
}: {
  initialProblems: PlacementProblem[];
  initialFee: string;
  initialMinutes: number;
  initialOpenGrades: number[];
}) {
  const [problems, setProblems] = useState(initialProblems);
  const grades = useMemo(
    () => [...new Set(problems.map((p) => p.grade))].sort((a, b) => a - b),
    [problems]
  );
  const [grade, setGrade] = useState<number>(grades[0] ?? 6);
  const [editing, setEditing] = useState<PlacementProblem | "new" | null>(null);

  const shown = problems.filter((p) => p.grade === grade);
  const missingAnswers = shown.filter((p) => p.answers.length === 0).length;

  // Сэдвийн дарааллаар бүлэглэнэ: мөр бүр нэг сэдэв, багана нь 3 түвшин.
  const topicRows = useMemo(() => {
    const byOrder = new Map<number, { topic: string; levels: (PlacementProblem | undefined)[] }>();
    for (const p of shown) {
      const row = byOrder.get(p.topicOrder) ?? { topic: p.topic, levels: [undefined, undefined, undefined] };
      row.topic = p.topic;
      row.levels[p.level - 1] = p;
      byOrder.set(p.topicOrder, row);
    }
    return [...byOrder.entries()].sort((a, b) => a[0] - b[0]);
  }, [shown]);

  return (
    <>
      <Link
        href="/admin/assessment"
        className="inline-flex items-center gap-1.5 text-ink-3 font-bold text-[.85rem] hover:text-ink"
      >
        <IconArrowLeft className="w-4 h-4" /> Үнэлгээ
      </Link>

      <div className="flex items-end justify-between gap-4 flex-wrap mt-3 mb-5">
        <div>
          <h1 className="text-[1.5rem] font-extrabold">Шаталсан шалгалтын сан</h1>
          <p className="text-ink-3 font-semibold text-[.88rem] mt-1 max-w-[64ch] leading-[1.6]">
            Сэдэв бүр 2-р түвшнээс эхэлж, зөв бол 3, буруу бол 1 рүү шилжинэ. Хариултгүй бодлого
            сурагчид асуугдахгүй.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={grade}
            onChange={(e) => setGrade(Number(e.target.value))}
            className="h-11 rounded-md border border-line px-3 font-semibold text-[.9rem] bg-surface"
          >
            {(grades.length ? grades : [6]).map((g) => (
              <option key={g} value={g}>{`${g}-р анги`}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="h-11 px-5 rounded-md bg-navy text-white font-extrabold text-[.88rem]"
          >
            + Бодлого нэмэх
          </button>
        </div>
      </div>

      <PlacementSettings
        initialFee={initialFee}
        initialMinutes={initialMinutes}
        initialOpenGrades={initialOpenGrades}
        gradesWithProblems={grades}
      />

      {missingAnswers > 0 && (
        <p className="text-[.88rem] font-bold text-gold-strong bg-gold-soft rounded-sm px-4 py-3 mb-4 leading-[1.6]">
          {`${missingAnswers} бодлого хариултгүй байна — хариултаа оруулж идэвхжүүлсний дараа л шалгалтад орно.`}
        </p>
      )}

      {topicRows.length === 0 ? (
        <div className="bg-surface border border-line rounded-md px-6 py-12 text-center">
          <b className="block font-extrabold text-[1.05rem]">Энэ ангид бодлого алга байна</b>
          <p className="text-ink-2 font-medium text-[.9rem] mt-1.5">«Бодлого нэмэх» дарж эхэлнэ үү.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {topicRows.map(([order, row]) => (
            <div key={order} className="bg-surface border border-line rounded-md px-5 py-4">
              <b className="block font-extrabold text-[.95rem] mb-2.5">
                {order}. {row.topic}
              </b>
              <div className="grid sm:grid-cols-3 gap-2.5">
                {[1, 2, 3].map((level) => {
                  const problem = row.levels[level - 1];
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => problem && setEditing(problem)}
                      disabled={!problem}
                      className={`text-left rounded-sm border px-3.5 py-3 transition-colors ${
                        problem
                          ? "border-line hover:border-blue bg-bg-soft"
                          : "border-dashed border-line-2 text-ink-3"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[.72rem] font-extrabold uppercase tracking-[.04em] text-ink-3">
                          {`${level}-р түвшин`}
                        </span>
                        {problem &&
                          (problem.active ? (
                            <span className="inline-flex items-center gap-1 text-[.7rem] font-extrabold text-green">
                              <IconCheckCircle className="w-3 h-3" /> Идэвхтэй
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[.7rem] font-extrabold text-gold-strong">
                              <IconClock className="w-3 h-3" />
                              {problem.answers.length === 0 ? "Хариултгүй" : "Ноорог"}
                            </span>
                          ))}
                      </span>
                      {problem ? (
                        <span className="block text-[.82rem] leading-[1.5] line-clamp-3">
                          <MathText source={problem.bodyLatex} />
                        </span>
                      ) : (
                        <span className="text-[.82rem] font-semibold">Бодлого алга</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ProblemModal
          problem={editing === "new" ? null : editing}
          defaultGrade={grade}
          defaultTopicOrder={editing === "new" ? topicRows.length + 1 : undefined}
          onClose={() => setEditing(null)}
          onSaved={(saved, removedId) => {
            setProblems((ps) => {
              const without = ps.filter((p) => p.id !== (removedId ?? saved?.id));
              return saved ? [...without, saved] : without;
            });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function ProblemModal({
  problem,
  defaultGrade,
  defaultTopicOrder,
  onClose,
  onSaved,
}: {
  problem: PlacementProblem | null;
  defaultGrade: number;
  defaultTopicOrder?: number;
  onClose: () => void;
  onSaved: (saved: PlacementProblem | null, removedId?: string) => void;
}) {
  const [form, setForm] = useState({
    grade: problem?.grade ?? defaultGrade,
    topic: problem?.topic ?? "",
    topicOrder: problem?.topicOrder ?? defaultTopicOrder ?? 1,
    level: problem?.level ?? 2,
    bodyLatex: problem?.bodyLatex ?? "",
    answers: (problem?.answers ?? []).join("; "),
    active: problem?.active ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = {
      ...form,
      answers: form.answers.split(";").map((a) => a.trim()).filter(Boolean),
    };
    try {
      const res = await fetch(
        problem ? `/api/admin/placement-problems/${problem.id}` : "/api/admin/placement-problems",
        {
          method: problem ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = await readJson<{ problem?: PlacementProblem }>(res);
      if (!res.ok || !json.problem) {
        setError(apiError(res, json, "Хадгалж чадсангүй"));
        return;
      }
      onSaved(json.problem);
    } catch {
      setError("Сүлжээний алдаа");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!problem || !confirm("Энэ бодлогыг устгах уу?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/placement-problems/${problem.id}`, { method: "DELETE" });
      const json = await readJson(res);
      if (!res.ok) {
        setError(apiError(res, json, "Устгаж чадсангүй"));
        return;
      }
      onSaved(null, problem.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-navy-deep/55 grid place-items-center px-4 py-8 overflow-y-auto">
      <div className="bg-surface rounded-lg shadow-lg w-full max-w-[640px] px-6 py-6 max-h-full overflow-y-auto">
        <h3 className="text-[1.2rem] font-extrabold mb-4">
          {problem ? "Бодлого засах" : "Бодлого нэмэх"}
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
          <label className="block">
            <span className="block text-[.72rem] font-extrabold text-ink-3 uppercase mb-1">Анги</span>
            <input
              type="number"
              value={form.grade}
              onChange={(e) => setForm((f) => ({ ...f, grade: Number(e.target.value) }))}
              className={INPUT_CLASS}
            />
          </label>
          <label className="block">
            <span className="block text-[.72rem] font-extrabold text-ink-3 uppercase mb-1">Дараалал</span>
            <input
              type="number"
              value={form.topicOrder}
              onChange={(e) => setForm((f) => ({ ...f, topicOrder: Number(e.target.value) }))}
              className={INPUT_CLASS}
            />
          </label>
          <label className="block col-span-2">
            <span className="block text-[.72rem] font-extrabold text-ink-3 uppercase mb-1">Түвшин</span>
            <select
              value={form.level}
              onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))}
              className={INPUT_CLASS}
            >
              <option value={1}>1 — хөнгөн</option>
              <option value={2}>2 — эхлэх түвшин</option>
              <option value={3}>3 — гүнзгий</option>
            </select>
          </label>
        </div>

        <label className="block mb-3">
          <span className="block text-[.72rem] font-extrabold text-ink-3 uppercase mb-1">
            Сэдэв (radar дээр харагдана)
          </span>
          <input
            value={form.topic}
            onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
            className={INPUT_CLASS}
            placeholder="ХИЕХ, ХБЕХ"
          />
        </label>

        <label className="block mb-1.5">
          <span className="block text-[.72rem] font-extrabold text-ink-3 uppercase mb-1">
            Бодлогын эх (LaTeX-ийг $...$ дотор)
          </span>
          <textarea
            value={form.bodyLatex}
            onChange={(e) => setForm((f) => ({ ...f, bodyLatex: e.target.value }))}
            rows={3}
            className={`${INPUT_CLASS} min-h-[80px]`}
          />
        </label>
        {form.bodyLatex && (
          <div className="bg-bg-soft rounded-sm px-3.5 py-3 mb-3 text-[.92rem]">
            <MathText source={form.bodyLatex} />
          </div>
        )}

        <label className="block mb-3">
          <span className="block text-[.72rem] font-extrabold text-ink-3 uppercase mb-1">
            Зөв хариултууд (цэг таслалаар тусгаарлана: 13/20; 0.65)
          </span>
          <input
            value={form.answers}
            onChange={(e) => setForm((f) => ({ ...f, answers: e.target.value }))}
            className={INPUT_CLASS}
            placeholder="24"
          />
          <span className="block text-[.76rem] font-semibold text-ink-3 mt-1 leading-[1.5]">
            Бутархай ба аравтын бичлэгийг систем ижилд тооцно — 13/20 гэж оруулбал 0.65 ч зөв.
          </span>
        </label>

        <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            className="w-4 h-4"
          />
          <span className="font-bold text-[.9rem]">Идэвхтэй — сурагчид асуугдана</span>
        </label>

        {error && <p className="text-red-soft font-bold text-[.85rem] mb-3">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          {problem ? (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="h-11 px-4 rounded-md border border-line font-extrabold text-[.85rem] text-red-soft disabled:opacity-50"
            >
              Устгах
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-md border border-line font-extrabold text-[.85rem]"
            >
              Болих
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="h-11 px-5 rounded-md bg-navy text-white font-extrabold text-[.88rem] disabled:opacity-50"
            >
              {busy ? "Хадгалж байна…" : "Хадгалах"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Үнэ, хугацаа, нээлттэй ангиуд. Ангийг нээхэд тэр ангийн шалгалт сурагчдад
 * шууд харагдана — тиймээс сан нь бэлэн эсэхийг хажууд нь сануулна.
 */
function PlacementSettings({
  initialFee,
  initialMinutes,
  initialOpenGrades,
  gradesWithProblems,
}: {
  initialFee: string;
  initialMinutes: number;
  initialOpenGrades: number[];
  gradesWithProblems: number[];
}) {
  const [fee, setFee] = useState(initialFee);
  const [minutes, setMinutes] = useState(String(initialMinutes));
  const [openGrades, setOpenGrades] = useState<number[]>(initialOpenGrades);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const put = async (key: string, value: string) => {
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const json = await readJson(res);
      if (!res.ok) setError(apiError(res, json, "Хадгалж чадсангүй"));
    } catch {
      setError("Сүлжээний алдаа");
    } finally {
      setBusyKey(null);
    }
  };

  const toggleGrade = async (grade: number) => {
    const next = openGrades.includes(grade)
      ? openGrades.filter((g) => g !== grade)
      : [...openGrades, grade].sort((a, b) => a - b);
    setOpenGrades(next);
    // Тохиргооны PUT хоосон утга авдаггүй тул бүгд хаалттайг "off" гэж бичнэ —
    // parser нь тоо биш бүхнийг үл тоодог.
    await put("placement_grades", next.length ? next.join(",") : "off");
  };

  return (
    <div className="bg-surface border border-line rounded-md px-5 py-4 mb-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-[.72rem] font-extrabold text-ink-3 uppercase mb-1">Үнэ</span>
          <div className="flex gap-2">
            <input value={fee} onChange={(e) => setFee(e.target.value)} className={INPUT_CLASS} />
            <button
              type="button"
              disabled={busyKey === "placement_fee"}
              onClick={() => put("placement_fee", fee.trim())}
              className="shrink-0 px-4 rounded-md bg-navy text-white font-extrabold text-[.82rem] disabled:opacity-50"
            >
              Хадгалах
            </button>
          </div>
        </label>
        <label className="block">
          <span className="block text-[.72rem] font-extrabold text-ink-3 uppercase mb-1">
            Хугацаа (минут)
          </span>
          <div className="flex gap-2">
            <input
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              inputMode="numeric"
              className={INPUT_CLASS}
            />
            <button
              type="button"
              disabled={busyKey === "placement_minutes"}
              onClick={() => put("placement_minutes", minutes.trim())}
              className="shrink-0 px-4 rounded-md bg-navy text-white font-extrabold text-[.82rem] disabled:opacity-50"
            >
              Хадгалах
            </button>
          </div>
        </label>
      </div>

      <div className="mt-4 pt-4 border-t border-line">
        <span className="block text-[.72rem] font-extrabold text-ink-3 uppercase mb-2">
          Сурагчдад нээлттэй ангиуд
        </span>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 9 }, (_, i) => i + 4).map((g) => {
            const open = openGrades.includes(g);
            const hasBank = gradesWithProblems.includes(g);
            return (
              <button
                key={g}
                type="button"
                disabled={busyKey === "placement_grades"}
                onClick={() => toggleGrade(g)}
                title={hasBank ? undefined : "Энэ ангид бодлого ороогүй байна"}
                className={`px-3.5 py-2 rounded-full font-extrabold text-[.85rem] border transition-colors disabled:opacity-50 ${
                  open
                    ? "bg-green-soft text-green border-green/30"
                    : "bg-bg-soft text-ink-3 border-line"
                }`}
              >
                {g}-р анги{open ? " ✓" : ""}
                {!hasBank && "⚠"}
              </button>
            );
          })}
        </div>
        <p className="text-[.78rem] font-semibold text-ink-3 mt-2 leading-[1.55]">
          Нээгдээгүй ангид шалгалт эхлэхгүй. ⚠ — тэр ангид бодлого ороогүй байна.
        </p>
      </div>
      {error && <p className="text-red-soft font-bold text-[.85rem] mt-2">{error}</p>}
    </div>
  );
}
