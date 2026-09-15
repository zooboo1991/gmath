"use client";

import { useState } from "react";
import MathText from "@/components/assessment/MathText";
import { apiError, readJson } from "@/lib/fetchJson";
import type { BodlogoProblem } from "@/lib/bodlogo/db";
import type { ProblemCategory } from "@/lib/assessment/types";

/**
 * Бодлого хувилах системээс ирсэн бодлогууд — банкны өмнөх хүлээлгийн сан.
 *
 * Нэг загвараас 20 орчим хувилбар гардаг тул энд олон зуун мөр байна. Багшийн
 * ажил бүгдийг нь унших биш, шалгалтад хэрэгтэйг нь сонгож авах — тиймээс
 * жагсаалт нь ангиар шүүгддэг, нэг гэр бүлээс аль хэдийн авсныг сануулдаг.
 */

const LEVEL_LABEL: Record<1 | 2 | 3, string> = {
  1: "Хялбар",
  2: "Дунд",
  3: "Хүнд",
};

const LEVEL_CLASS: Record<1 | 2 | 3, string> = {
  1: "bg-green-soft/20 text-green",
  2: "bg-blue-soft text-blue-strong",
  3: "bg-gold-soft text-gold-strong",
};

/**
 * bodlogo-гийн `display` нь `$…$` тэмдэггүй, цэвэр LaTeX бичлэг. MathText нь
 * зохиол дундах `$…$`-ыг л томьёо гэж үздэг тул хүрээлж өгнө — эс бөгөөс
 * бутархай хариу "\frac{19}{12}" гэж түүхийгээрээ харагдана.
 */
function asMath(display: string): string {
  return display.includes("$") ? display : `$${display}$`;
}

/** Анги → C (5-6) / D (7-8). Бусад ангид таамаглахгүй — багш өөрөө сонгоно. */
function defaultCategory(grade: number): ProblemCategory | "" {
  if (grade === 5 || grade === 6) return "C";
  if (grade === 7 || grade === 8) return "D";
  return "";
}

