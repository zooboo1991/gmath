"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconCheckCircle, IconClock, IconPencil, IconTarget } from "@/components/icons";
import { apiError, readJson } from "@/lib/fetchJson";
import type { StudentTask, TaskState } from "@/lib/courseTasks";

/**
 * A course's homework and tests, in the order they open, each with what the
 * child can do with it now — start, carry on, wait for the marks, read them.
 * Times are Mongolia's (UTC+8), whatever the device's clock says.
 */

const WEEKDAYS = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];

/** "10.20 (Мягмар) 09:00–21:00" in Ulaanbaatar time. */
function windowLabel(opensAt: string, closesAt: string): string {
  const local = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000);
  const o = local(opensAt);
  const c = local(closesAt);
  const hm = (d: Date) => d.toISOString().slice(11, 16);
  const md = (d: Date) => d.toISOString().slice(5, 10).replace("-", ".");
  const sameDay = o.toISOString().slice(0, 10) === c.toISOString().slice(0, 10);
  return `${md(o)} (${WEEKDAYS[o.getUTCDay()]}) ${hm(o)}–${sameDay ? "" : `${md(c)} `}${hm(c)}`;
}

const STATE: Record<TaskState, { label: string; tone: string }> = {
  upcoming: { label: "Нээгдээгүй", tone: "text-ink-3 bg-bg-soft" },
  preparing: { label: "Бэлтгэгдэж байна", tone: "text-ink-3 bg-bg-soft" },
  open: { label: "Нээлттэй", tone: "text-blue-strong bg-blue-soft" },
  in_progress: { label: "Бодож байна", tone: "text-gold-strong bg-gold-soft" },
  submitted: { label: "Илгээсэн — засагдаж байна", tone: "text-green bg-green-soft" },
  graded: { label: "Дүн гарсан", tone: "text-green bg-green-soft" },
  missed: { label: "Илгээгээгүй", tone: "text-red-soft bg-[oklch(0.95_0.03_25)]" },
};

export default function CourseTasksTab({ tasks }: { tasks: StudentTask[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (task: StudentTask) => {
    setBusy(task.examId);
    setError(null);
    try {
      const res = await fetch(`/api/course-tasks/${task.examId}/start`, { method: "POST" });
      const json = await readJson<{ assessmentId: string }>(res);
      if (!res.ok || !json.assessmentId) {
        setError(apiError(res, json, "Эхлүүлэхэд алдаа гарлаа"));
        router.refresh();
        return;
      }
      router.push(`/assessment/${json.assessmentId}/solve`);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(null);
    }
  };

  if (tasks.length === 0) {
    return <p className="text-ink-3 font-semibold py-8 text-center">Даалгавар, сорил хараахан алга байна.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2 font-medium text-[.92rem] leading-[1.6]">
        Даалгавар, сорил тус бүр өөрийн цагт нээгдэнэ. Бодлогоо бодоод бодолтын зургаа оруулж, хаагдахаас өмнө
        «Илгээх» дарна — илгээгээгүй бол тооцогдохгүй.
      </p>
      {error && <p className="text-red-soft font-bold text-[.9rem]">{error}</p>}
      {tasks.map((t) => {
        const look = STATE[t.state];
        const isTest = t.kind === "test";
        return (
          <div key={t.examId} className="bg-surface border border-line rounded-md px-4 py-3.5 flex items-center gap-3.5 flex-wrap">
            <span
              className={`w-10 h-10 rounded-[12px] grid place-items-center shrink-0 ${
                isTest ? "bg-gold-soft text-gold-strong" : "bg-green-soft text-green"
              }`}
            >
              {isTest ? <IconTarget className="w-5 h-5" /> : <IconPencil className="w-5 h-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block font-extrabold text-ink text-[.98rem] leading-[1.35]">{t.title}</b>
              <span className="flex items-center gap-1.5 text-[.84rem] font-semibold text-ink-3 mt-0.5">
                <IconClock className="w-3.5 h-3.5 shrink-0" /> {windowLabel(t.opensAt, t.closesAt)}
              </span>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {t.state === "graded" && t.max !== undefined ? (
                <span className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full">
                  <IconCheckCircle className="w-3.5 h-3.5" /> {`${t.total ?? 0} / ${t.max} оноо`}
                </span>
              ) : (
                <span className={`text-[.8rem] font-extrabold px-3 py-1.5 rounded-full ${look.tone}`}>{look.label}</span>
              )}
              {t.state === "open" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => start(t)}
                  className="font-extrabold text-[.85rem] text-white bg-blue rounded-full px-4 py-2 disabled:opacity-50"
                >
                  {busy === t.examId ? "…" : "Эхлэх →"}
                </button>
              )}
              {t.state === "in_progress" && t.assessmentId && (
                <Link
                  href={`/assessment/${t.assessmentId}/solve`}
                  className="font-extrabold text-[.85rem] text-white bg-blue rounded-full px-4 py-2"
                >
                  Үргэлжлүүлэх →
                </Link>
              )}
              {(t.state === "submitted" || t.state === "graded") && t.assessmentId && (
                <Link
                  href={`/profile/assessment?a=${t.assessmentId}`}
                  className="font-extrabold text-[.85rem] text-blue-strong bg-blue-soft rounded-full px-4 py-2"
                >
                  {t.state === "graded" ? "Дүн харах" : "Харах"}
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
