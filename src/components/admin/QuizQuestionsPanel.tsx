"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import MathText from "@/components/assessment/MathText";
import { IconArrowLeft } from "@/components/icons";
import type { QuizQuestion, QuizTrack } from "@/lib/assessment/types";

const INPUT_CLASS =
  "w-full px-3.5 py-2.5 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.88rem] focus:outline-none focus:border-blue focus:bg-surface";

const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);

const emptyForm = {
  track: "regular" as QuizTrack,
  grade: 4,
  topic: "",
  bodyLatex: "",
  choices: ["", "", "", ""],
  correctIndex: 0,
};

type FormState = typeof emptyForm;

function toForm(q: QuizQuestion): FormState {
  return {
    track: q.track,
    grade: q.grade,
    topic: q.topic,
    bodyLatex: q.bodyLatex,
    choices: [...q.choices],
    correctIndex: q.correctIndex,
  };
}

/**
 * The quiz question bank (Энгийн/Сонгон tests). Follows ProblemsPanel's
 * structure — client-held list, inline form, soft archive — because the
 * admins already know that page; only the fields differ.
 */
export default function QuizQuestionsPanel({ initialQuestions }: { initialQuestions: QuizQuestion[] }) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trackFilter, setTrackFilter] = useState<"all" | QuizTrack>("all");
  const [gradeFilter, setGradeFilter] = useState("all");

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const filtered = useMemo(
    () =>
      questions.filter(
        (q) =>
          (trackFilter === "all" || q.track === trackFilter) &&
          (gradeFilter === "all" || q.grade === Number(gradeFilter))
      ),
    [questions, trackFilter, gradeFilter]
  );

  /** Active-question counts per (track, grade), so thin grades are visible at a glance. */
  const coverage = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of questions) {
      if (!q.active) continue;
      const key = `${q.track}:${q.grade}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [questions]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
    setError(null);
  };

  const openEdit = (q: QuizQuestion) => {
    setForm(toForm(q));
    setEditingId(q.id);
    setFormOpen(true);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `/api/admin/quiz-questions/${editingId}` : "/api/admin/quiz-questions";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      setQuestions((qs) =>
        editingId ? qs.map((q) => (q.id === editingId ? json.question : q)) : [json.question, ...qs]
      );
      setFormOpen(false);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (q: QuizQuestion) => {
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/admin/quiz-questions/${q.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !q.active }),
      });
      const json = await res.json();
      if (res.ok) {
        setQuestions((qs) => qs.map((x) => (x.id === q.id ? json.question : x)));
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-6 lg:px-10 py-8">
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <Link
          href="/admin/assessment"
          title="Үнэлгээ рүү буцах"
          aria-label="Үнэлгээ рүү буцах"
          className="w-9 h-9 rounded-full border border-line grid place-items-center text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors shrink-0"
        >
          <IconArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-[1.35rem] font-extrabold flex-1">Тестийн асуултын сан</h1>
        {!formOpen && (
          <button
            type="button"
            onClick={openCreate}
            className="text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2 rounded-full"
          >
            + Асуулт нэмэх
          </button>
        )}
      </div>

      {formOpen && (
        <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-5 mb-6">
          <h2 className="font-extrabold text-[1.02rem] mb-4">
            {editingId ? "Асуулт засах" : "Шинэ асуулт"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1.5 text-[.82rem] font-extrabold text-ink-3">
              Төрөл
              <select
                value={form.track}
                onChange={(e) => setField("track", e.target.value as QuizTrack)}
                className={INPUT_CLASS}
              >
                <option value="regular">Энгийн</option>
                <option value="advanced">Сонгон</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[.82rem] font-extrabold text-ink-3">
              Анги
              <select
                value={form.grade}
                onChange={(e) => setField("grade", Number(e.target.value))}
                className={INPUT_CLASS}
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}-р анги
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[.82rem] font-extrabold text-ink-3">
              Сэдэв
              <input
                value={form.topic}
                onChange={(e) => setField("topic", e.target.value)}
                placeholder="жишээ: бутархай"
                className={INPUT_CLASS}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-[.82rem] font-extrabold text-ink-3 mt-3">
            Асуулт ($...$ дотор томьёо бичиж болно)
            <textarea
              value={form.bodyLatex}
              onChange={(e) => setField("bodyLatex", e.target.value)}
              rows={3}
              className={INPUT_CLASS}
            />
          </label>
          {form.bodyLatex.trim() && (
            <div className="bg-bg-soft rounded-sm px-3.5 py-2.5 mt-2 text-[.95rem]">
              <MathText source={form.bodyLatex} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {form.choices.map((choice, i) => (
              <label
                key={i}
                className={`flex items-center gap-2.5 rounded-md border-[1.5px] px-3 py-2 ${
                  form.correctIndex === i ? "border-green bg-green-soft/40" : "border-line-2"
                }`}
              >
                {/* The radio marks which choice is correct; the input holds its text. */}
                <input
                  type="radio"
                  name="correct-choice"
                  checked={form.correctIndex === i}
                  onChange={() => setField("correctIndex", i)}
                  title="Зөв хариулт"
                  className="w-4 h-4 shrink-0"
                />
                <span className="font-extrabold text-[.9rem] shrink-0">{"АБВГ"[i]}.</span>
                <input
                  value={choice}
                  onChange={(e) =>
                    setField(
                      "choices",
                      form.choices.map((c, ci) => (ci === i ? e.target.value : c))
                    )
                  }
                  placeholder={`Сонголт ${"АБВГ"[i]}`}
                  className="flex-1 min-w-0 bg-transparent font-semibold text-[.9rem] focus:outline-none"
                />
              </label>
            ))}
          </div>
          <p className="text-ink-3 font-semibold text-[.8rem] mt-2">
            Дугуй товчоор зөв хариултаа тэмдэглэнэ. Зөв хариулт сурагчид хэзээ ч илгээгддэггүй.
          </p>

          {error && <p className="text-red-soft font-semibold text-[.88rem] mt-3">{error}</p>}

          <div className="flex gap-2.5 mt-4">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="text-[.85rem] font-extrabold text-white bg-blue px-5 py-2.5 rounded-full disabled:opacity-50"
            >
              {saving ? "Хадгалж байна…" : "Хадгалах"}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="text-[.85rem] font-extrabold text-ink-2 bg-surface-2 px-5 py-2.5 rounded-full"
            >
              Болих
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2.5 flex-wrap mb-4">
        <select
          value={trackFilter}
          onChange={(e) => setTrackFilter(e.target.value as "all" | QuizTrack)}
          className={`${INPUT_CLASS} max-w-[160px]`}
        >
          <option value="all">Бүх төрөл</option>
          <option value="regular">Энгийн</option>
          <option value="advanced">Сонгон</option>
        </select>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className={`${INPUT_CLASS} max-w-[160px]`}
        >
          <option value="all">Бүх анги</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}-р анги
            </option>
          ))}
        </select>
        <span className="text-[.85rem] font-bold text-ink-3 self-center">
          {filtered.length} асуулт
          {trackFilter !== "all" && gradeFilter !== "all" && (
            <> · идэвхтэй {coverage.get(`${trackFilter}:${gradeFilter}`) ?? 0}</>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {filtered.length === 0 && (
          <p className="text-ink-3 font-semibold text-[.9rem]">Асуулт алга. Дээрх товчоор нэмээрэй.</p>
        )}
        {filtered.map((q) => (
          <div
            key={q.id}
            className={`bg-surface border border-line rounded-md shadow-xs px-5 py-4 ${
              q.active ? "" : "opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap text-[.72rem] font-extrabold">
                  <span className="text-blue-strong bg-blue-soft px-2 py-0.5 rounded-full">
                    {q.track === "regular" ? "Энгийн" : "Сонгон"}
                  </span>
                  <span className="text-ink-2 bg-surface-2 px-2 py-0.5 rounded-full">{q.grade}-р анги</span>
                  {q.topic && <span className="text-ink-3">{q.topic}</span>}
                  {!q.active && <span className="text-red-soft">Архивласан</span>}
                </div>
                <div className="font-bold text-[.95rem] mt-2 leading-[1.6]">
                  <MathText source={q.bodyLatex} />
                </div>
                <div className="flex gap-3 flex-wrap mt-2 text-[.85rem] font-semibold text-ink-2">
                  {q.choices.map((c, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-baseline gap-1 ${
                        i === q.correctIndex ? "text-green font-extrabold" : ""
                      }`}
                    >
                      {"АБВГ"[i]}. <MathText source={c} inline className="!text-inherit" />
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(q)}
                  className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-3.5 py-2 rounded-full"
                >
                  Засах
                </button>
                <button
                  type="button"
                  disabled={busyId === q.id}
                  onClick={() => toggleActive(q)}
                  className="text-[.82rem] font-extrabold text-ink-2 bg-surface-2 px-3.5 py-2 rounded-full disabled:opacity-50"
                >
                  {q.active ? "Архивлах" : "Сэргээх"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
