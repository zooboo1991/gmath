"use client";

import Link from "next/link";
import { useState } from "react";
import type { Level } from "@/lib/assessment/types";
import type { Course } from "@/lib/db";
import { INPUT_CLASS } from "@/components/admin/panels/shared";


export default function LevelsPanel({
  initialLevels,
  courses,
}: {
  initialLevels: Level[];
  courses: Course[];
}) {
  const [levels, setLevels] = useState(initialLevels);
  const [openId, setOpenId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Level | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  const open = (level: Level) => {
    setOpenId(level.id);
    setDraft({ ...level });
    setError(null);
    setSavedId(null);
  };

  const setField = <K extends keyof Level>(key: K, value: Level[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/levels/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      setLevels((ls) => ls.map((l) => (l.id === draft.id ? json.level : l)));
      setSavedId(draft.id);
      setOpenId(null);
      setDraft(null);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-soft">
      <header className="sticky top-0 z-10 bg-surface border-b border-line">
        <div className="wrap flex items-center justify-between h-[68px]">
          <Link
            href="/admin/assessment"
            className="inline-flex items-center gap-2 font-extrabold text-ink-2 hover:text-ink text-[.92rem]"
          >
            ← Буцах
          </Link>
          <b className="font-extrabold text-[1rem]">Түвшний тайлбар</b>
          <span className="w-[70px]" />
        </div>
      </header>

      <div className="wrap max-w-[820px] py-7">
        <p className="text-ink-2 font-semibold text-[.9rem] mb-5">
          Сурагч үнэлгээгээ дуусгасны дараа профайл дээрээ эдгээр тайлбарыг хардаг. Түвшин бүрд юу
          хамрагдах, дараагийн түвшинд хэрхэн гарах, ямар сургалт санал болгохыг бичнэ.
        </p>

        <div className="flex flex-col gap-2.5">
          {levels.map((level) => {
            const isOpen = openId === level.id;
            const course = courses.find((c) => c.id === level.recommendedCourseId);
            return (
              <div key={level.id} className="bg-surface border border-line rounded-md shadow-xs overflow-hidden">
                <button
                  type="button"
                  onClick={() => (isOpen ? (setOpenId(null), setDraft(null)) : open(level))}
                  className="w-full flex items-center justify-between gap-3 px-[18px] py-[15px] text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-[.72rem] font-extrabold text-blue-strong bg-blue-soft px-2.5 py-1 rounded-full shrink-0">
                        {level.id}
                      </span>
                      <b className="text-[.98rem] font-extrabold">{level.name}</b>
                      {savedId === level.id && (
                        <span className="text-[.72rem] font-extrabold text-green bg-green-soft px-2.5 py-1 rounded-full">
                          Хадгаллаа
                        </span>
                      )}
                    </div>
                    <p className="text-[.85rem] text-ink-3 font-semibold mt-1 truncate">
                      {level.description || "Тайлбар оруулаагүй"}
                      {course ? ` · ${course.title}` : ""}
                    </p>
                  </div>
                  <span className="text-ink-3 font-extrabold shrink-0">{isOpen ? "−" : "Засах"}</span>
                </button>

                {isOpen && draft && (
                  <div className="border-t border-line px-[18px] py-[18px] flex flex-col gap-3.5">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[.8rem] font-extrabold text-ink-3">Түвшний нэр</span>
                      <input
                        value={draft.name}
                        onChange={(e) => setField("name", e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[.8rem] font-extrabold text-ink-3">Товч тайлбар</span>
                      <textarea
                        value={draft.description}
                        onChange={(e) => setField("description", e.target.value)}
                        rows={2}
                        className={`${INPUT_CLASS} resize-y`}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[.8rem] font-extrabold text-ink-3">Хамрах хүрээ</span>
                      <textarea
                        value={draft.scope}
                        onChange={(e) => setField("scope", e.target.value)}
                        rows={3}
                        placeholder="Энэ түвшинд ямар сэдэв, ямар төрлийн бодлого багтах вэ"
                        className={`${INPUT_CLASS} resize-y`}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[.8rem] font-extrabold text-ink-3">
                        Дараагийн түвшинд хэрхэн гарах
                      </span>
                      <textarea
                        value={draft.howToAdvance}
                        onChange={(e) => setField("howToAdvance", e.target.value)}
                        rows={3}
                        className={`${INPUT_CLASS} resize-y`}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[.8rem] font-extrabold text-ink-3">Санал болгох сургалт</span>
                      <select
                        value={draft.recommendedCourseId ?? ""}
                        onChange={(e) => setField("recommendedCourseId", e.target.value || undefined)}
                        className={INPUT_CLASS}
                      >
                        <option value="">— Сонгоогүй —</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.tag} · {c.title}
                          </option>
                        ))}
                      </select>
                    </label>

                    {error && <p className="text-red-soft font-semibold text-[.85rem]">{error}</p>}

                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={save}
                        className="text-[.88rem] font-extrabold text-white bg-blue px-5 py-2.5 rounded-full disabled:opacity-50"
                      >
                        {saving ? "Хадгалж байна…" : "Хадгалах"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(null);
                          setDraft(null);
                        }}
                        className="text-[.88rem] font-extrabold text-ink-2 bg-surface-2 px-5 py-2.5 rounded-full"
                      >
                        Цуцлах
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
