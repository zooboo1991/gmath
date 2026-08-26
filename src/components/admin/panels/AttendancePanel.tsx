"use client";

import { useEffect, useState } from "react";
import type { RollCallLesson, RollCallStudent } from "@/lib/rollCall";
import { IconCheckCircle, IconClock } from "@/components/icons";

type Screen = "lessons" | "register";

/**
 * Ирц бүртгэх — built for a teacher standing in front of the class.
 *
 * Today's classroom lessons, one tap to open the register, everyone ticked to
 * start with, untick whoever is missing, one button. Online lessons are not
 * here: Zoom already knows who joined those.
 */
export default function AttendancePanel() {
  const [screen, setScreen] = useState<Screen>("lessons");
  const [showHistory, setShowHistory] = useState(false);
  const [lessons, setLessons] = useState<RollCallLesson[] | null>(null);
  const [history, setHistory] = useState<RollCallLesson[] | null>(null);

  const [lesson, setLesson] = useState<RollCallLesson | null>(null);
  const [students, setStudents] = useState<RollCallStudent[]>([]);
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<{ present: number; absent: number } | null>(null);

  useEffect(() => {
    fetch("/api/admin/roll-call")
      .then((res) => (res.ok ? res.json() : { lessons: [] }))
      .then((json) => setLessons(json.lessons ?? []))
      .catch(() => setLessons([]));
  }, []);

  const loadHistory = async () => {
    setShowHistory(true);
    if (history) return;
    const res = await fetch("/api/admin/roll-call?history=1");
    const json = await res.json().catch(() => ({ lessons: [] }));
    setHistory(json.lessons ?? []);
  };

  const openRegister = async (target: RollCallLesson) => {
    setLoading(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch(
        `/api/admin/roll-call?courseId=${encodeURIComponent(target.courseId)}&lessonIndex=${target.lessonIndex}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Ачаалахад алдаа гарлаа");
        return;
      }
      const roster = (json.students ?? []) as RollCallStudent[];
      setLesson(json.lesson ?? target);
      setStudents(roster);
      // Everyone is here until the teacher says otherwise; a register already
      // taken comes back exactly as it was left.
      setPresent(new Set(roster.filter((s) => s.present !== false).map((s) => s.userId)));
      setScreen("register");
    } catch {
      setError("Сүлжээний алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!lesson) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roll-call", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: lesson.courseId,
          lessonIndex: lesson.lessonIndex,
          marks: students.map((s) => ({ userId: s.userId, present: present.has(s.userId) })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Хадгалахад алдаа гарлаа");
        return;
      }
      setConfirming(false);
      setSaved({ present: json.present, absent: json.absent });
      // The list behind this screen now shows the counts it just recorded.
      setLessons((current) =>
        (current ?? []).map((l) =>
          l.courseId === lesson.courseId && l.lessonIndex === lesson.lessonIndex
            ? { ...l, present: json.present, absent: json.absent }
            : l
        )
      );
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  };

  // ---- the register ------------------------------------------------------
  if (screen === "register" && lesson) {
    const presentCount = present.size;
    const absentCount = students.length - presentCount;

    if (saved) {
      return (
        <div className="max-w-[520px] mx-auto bg-surface border border-line rounded-lg shadow-sm px-7 py-8 text-center">
          <span className="w-[60px] h-[60px] rounded-full bg-green-soft text-green grid place-items-center mx-auto mb-4">
            <IconCheckCircle className="w-8 h-8" />
          </span>
          <h3 className="text-[1.2rem] font-extrabold">Ирц бүртгэгдлээ</h3>
          <p className="text-ink-2 font-semibold mt-1.5">
            {lesson.courseLabel} · {lesson.topic}
          </p>
          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="bg-bg-soft rounded-md py-4">
              <b className="text-[1.6rem] font-extrabold block leading-none">{students.length}</b>
              <span className="text-ink-3 font-bold text-[.8rem]">Нийт</span>
            </div>
            <div className="bg-green-soft rounded-md py-4">
              <b className="text-[1.6rem] font-extrabold block leading-none text-green">{saved.present}</b>
              <span className="text-green font-bold text-[.8rem]">Ирсэн</span>
            </div>
            <div className="bg-gold-soft rounded-md py-4">
              <b className="text-[1.6rem] font-extrabold block leading-none text-gold-strong">{saved.absent}</b>
              <span className="text-gold-strong font-bold text-[.8rem]">Тасалсан</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setScreen("lessons");
              setSaved(null);
            }}
            className="w-full font-extrabold text-white bg-blue shadow-blue rounded-full px-6 py-3.5 mt-6"
          >
            Буцах
          </button>
        </div>
      );
    }

    return (
      <div className="max-w-[620px] mx-auto">
        <button
          type="button"
          onClick={() => setScreen("lessons")}
          className="font-extrabold text-[.88rem] text-ink-2 mb-3"
        >
          ← Хичээлүүд
        </button>

        <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 mb-3">
          <b className="font-extrabold text-[1.05rem] block">{lesson.courseLabel}</b>
          <span className="text-ink-3 font-semibold text-[.85rem]">
            {lesson.date.replaceAll("-", ".")} {lesson.timeLabel && `· ${lesson.timeLabel}`}
            {lesson.topic && ` · ${lesson.topic}`}
          </span>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-line">
            <span className="font-extrabold text-[.95rem] text-green">Ирсэн {presentCount}</span>
            <span className="font-extrabold text-[.95rem] text-gold-strong">Тасалсан {absentCount}</span>
            <button
              type="button"
              onClick={() => setPresent(new Set(students.map((s) => s.userId)))}
              className="ml-auto text-[.82rem] font-extrabold text-blue-strong"
            >
              Бүгдийг ирсэн болгох
            </button>
          </div>
        </div>

        <div className="bg-surface border border-line rounded-md shadow-xs mb-4">
          {students.length === 0 ? (
            <p className="text-ink-3 font-semibold text-[.9rem] px-5 py-6 text-center">
              Энэ сургалтад идэвхтэй бүртгэлтэй сурагч алга байна.
            </p>
          ) : (
            students.map((student) => {
              const here = present.has(student.userId);
              return (
                <button
                  key={student.userId}
                  type="button"
                  onClick={() =>
                    setPresent((current) => {
                      const next = new Set(current);
                      if (here) next.delete(student.userId);
                      else next.add(student.userId);
                      return next;
                    })
                  }
                  className="w-full flex items-center gap-3.5 px-5 py-3.5 border-b border-line last:border-0 text-left"
                >
                  <span
                    className={`w-6 h-6 rounded-md grid place-items-center shrink-0 ${
                      here ? "bg-green text-white" : "bg-surface-2 border border-line-2"
                    }`}
                  >
                    {here && <IconCheckCircle className="w-4 h-4" />}
                  </span>
                  <span className="min-w-0">
                    <b className={`font-extrabold text-[.95rem] block ${here ? "" : "text-ink-3 line-through"}`}>
                      {student.name}
                    </b>
                    <span className="text-ink-3 font-semibold text-[.8rem]">{student.phone}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {error && <p className="text-red-soft font-semibold text-[.88rem] mb-3">{error}</p>}

        <button
          type="button"
          disabled={students.length === 0 || saving}
          onClick={() => setConfirming(true)}
          className="w-full font-extrabold text-white bg-blue shadow-blue rounded-full px-6 py-4 disabled:opacity-50"
        >
          Ирц бүртгэх
        </button>

        {confirming && (
          <div className="fixed inset-0 bg-black/40 grid place-items-center px-5 z-50">
            <div className="bg-surface rounded-lg shadow-lg px-7 py-7 max-w-[420px] w-full text-center">
              <h3 className="text-[1.15rem] font-extrabold">Ирцийг баталгаажуулах</h3>
              <p className="text-ink-2 font-semibold text-[.9rem] mt-1.5">
                {lesson.courseLabel}
                {lesson.topic ? ` · ${lesson.topic}` : ""}
              </p>
              <p className="text-[1.05rem] font-extrabold mt-5">
                {students.length} хүүхдээс{" "}
                <span className="text-green">{presentCount} ирсэн</span>
                {absentCount > 0 && (
                  <>
                    , <span className="text-gold-strong">{absentCount} тасалсан</span>
                  </>
                )}
              </p>
              {absentCount > 0 && (
                <p className="text-ink-3 font-semibold text-[.85rem] mt-2">
                  Тасалсан: {students.filter((s) => !present.has(s.userId)).map((s) => s.name).join(", ")}
                </p>
              )}
              <div className="flex gap-2.5 mt-6">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 font-extrabold text-ink-2 bg-bg-soft rounded-full px-5 py-3"
                >
                  Буцах
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={save}
                  className="flex-1 font-extrabold text-white bg-blue shadow-blue rounded-full px-5 py-3 disabled:opacity-50"
                >
                  {saving ? "Хадгалж байна…" : "Тийм, бүртгэх"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- the lesson list ---------------------------------------------------
  const list = showHistory ? history : lessons;

  return (
    <div className="max-w-[620px] mx-auto">
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setShowHistory(false)}
          className={`font-extrabold text-[.88rem] px-5 py-2.5 rounded-full ${
            !showHistory ? "bg-blue text-white" : "bg-bg-soft text-ink-2"
          }`}
        >
          Өнөөдөр
        </button>
        <button
          type="button"
          onClick={loadHistory}
          className={`font-extrabold text-[.88rem] px-5 py-2.5 rounded-full ${
            showHistory ? "bg-blue text-white" : "bg-bg-soft text-ink-2"
          }`}
        >
          Түүх
        </button>
      </div>

      {error && <p className="text-red-soft font-semibold text-[.88rem] mb-3">{error}</p>}
      {list === null && <p className="text-ink-3 font-semibold text-[.9rem]">Ачааллаж байна…</p>}
      {list?.length === 0 && (
        <div className="bg-surface border border-line rounded-md shadow-xs px-6 py-8 text-center">
          <span className="w-[54px] h-[54px] rounded-full bg-bg-soft text-ink-3 grid place-items-center mx-auto mb-3">
            <IconClock className="w-6 h-6" />
          </span>
          <p className="text-ink-3 font-semibold">
            {showHistory ? "Өмнөх ирц алга байна." : "Өнөөдөр танхимын хичээл алга байна."}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {list?.map((item) => (
          <button
            key={`${item.courseId}-${item.lessonIndex}`}
            type="button"
            disabled={loading}
            onClick={() => openRegister(item)}
            className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 text-left flex items-center justify-between gap-4 disabled:opacity-60"
          >
            <div className="min-w-0">
              <b className="font-extrabold text-[1rem] block truncate">{item.courseLabel}</b>
              <span className="text-ink-3 font-semibold text-[.84rem] block truncate">
                {item.date.replaceAll("-", ".")}
                {item.timeLabel && ` · ${item.timeLabel}`}
                {item.topic && ` · ${item.topic}`}
              </span>
            </div>
            <span className="shrink-0 text-right">
              {item.present === null ? (
                <span className="text-[.8rem] font-extrabold text-gold-strong bg-gold-soft px-3 py-1.5 rounded-full">
                  Бүртгээгүй
                </span>
              ) : (
                <span className="text-[.8rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full">
                  {item.present} / {item.present + (item.absent ?? 0)}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
