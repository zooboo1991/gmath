"use client";

import { useState } from "react";
import type { Lesson } from "@/lib/db";
import { IconClose } from "@/components/icons";
import { getWeekdayNameMn } from "@/lib/courseDate";
import { buildScheduleString, parseScheduleString } from "@/lib/lessonSchedule";

type AttendanceRow = { lastName: string; firstName: string; phone: string; joinedAt: string; leftAt?: string };

/**
 * The lesson-schedule editor shared by monthly courses (CourseObjectPage) and
 * yearly programs (YearlyProgramObjectPage) — same shape, same Zoom-meeting
 * infra (lesson_meetings is keyed by an opaque text id, not a `courses`
 * foreign key, so this works unmodified for either).
 */
export default function LessonScheduleEditor({
  lessons,
  onChange,
  id,
  courseZoomLink,
}: {
  lessons: Lesson[];
  onChange: (lessons: Lesson[]) => void;
  /** The owning course/program id. Omitted while unsaved — hides the Zoom-meeting-creation/attendance block, which needs a real id to call the API with. */
  id?: string;
  /** The course/program-level Zoom link, hinted as a placeholder on a lesson's own (blank) Zoom field. */
  courseZoomLink?: string;
}) {
  const addRow = () => onChange([...lessons, { topic: "", schedule: "", mode: "online" }]);
  const updateRow = (index: number, patch: Partial<Lesson>) =>
    onChange(lessons.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const removeRow = (index: number) => onChange(lessons.filter((_, i) => i !== index));

  // Keyed by lesson index rather than lesson id, matching how lesson_meetings
  // itself is keyed — see the schema comment for the tradeoff.
  const [zoomMeetingState, setZoomMeetingState] = useState<
    Record<number, { status: "loading" | "done" | "error"; joinUrl?: string; error?: string }>
  >({});

  const createZoomMeeting = async (index: number, force = false) => {
    if (!id) return;
    if (
      force &&
      !confirm(
        "Zoom meeting-ийг дахин үүсгэх үү? Энэ нь тухайн meeting Zoom дээр устсан үед л хэрэгтэй. Өмнө нь холбоосоор орсон сурагчид дараагийн удаа \"Хичээлд орох\" дарахад автоматаар шинэ холбоос авна."
      )
    )
      return;
    setZoomMeetingState((s) => ({ ...s, [index]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/admin/courses/${id}/lessons/${index}/zoom-meeting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const json = await res.json();
      if (!res.ok) {
        setZoomMeetingState((s) => ({ ...s, [index]: { status: "error", error: json.error } }));
        return;
      }
      setZoomMeetingState((s) => ({ ...s, [index]: { status: "done", joinUrl: json.meeting.joinUrl } }));
      // The tracked meeting is what students actually join through (their
      // own registrant link) — this just keeps the plain field a visible,
      // copyable reference for the teacher, and the fallback link for any
      // lesson index where tracking ever gets removed later.
      updateRow(index, { zoomLink: json.meeting.joinUrl });
    } catch {
      setZoomMeetingState((s) => ({ ...s, [index]: { status: "error", error: "Сүлжээний алдаа гарлаа" } }));
    }
  };

  const [attendanceState, setAttendanceState] = useState<
    Record<number, { status: "loading" | "done" | "error"; rows?: AttendanceRow[] }>
  >({});

  const toggleAttendance = async (index: number) => {
    if (attendanceState[index]) {
      setAttendanceState((s) => {
        const next = { ...s };
        delete next[index];
        return next;
      });
      return;
    }
    if (!id) return;
    setAttendanceState((s) => ({ ...s, [index]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/admin/courses/${id}/lessons/${index}/attendance`);
      const json = await res.json();
      if (!res.ok) {
        setAttendanceState((s) => ({ ...s, [index]: { status: "error" } }));
        return;
      }
      setAttendanceState((s) => ({ ...s, [index]: { status: "done", rows: json.attendance } }));
    } catch {
      setAttendanceState((s) => ({ ...s, [index]: { status: "error" } }));
    }
  };

  const formatMinutes = (joinedAt: string, leftAt?: string) => {
    if (!leftAt) return "одоо ч холбогдсон";
    const mins = Math.round((new Date(leftAt).getTime() - new Date(joinedAt).getTime()) / 60000);
    return `${mins} мин`;
  };

  return (
    <div className="card-flat px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-extrabold text-[1rem] text-ink">Хичээлийн хуваарь</h3>
        <button
          type="button"
          onClick={addRow}
          className="text-[.8rem] font-extrabold text-blue-strong bg-blue-soft px-3 py-1.5 rounded-full shrink-0"
        >
          + Хичээл нэмэх
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {lessons.map((lesson, i) => {
          const parsed = parseScheduleString(lesson.schedule ?? "");
          const weekday = getWeekdayNameMn(parsed.date);
          const updateSchedule = (patch: Partial<typeof parsed>) => {
            const next = { ...parsed, ...patch };
            updateRow(i, { schedule: buildScheduleString(next.date, next.startTime, next.endTime) });
          };
          const isOnline = lesson.mode !== "inperson";
          return (
            <div key={i} className="flex gap-2 items-start bg-bg-soft rounded-xs p-2.5">
              <span className="w-7 h-7 rounded-md bg-surface border border-line-2 grid place-items-center font-extrabold text-[.8rem] shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 flex flex-col gap-1.5">
                <input
                  value={lesson.topic}
                  onChange={(e) => updateRow(i, { topic: e.target.value })}
                  placeholder="Хичээлийн сэдэв"
                  className="w-full px-3 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.9rem] focus:outline-none focus:border-blue focus:bg-surface"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateRow(i, { mode: "online" })}
                    className={`text-[.78rem] font-extrabold px-2.5 py-1.5 rounded-full transition-colors ${
                      isOnline ? "text-blue-strong bg-blue-soft" : "text-ink-3 bg-bg-soft"
                    }`}
                  >
                    Онлайн
                  </button>
                  <button
                    type="button"
                    onClick={() => updateRow(i, { mode: "inperson" })}
                    className={`text-[.78rem] font-extrabold px-2.5 py-1.5 rounded-full transition-colors ${
                      !isOnline ? "text-blue-strong bg-blue-soft" : "text-ink-3 bg-bg-soft"
                    }`}
                  >
                    Танхим
                  </button>
                </div>
                <div className="flex gap-1.5 items-center flex-wrap">
                  <input
                    type="date"
                    value={parsed.date}
                    onChange={(e) => updateSchedule({ date: e.target.value })}
                    className="px-2.5 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.82rem] focus:outline-none focus:border-blue focus:bg-surface"
                  />
                  {weekday && <span className="text-[.78rem] font-bold text-blue-strong shrink-0">{weekday} гараг</span>}
                  <input
                    type="time"
                    value={parsed.startTime}
                    onChange={(e) => updateSchedule({ startTime: e.target.value })}
                    className="px-2.5 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.82rem] focus:outline-none focus:border-blue focus:bg-surface"
                  />
                  <span className="text-ink-3 font-bold">–</span>
                  <input
                    type="time"
                    value={parsed.endTime}
                    onChange={(e) => updateSchedule({ endTime: e.target.value })}
                    className="px-2.5 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.82rem] focus:outline-none focus:border-blue focus:bg-surface"
                  />
                </div>
                <div className={`grid grid-cols-1 gap-1.5 ${isOnline ? "sm:grid-cols-2" : ""}`}>
                  {isOnline && (
                    <input
                      value={lesson.zoomLink ?? ""}
                      onChange={(e) => updateRow(i, { zoomLink: e.target.value })}
                      placeholder={courseZoomLink ? "Zoom (сургалтын ерөнхийг ашиглана)" : "Zoom холбоос"}
                      className="w-full px-3 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.82rem] focus:outline-none focus:border-blue focus:bg-surface"
                    />
                  )}
                  <input
                    value={lesson.recordingLink ?? ""}
                    onChange={(e) => updateRow(i, { recordingLink: e.target.value })}
                    placeholder="Бичлэгийн холбоос (хичээл орсны дараа)"
                    className="w-full px-3 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.82rem] focus:outline-none focus:border-blue focus:bg-surface"
                  />
                </div>
                {id && isOnline && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={zoomMeetingState[i]?.status === "loading"}
                        onClick={() => createZoomMeeting(i)}
                        className="text-[.78rem] font-extrabold text-blue-strong bg-blue-soft px-3 py-1.5 rounded-full disabled:opacity-50"
                      >
                        {zoomMeetingState[i]?.status === "loading"
                          ? "Үүсгэж байна…"
                          : "Ирц бүртгэх Zoom meeting үүсгэх"}
                      </button>
                      {lesson.zoomLink && (
                        <button
                          type="button"
                          disabled={zoomMeetingState[i]?.status === "loading"}
                          onClick={() => createZoomMeeting(i, true)}
                          className="text-[.78rem] font-extrabold text-ink-2 bg-bg-soft px-3 py-1.5 rounded-full disabled:opacity-50"
                        >
                          Дахин үүсгэх
                        </button>
                      )}
                      {zoomMeetingState[i]?.status === "done" && (
                        <span className="text-[.78rem] font-bold text-green">
                          ✓ Үүслээ — сурагч бүрд хувийн холбоос өгнө
                        </span>
                      )}
                      {zoomMeetingState[i]?.status === "error" && (
                        <span className="text-[.78rem] font-bold text-red-soft">
                          {zoomMeetingState[i]?.error ?? "Алдаа гарлаа"}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleAttendance(i)}
                        className="text-[.78rem] font-extrabold text-ink-2 bg-bg-soft px-3 py-1.5 rounded-full"
                      >
                        {attendanceState[i] ? "Ирц нуух" : "Ирц харах"}
                      </button>
                    </div>
                    {attendanceState[i]?.status === "loading" && (
                      <span className="text-[.78rem] font-semibold text-ink-3">Ачааллаж байна…</span>
                    )}
                    {attendanceState[i]?.status === "error" && (
                      <span className="text-[.78rem] font-bold text-red-soft">Алдаа гарлаа</span>
                    )}
                    {attendanceState[i]?.status === "done" && (
                      <div className="bg-surface border border-line-2 rounded-xs px-3 py-2">
                        {attendanceState[i]?.rows?.length === 0 ? (
                          <span className="text-[.78rem] font-semibold text-ink-3">
                            Ирц бүртгэгдээгүй байна.
                          </span>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {attendanceState[i]?.rows?.map((r, ri) => (
                              <li key={ri} className="text-[.8rem] font-semibold flex justify-between gap-3">
                                <span>
                                  {r.lastName} {r.firstName} · {r.phone}
                                </span>
                                <span className="text-ink-3 shrink-0">
                                  {new Date(r.joinedAt).toLocaleTimeString("mn-MN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}{" "}
                                  · {formatMinutes(r.joinedAt, r.leftAt)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label="Хичээл устгах"
                className="w-7 h-7 rounded-full bg-surface border border-line-2 grid place-items-center shrink-0 mt-0.5"
              >
                <IconClose className="w-3 h-3 text-ink-3" />
              </button>
            </div>
          );
        })}
        {lessons.length === 0 && <p className="text-ink-3 font-semibold text-[.85rem]">Хичээл нэмээгүй байна.</p>}
      </div>
    </div>
  );
}
