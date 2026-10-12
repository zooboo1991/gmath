"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiError, readJson } from "@/lib/fetchJson";
import type { CourseTask } from "@/lib/courseTasks";

/**
 * A course's homework and test papers on its admin page: generated from the
 * timetable in one click, then each filled with problems and opened on its
 * own page. Times are Ulaanbaatar's.
 */

const WEEKDAYS = ["Ня", "Да", "Мя", "Лх", "Пү", "Ба", "Бя"];
const local = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000);
const label = (opensAt: string, closesAt: string) => {
  const o = local(opensAt);
  const c = local(closesAt);
  const md = (d: Date) => d.toISOString().slice(5, 10).replace("-", ".");
  const sameDay = o.toISOString().slice(0, 10) === c.toISOString().slice(0, 10);
  return `${md(o)} ${WEEKDAYS[o.getUTCDay()]} ${o.toISOString().slice(11, 16)}–${sameDay ? "" : `${md(c)} `}${c.toISOString().slice(11, 16)}`;
};

const STATUS: Record<string, { text: string; tone: string }> = {
  draft: { text: "Ноорог", tone: "text-gold-strong bg-gold-soft" },
  open: { text: "Нээлттэй", tone: "text-green bg-green-soft" },
  closed: { text: "Хаалттай", tone: "text-ink-3 bg-bg-soft" },
};

export default function CourseTasksAdmin({ courseId, canEdit }: { courseId: string; canEdit: boolean }) {
  const [tasks, setTasks] = useState<CourseTask[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/courses/${courseId}/tasks`)
      .then(async (res) => {
        const json = await readJson<{ tasks: CourseTask[] }>(res);
        setTasks(res.ok ? (json.tasks ?? []) : []);
        if (!res.ok) setError(apiError(res, json, "Даалгаврыг ачаалж чадсангүй"));
      })
      .catch(() => {
        setTasks([]);
        setError("Сүлжээний алдаа гарлаа. Хуудсаа дахин ачаална уу.");
      });
  }, [courseId]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/tasks`, { method: "POST" });
      const json = await readJson<{ tasks: CourseTask[]; created: number; existing: number }>(res);
      if (!res.ok) {
        setError(apiError(res, json, "Үүсгэхэд алдаа гарлаа"));
        return;
      }
      setTasks(json.tasks ?? []);
      setNotice(json.created ? `${json.created} даалгавар, сорил үүслээ.` : "Хуваарийн бүх даалгавар аль хэдийн үүссэн байна.");
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const ready = tasks?.filter((t) => t.status === "open").length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-ink-2 font-semibold text-[.9rem] leading-[1.6] max-w-[56ch]">
          «7 хоногийн хуваарь»-ийн «Даалгавар», «Сорил» мөр бүрээр долоо хоног тутам нэг даалгавар үүснэ. Даалгавар бүрт
          бодлогоо сонгоод «Нээх» дарна — нээгдээгүй даалгаврыг сурагч эхлүүлэх боломжгүй.
        </p>
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={generate}
            className="font-extrabold text-[.85rem] text-white bg-blue rounded-full px-5 py-2.5 disabled:opacity-50"
          >
            {busy ? "…" : "Хуваариас үүсгэх"}
          </button>
        )}
      </div>
      {notice && <p className="text-green font-bold text-[.9rem]">{notice}</p>}
      {error && <p className="text-red-soft font-bold text-[.9rem]">{error}</p>}
      {tasks === null ? (
        <p className="text-ink-3 font-semibold">Ачаалж байна…</p>
      ) : tasks.length === 0 ? (
        <p className="text-ink-3 font-semibold">Даалгавар, сорил үүсээгүй байна.</p>
      ) : (
        <>
          <p className="text-ink-3 font-bold text-[.85rem]">{`${tasks.length} даалгавар, сорил · ${ready} нь нээлттэй`}</p>
          <div className="flex flex-col gap-2">
            {tasks.map((t) => {
              const st = STATUS[t.status] ?? STATUS.draft;
              return (
                <Link
                  key={t.id}
                  href={`/admin/course-tasks/${t.id}`}
                  className="bg-surface border border-line rounded-md px-4 py-3 flex items-center gap-3 flex-wrap hover:border-blue"
                >
                  <span
                    className={`text-[.72rem] font-extrabold uppercase tracking-[.06em] px-2.5 py-1 rounded-full ${
                      t.kind === "test" ? "text-gold-strong bg-gold-soft" : "text-blue-strong bg-blue-soft"
                    }`}
                  >
                    {t.kind === "test" ? "Сорил" : "Даалгавар"}
                  </span>
                  <b className="font-extrabold text-[.92rem] min-w-0 flex-1">{t.title}</b>
                  <span className="text-[.82rem] font-semibold text-ink-3 tabular-nums">{label(t.opensAt, t.closesAt)}</span>
                  <span className="text-[.82rem] font-bold text-ink-2">{`${t.problemCount} бодлого`}</span>
                  <span className={`text-[.78rem] font-extrabold px-2.5 py-1 rounded-full ${st.tone}`}>{st.text}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