export default function BodlogoPanel({
  initialProblems,
}: {
  initialProblems: BodlogoProblem[];
}) {
  const [problems, setProblems] = useState(initialProblems);
  const [grade, setGrade] = useState<number | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Record<string, ProblemCategory | "">>({});

  const take = async (entry: BodlogoProblem) => {
    const chosen = category[entry.id] ?? defaultCategory(entry.grade);
    if (!chosen) {
      setError("Ангилал сонгоно уу (C — 5-6 анги, D — 7-8 анги)");
      return;
    }
    setBusyId(entry.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bodlogo/${entry.id}/take`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: chosen, active: true }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setError(apiError(res, json, "Банкандаа авч чадсангүй"));
        return;
      }
      const problemId = (json as { problem?: { id?: string } })?.problem?.id;
      setProblems((list) =>
        list.map((one) =>
          one.id === entry.id
            ? { ...one, takenProblemId: problemId ?? one.id, takenAt: new Date().toISOString() }
            : one
        )
      );
    } catch {
      setError("Сүлжээний алдаа");
    } finally {
      setBusyId(null);
    }
  };

  if (problems.length === 0) {
    return (
      <p className="text-ink-3 font-semibold text-[.9rem]">
        Бодлого хувилах системээс хараахан бодлого ирээгүй байна.
      </p>
    );
  }

  const grades = [...new Set(problems.map((one) => one.grade))].sort((a, b) => a - b);
  const shown = grade === "all" ? problems : problems.filter((one) => one.grade === grade);
  const pending = shown.filter((one) => !one.takenProblemId);
  const taken = shown.filter((one) => one.takenProblemId);

  // Аль гэр бүлээс аль хэдийн авсан бэ — шүүлтээс хамаарахгүй, бүх жагсаалтаас.
  const takenFamilies = new Set(
    problems.filter((one) => one.takenProblemId).map((one) => one.familyId)
  );

  const row = (entry: BodlogoProblem, inBank: boolean) => {
    const open = openId === entry.id;
    const chosen = category[entry.id] ?? defaultCategory(entry.grade);
    const sameFamilyTaken = !inBank && takenFamilies.has(entry.familyId);
    return (
      <div key={entry.id} className={`py-4 ${inBank ? "opacity-70" : ""}`}>
        <div className="flex items-start gap-3 flex-wrap">
          <span
            className={`text-[.72rem] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${LEVEL_CLASS[entry.level]}`}
          >
            {LEVEL_LABEL[entry.level]}
          </span>
          <span className="text-[.78rem] font-extrabold text-ink-3 shrink-0">
            {entry.grade}-р анги
          </span>
          <b className="font-extrabold text-[.9rem] flex-1 min-w-[160px]">
            {entry.topic || "(сэдэвгүй)"}
          </b>
          <span className="text-[.74rem] font-bold text-ink-3 tabular-nums shrink-0">
            {entry.externalId}
          </span>
        </div>

        <div className="text-[.92rem] text-ink-2 leading-[1.7] mt-2">
          <MathText source={entry.bodyLatex} />
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span className="text-[.82rem] font-bold text-ink-3">Хариу:</span>
          <span className="text-[.88rem] font-extrabold">
            <MathText source={asMath(entry.answerDisplay)} inline />
          </span>
          {entry.answerUnit && (
            <span className="text-[.8rem] font-bold text-ink-3">({entry.answerUnit})</span>
          )}
          {entry.tutor && entry.tutor.steps.length > 0 && (
            <span className="text-[.74rem] font-bold text-blue-strong bg-blue-soft rounded-full px-2 py-0.5">
              AI багш: {entry.tutor.steps.length} алхам
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpenId(open ? null : entry.id)}
            className="text-[.8rem] font-extrabold text-blue-strong hover:underline"
          >
            {open ? "Бодолт нуух" : "Бодолт харах"}
          </button>
        </div>

        {open && (
          <div className="mt-2 bg-bg-soft border border-line rounded-md px-4 py-3">
            <div className="text-[.88rem] text-ink-2 leading-[1.75] whitespace-pre-wrap">
              <MathText source={entry.solutionMn} />
            </div>
            {entry.tutor && entry.tutor.commonErrors.length > 0 && (
              <div className="mt-3 pt-3 border-t border-line">
                <b className="block text-[.78rem] font-extrabold uppercase tracking-wide text-ink-3 mb-1.5">
                  Түгээмэл алдаа
                </b>
                {entry.tutor.commonErrors.map((one) => (
                  <p key={one.value} className="text-[.84rem] text-ink-2 leading-[1.6] mb-1">
                    <b className="font-extrabold">
                      <MathText source={asMath(one.display)} inline />
                    </b>{" "}
                    — {one.diagnosis}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {sameFamilyTaken && (
          <p className="text-[.78rem] font-extrabold text-gold-strong bg-gold-soft rounded-full px-2.5 py-0.5 inline-block mt-2">
            ⚠ Энэ гэр бүлээс аль хэдийн банкандаа авсан байна
          </p>
        )}

        {inBank ? (
          <p className="text-[.8rem] font-extrabold text-green mt-2">✓ Банкандаа авсан</p>
        ) : (
          <div className="flex items-center gap-2 mt-3">
            <select
              value={chosen}
              onChange={(e) =>
                setCategory((map) => ({ ...map, [entry.id]: e.target.value as ProblemCategory | "" }))
              }
              className="h-9 px-2.5 rounded-md border border-line font-bold text-[.84rem] bg-surface"
            >
              <option value="">Ангилал…</option>
              <option value="C">C — 5-6 анги</option>
              <option value="D">D — 7-8 анги</option>
            </select>
            <button
              type="button"
              disabled={busyId === entry.id}
              onClick={() => take(entry)}
              className="h-9 px-4 rounded-md bg-blue text-white font-extrabold text-[.84rem] disabled:opacity-50"
            >
              {busyId === entry.id ? "Авч байна…" : "Банкандаа ав"}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {error && <p className="text-red-soft font-bold text-[.88rem] mb-3">{error}</p>}

      <div className="flex items-center gap-2 flex-wrap mb-5">
        <button
          type="button"
          onClick={() => setGrade("all")}
          className={`h-9 px-3.5 rounded-full font-extrabold text-[.84rem] border ${
            grade === "all" ? "bg-blue text-white border-blue" : "border-line text-ink-2"
          }`}
        >
          Бүх анги ({problems.length})
        </button>
        {grades.map((one) => (
          <button
            key={one}
            type="button"
            onClick={() => setGrade(one)}
            className={`h-9 px-3.5 rounded-full font-extrabold text-[.84rem] border ${
              grade === one ? "bg-blue text-white border-blue" : "border-line text-ink-2"
            }`}
          >
            {one}-р анги ({problems.filter((p) => p.grade === one).length})
          </button>
        ))}
      </div>

      <h4 className="font-extrabold text-[.86rem] text-ink-3 uppercase tracking-wide mb-1">
        Хүлээж байгаа ({pending.length})
      </h4>
      {pending.length > 0 ? (
        <div className="divide-y divide-line">{pending.map((one) => row(one, false))}</div>
      ) : (
        <p className="text-ink-3 font-semibold text-[.88rem] py-3">
          Энэ ангид авах бодлого үлдсэнгүй.
        </p>
      )}

      {taken.length > 0 && (
        <div className="mt-7 pt-5 border-t-2 border-line">
          <h4 className="font-extrabold text-[.86rem] text-ink-3 uppercase tracking-wide mb-1">
            Банкандаа авсан ({taken.length})
          </h4>
          <p className="text-ink-3 font-semibold text-[.82rem] mb-1">
            Эдгээр нь Үнэлгээ → Бодлогын сан дотор байна. Бодолт, AI багшийн
            өгөгдөл нь зөвхөн энд үлдэнэ.
          </p>
          <div className="divide-y divide-line">{taken.map((one) => row(one, true))}</div>
        </div>
      )}
    </>
  );
}
