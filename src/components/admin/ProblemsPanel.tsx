"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import MathText from "@/components/assessment/MathText";
import { IconClose } from "@/components/icons";
import type { Problem } from "@/lib/assessment/types";
import { apiError, readJson } from "@/lib/fetchJson";
import { downscaleImage, formatMb, MAX_UPLOAD_BYTES } from "@/lib/imageResize";
import { INPUT_CLASS } from "@/components/admin/panels/shared";


const emptyForm = {
  level: 1,
  difficulty: 1,
  topic: "",
  bodyLatex: "",
  imageUrl: "",
  answerKey: "",
  active: true,
};

type FormState = typeof emptyForm;

function toForm(problem: Problem): FormState {
  return {
    level: problem.level,
    difficulty: problem.difficulty,
    topic: problem.topic,
    bodyLatex: problem.bodyLatex ?? "",
    imageUrl: problem.imageUrl ?? "",
    answerKey: problem.answerKey ?? "",
    active: problem.active,
  };
}

export default function ProblemsPanel({ initialProblems }: { initialProblems: Problem[] }) {
  const [problems, setProblems] = useState(initialProblems);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState("all");
  const [search, setSearch] = useState("");

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setFormOpen(true);
  };

  const openEdit = (problem: Problem) => {
    setEditingId(problem.id);
    setForm(toForm(problem));
    setError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setError(null);
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      // A photographed olympiad problem comes off a phone at several MB and
      // would be rejected by the platform before the route ever sees it.
      const prepared = await downscaleImage(file);
      if (prepared.size > MAX_UPLOAD_BYTES) {
        setError(
          `Зураг хэт том байна (${formatMb(prepared.size)}). ${formatMb(MAX_UPLOAD_BYTES)}-ээс бага зураг оруулна уу.`
        );
        return;
      }

      const body = new FormData();
      body.append("file", prepared);
      const res = await fetch("/api/admin/problems/upload", { method: "POST", body });
      const json = await readJson<{ url: string }>(res);
      if (!res.ok || !json.url) {
        setError(apiError(res, json, "Байршуулахад алдаа гарлаа"));
        return;
      }
      setField("imageUrl", json.url);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.bodyLatex.trim() && !form.imageUrl.trim()) {
      setError("Бодлогын эх (LaTeX) эсвэл зургийн аль нэгийг оруулна уу");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(editingId ? `/api/admin/problems/${editingId}` : "/api/admin/problems", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await readJson<{ problem: Problem }>(res);
      const saved = json.problem;
      if (!res.ok || !saved) {
        setError(apiError(res, json, "Хадгалахад алдаа гарлаа"));
        return;
      }
      setProblems((ps) =>
        editingId ? ps.map((p) => (p.id === editingId ? saved : p)) : [saved, ...ps]
      );
      closeForm();
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (problem: Problem) => {
    if (!confirm(`"${problem.topic || "Энэ бодлого"}"-г архивлах уу? Шинэ үнэлгээнд харагдахаа болино.`)) return;
    setBusyId(problem.id);
    try {
      const res = await fetch(`/api/admin/problems/${problem.id}`, { method: "DELETE" });
      if (res.ok) {
        setProblems((ps) => ps.map((p) => (p.id === problem.id ? { ...p, active: false } : p)));
      }
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (problem: Problem) => {
    setBusyId(problem.id);
    try {
      const res = await fetch(`/api/admin/problems/${problem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      const json = await readJson<{ problem: Problem }>(res);
      const saved = json.problem;
      if (res.ok && saved) setProblems((ps) => ps.map((p) => (p.id === problem.id ? saved : p)));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return problems.filter((p) => {
      if (levelFilter !== "all" && String(p.level) !== levelFilter) return false;
      if (!q) return true;
      return `${p.topic} ${p.bodyLatex ?? ""}`.toLowerCase().includes(q);
    });
  }, [problems, levelFilter, search]);

  const activeCount = problems.filter((p) => p.active).length;

  return (
    <div className="min-h-screen bg-bg-soft">
      <header className="sticky top-0 z-10 bg-surface border-b border-line">
        <div className="wrap flex items-center justify-between h-[68px] gap-3">
          <Link
            href="/admin/assessment"
            className="inline-flex items-center gap-2 font-extrabold text-ink-2 hover:text-ink text-[.92rem]"
          >
            ← Буцах
          </Link>
          <b className="font-extrabold text-[1rem] hidden sm:block">Бодлогын сан</b>
          {!formOpen && (
            <button
              type="button"
              onClick={openCreate}
              className="font-extrabold rounded-full bg-blue text-white shadow-blue px-5 py-2.5 text-[.9rem] transition-transform hover:-translate-y-0.5"
            >
              + Бодлого нэмэх
            </button>
          )}
          {formOpen && <span className="w-[130px]" />}
        </div>
      </header>

      <div className="wrap max-w-[1000px] py-7">
        {formOpen && (
          <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[1.05rem] font-extrabold">
                {editingId ? "Бодлого засах" : "Шинэ бодлого"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Хаах"
                className="w-9 h-9 rounded-full bg-bg-soft grid place-items-center shrink-0"
              >
                <IconClose className="w-4 h-4 text-ink-2" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[.8rem] font-extrabold text-ink-3">Түвшин (1-10)</span>
                <select
                  value={form.level}
                  onChange={(e) => setField("level", Number(e.target.value))}
                  className={INPUT_CLASS}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}-р түвшин
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[.8rem] font-extrabold text-ink-3">Хүндрэл (1-10)</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  value={form.difficulty}
                  onChange={(e) => setField("difficulty", Number(e.target.value))}
                  className={INPUT_CLASS}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[.8rem] font-extrabold text-ink-3">Сэдэв</span>
                <input
                  type="text"
                  value={form.topic}
                  onChange={(e) => setField("topic", e.target.value)}
                  placeholder="Жишээ: Комбинаторик"
                  className={INPUT_CLASS}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 nav:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[.8rem] font-extrabold text-ink-3">
                  Бодлогын эх — LaTeX
                </span>
                <textarea
                  value={form.bodyLatex}
                  onChange={(e) => setField("bodyLatex", e.target.value)}
                  rows={9}
                  placeholder={"$x^2+5x+6=0$ тэгшитгэлийн язгуурыг ол.\n\n$$\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$$"}
                  className={`${INPUT_CLASS} font-mono text-[.82rem] resize-y`}
                />
                <small className="text-[.76rem] text-ink-3 font-semibold">
                  Мөрөнд: <code className="font-mono">$...$</code> · Тусдаа блок:{" "}
                  <code className="font-mono">$$...$$</code>
                </small>
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="text-[.8rem] font-extrabold text-ink-3">Урьдчилан харах</span>
                <div className="min-h-[214px] rounded-xs border-[1.5px] border-line-2 bg-surface px-4 py-3 overflow-x-auto">
                  {form.bodyLatex.trim() ? (
                    <MathText source={form.bodyLatex} />
                  ) : (
                    <p className="text-ink-3 font-semibold text-[.85rem]">
                      LaTeX бичихэд энд шууд харагдана.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <span className="text-[.8rem] font-extrabold text-ink-3 block mb-2">
                Зураг (заавал биш — геометрийн дүрсэнд)
              </span>
              {form.imageUrl && (
                <div className="relative w-full max-w-[320px] rounded-md overflow-hidden bg-bg-soft mb-2.5 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.imageUrl} alt="" className="w-full object-contain" />
                  <button
                    type="button"
                    onClick={() => setField("imageUrl", "")}
                    aria-label="Зураг устгах"
                    className="absolute top-2 right-2 w-9 h-9 rounded-full bg-surface/90 grid place-items-center"
                  >
                    <IconClose className="w-4 h-4 text-ink-2" />
                  </button>
                </div>
              )}
              <label className="inline-flex items-center gap-2 text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2.5 rounded-full cursor-pointer">
                {uploading ? "Байршуулж байна…" : form.imageUrl ? "Зураг солих" : "Зураг оруулах"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) uploadImage(file);
                  }}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5 mt-4">
              <span className="text-[.8rem] font-extrabold text-ink-3">
                Хариу (зөвхөн админд харагдана)
              </span>
              <textarea
                value={form.answerKey}
                onChange={(e) => setField("answerKey", e.target.value)}
                rows={2}
                className={`${INPUT_CLASS} font-mono text-[.82rem] resize-y`}
              />
            </label>

            {error && <p className="text-red-soft font-semibold text-[.85rem] mt-3">{error}</p>}

            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                disabled={saving || uploading}
                onClick={save}
                className="text-[.88rem] font-extrabold text-white bg-blue px-5 py-2.5 rounded-full disabled:opacity-50"
              >
                {saving ? "Хадгалж байна…" : "Хадгалах"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="text-[.88rem] font-extrabold text-ink-2 bg-surface-2 px-5 py-2.5 rounded-full"
              >
                Цуцлах
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-[1.1rem] font-extrabold">
            Бодлогууд ({filtered.length}
            {filtered.length !== problems.length && ` / ${problems.length}`})
            <span className="text-ink-3 font-bold text-[.85rem] ml-2">{activeCount} идэвхтэй</span>
          </h2>
          <div className="flex gap-2.5 flex-wrap">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className={`${INPUT_CLASS} max-w-[160px]`}
            >
              <option value="all">Бүх түвшин</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)}>
                  {n}-р түвшин
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Сэдэв, эхээр хайх"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${INPUT_CLASS} max-w-[220px]`}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-ink-3 font-semibold text-[.9rem] text-center py-12">
            {problems.length === 0
              ? "Одоогоор бодлого алга. Эхний бодлогоо нэмнэ үү."
              : "Тохирох бодлого алга байна."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((p) => (
              <div
                key={p.id}
                className={`bg-surface border border-line rounded-md shadow-xs px-[18px] py-[16px] ${
                  p.active ? "" : "opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[.72rem] font-extrabold text-blue-strong bg-blue-soft px-2.5 py-1 rounded-full">
                      {p.level}-р түвшин
                    </span>
                    <span className="text-[.72rem] font-extrabold text-ink-2 bg-surface-2 px-2.5 py-1 rounded-full">
                      Хүндрэл {p.difficulty}
                    </span>
                    {p.topic && (
                      <span className="text-[.8rem] font-bold text-ink-3">{p.topic}</span>
                    )}
                    {!p.active && (
                      <span className="text-[.72rem] font-extrabold text-ink-3 bg-surface-2 px-2.5 py-1 rounded-full">
                        Архивласан
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="text-[.8rem] font-extrabold text-blue-strong bg-blue-soft px-3 py-1.5 rounded-full"
                    >
                      Засах
                    </button>
                    {p.active ? (
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => deactivate(p)}
                        className="text-[.8rem] font-extrabold text-red-soft bg-[oklch(0.95_0.03_25)] px-3 py-1.5 rounded-full disabled:opacity-50"
                      >
                        {busyId === p.id ? "…" : "Архивлах"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => restore(p)}
                        className="text-[.8rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full disabled:opacity-50"
                      >
                        {busyId === p.id ? "…" : "Сэргээх"}
                      </button>
                    )}
                  </div>
                </div>

                {p.bodyLatex && <MathText source={p.bodyLatex} className="text-[.95rem] overflow-x-auto" />}
                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="mt-2.5 max-w-[280px] rounded-sm border border-line" />
                )}
                {p.answerKey && (
                  <p className="text-[.82rem] text-ink-3 font-semibold mt-2.5 pt-2.5 border-t border-line">
                    Хариу: <span className="font-mono">{p.answerKey}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
