"use client";

import { useState } from "react";
import type { Lesson } from "@/lib/db";
import { IconCheck, IconClose, IconDocument } from "@/components/icons";
import { getWeekdayNameMn } from "@/lib/courseDate";
import { buildScheduleString, parseScheduleString } from "@/lib/lessonSchedule";
import { parseBunnyVideoId } from "@/lib/bunnyVideo";
import { formatMb } from "@/lib/imageResize";
import { isPdf, looksLikePdf, MAX_NOTE_BYTES, shrinkPdf } from "@/lib/pdfShrink";
import { apiError, readJson } from "@/lib/fetchJson";

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
    Record<
      number,
      {
        status: "loading" | "done" | "error";
        joinUrl?: string;
        error?: string;
        /** The server found a meeting row even though the update failed. */
        hasMeeting?: boolean;
        /** What the server actually did, so "✓ Үүслээ" can stop being a guess. */
        action?: "created" | "updated" | "recreated";
      }
    >
  >({});

  // Per-lesson upload state for the notes PDF: shrinking is slow enough on a
  // 30 MB scan that "nothing is happening" would otherwise be the whole UX.
  const [noteState, setNoteState] = useState<
    Record<number, { status: "shrinking" | "uploading" | "error"; message?: string }>
  >({});
  const setNote = (index: number, value: { status: "shrinking" | "uploading" | "error"; message?: string } | null) =>
    setNoteState((s) => {
      const next = { ...s };
      if (value) next[index] = value;
      else delete next[index];
      return next;
    });

  /**
   * Shrink in the browser, then PUT straight to Supabase Storage.
   *
   * The upload deliberately does not go through a route handler: a serverless
   * request body is capped at 4.5 MB on Vercel, which a scanned set of notes
   * exceeds even after shrinking. The route only mints the signed URL.
   */
  const uploadNote = async (index: number, file: File) => {
    if (!isPdf(file) || !(await looksLikePdf(file))) {
      setNote(index, { status: "error", message: "Зөвхөн PDF файл оруулна уу" });
      return;
    }
    if (file.size > MAX_NOTE_BYTES) {
      setNote(index, { status: "error", message: `Файл хэт том байна (${formatMb(file.size)}). 50MB-ээс ихгүй.` });
      return;
    }

    let toUpload = file;
    let sizeNote = formatMb(file.size);
    try {
      setNote(index, { status: "shrinking", message: "Уншиж байна…" });
      const result = await shrinkPdf(file, (page, total) =>
        setNote(index, { status: "shrinking", message: `Багасгаж байна… ${page}/${total}` })
      );
      toUpload = result.file;
      sizeNote = result.changed
        ? `${formatMb(result.before)} → ${formatMb(result.after)}`
        : formatMb(result.after);
    } catch (err) {
      // A PDF pdfjs cannot render is still a PDF a student can open — upload
      // the original rather than refusing the teacher's file outright.
      console.error("[lesson-note] shrink failed, uploading as-is", err);
    }

    try {
      setNote(index, { status: "uploading", message: `Байршуулж байна… ${sizeNote}` });
      const res = await fetch("/api/admin/lesson-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size: toUpload.size }),
      });
      const json = await readJson<{ path: string; signedUrl: string }>(res);
      if (!res.ok || !json.signedUrl || !json.path) {
        setNote(index, { status: "error", message: apiError(res, json, "Байршуулахад алдаа гарлаа") });
        return;
      }

      const put = await fetch(json.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: toUpload,
      });
      if (!put.ok) {
        setNote(index, { status: "error", message: "Файл байршуулж чадсангүй. Дахин оролдоно уу." });
        return;
      }

      const previous = lessons[index]?.noteFile;
      updateRow(index, { noteFile: json.path, noteSize: toUpload.size });
      setNote(index, null);
      // The row now points at the new file, so the old one is unreachable.
      if (previous) void fetch("/api/admin/lesson-note", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: previous }),
      });
    } catch {
      setNote(index, { status: "error", message: "Сүлжээний алдаа гарлаа. Дахин оролдоно уу." });
    }
  };

  const removeNote = async (index: number) => {
    const path = lessons[index]?.noteFile;
    if (!path) return;
    if (!confirm("Хичээлийн тэмдэглэлийг хасах уу?")) return;
    updateRow(index, { noteFile: undefined, noteSize: undefined });
    await fetch("/api/admin/lesson-note", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }).catch(() => undefined);
  };

  const openNote = async (index: number) => {
    const path = lessons[index]?.noteFile;
    if (!path) return;
    const res = await fetch(`/api/admin/lesson-note?path=${encodeURIComponent(path)}`);
    const json = await readJson<{ url: string }>(res);
    if (res.ok && json.url) window.open(json.url, "_blank", "noreferrer");
    else setNote(index, { status: "error", message: apiError(res, json, "Нээхэд алдаа гарлаа") });
  };

  const createZoomMeeting = async (index: number, force = false) => {
    if (!id) return;
    if (
      force &&
      !confirm(
        "Zoom meeting-ийг ШИНЭЭР үүсгэх үү? Цаг өөрчлөгдсөн бол үүний оронд «Zoom цагийг шинэчлэх» дарж болно — тэгвэл холбоос хэвээрээ үлдэнэ.\n\nШинээр үүсгэвэл хуучин холбоос хүчингүй болно. Сурагчид дараагийн удаа \"Хичээлд орох\" дарахад автоматаар шинэ холбоос авна. Meeting нь Zoom дээр устсан үед энэ хэрэгтэй."
      )
    )
      return;
    setZoomMeetingState((s) => ({ ...s, [index]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/admin/courses/${id}/lessons/${index}/zoom-meeting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The schedule as this form currently shows it. The server compares it
        // with the saved lesson and refuses if they differ, so a meeting can
        // never be set to a time the admin only *thinks* they saved.
        body: JSON.stringify({ force, schedule: lessons[index]?.schedule ?? "" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setZoomMeetingState((s) => ({
          ...s,
          [index]: { status: "error", error: json.error, hasMeeting: json.hasMeeting === true },
        }));
        return;
      }
      setZoomMeetingState((s) => ({
        ...s,
        [index]: { status: "done", joinUrl: json.meeting.joinUrl, action: json.action },
      }));
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
                    placeholder="Бичлэг: Bunny видеоны ID эсвэл холбоос"
                    className="w-full px-3 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface-2 text-ink font-semibold text-[.82rem] focus:outline-none focus:border-blue focus:bg-surface"
                  />
                  {/* Tells the teacher which of the two behaviours this row will
                      get before they save, instead of finding out from a
                      student. */}
                  {lesson.recordingLink?.trim() ? (
                    parseBunnyVideoId(lesson.recordingLink) ? (
                      <span className="text-[.75rem] font-extrabold text-green">
                        ✓ Bunny — сайт дээрээ тоглоно
                      </span>
                    ) : (
                      <span className="text-[.75rem] font-semibold text-ink-3">
                        Гадаад холбоос — шинэ цонхонд нээгдэнэ
                      </span>
                    )
                  ) : null}

                  {/* The lesson's notes: the problems worked through in class,
                      as one PDF. Uploaded per lesson rather than per course
                      because that is how a student looks for them — beside the
                      recording of the lesson they missed. */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {lesson.noteFile ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 text-[.75rem] font-extrabold text-green">
                          <IconCheck className="w-3 h-3" /> Тэмдэглэл
                          {lesson.noteSize ? ` · ${formatMb(lesson.noteSize)}` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => openNote(i)}
                          className="text-[.75rem] font-extrabold text-blue-strong"
                        >
                          Харах
                        </button>
                        <button
                          type="button"
                          onClick={() => removeNote(i)}
                          className="text-[.75rem] font-bold text-ink-3 hover:text-red-soft"
                        >
                          Хасах
                        </button>
                      </>
                    ) : (
                      <label className="inline-flex items-center gap-1.5 text-[.75rem] font-extrabold text-ink-2 bg-bg-soft px-2.5 py-1.5 rounded-full cursor-pointer">
                        <IconDocument className="w-3 h-3" /> Тэмдэглэл (PDF)
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            // Cleared so picking the same file again re-runs.
                            e.target.value = "";
                            if (file) void uploadNote(i, file);
                          }}
                        />
                      </label>
                    )}
                    {noteState[i] && (
                      <span
                        className={`text-[.75rem] font-semibold ${
                          noteState[i].status === "error" ? "text-red-soft" : "text-ink-3"
                        }`}
                      >
                        {noteState[i].message}
                      </span>
                    )}
                  </div>
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
                          ? "Түр хүлээнэ үү…"
                          : lesson.zoomLink
                            ? "Zoom цагийг шинэчлэх"
                            : "Ирц бүртгэх Zoom meeting үүсгэх"}
                      </button>
                      {(lesson.zoomLink || zoomMeetingState[i]?.hasMeeting) && (
                        <button
                          type="button"
                          disabled={zoomMeetingState[i]?.status === "loading"}
                          onClick={() => createZoomMeeting(i, true)}
                          className="text-[.78rem] font-extrabold text-ink-2 bg-bg-soft px-3 py-1.5 rounded-full disabled:opacity-50"
                        >
                          Шинээр үүсгэх
                        </button>
                      )}
                      {zoomMeetingState[i]?.status === "done" && (
                        <span className="text-[.78rem] font-bold text-green">
                          {zoomMeetingState[i]?.action === "updated"
                            ? "✓ Zoom дээрх цаг шинэчлэгдлээ — холбоос хэвээрээ"
                            : zoomMeetingState[i]?.action === "recreated"
                              ? "✓ Шинэ meeting үүслээ — хуучин холбоос хүчингүй болов"
                              : "✓ Үүслээ — сурагч бүрд хувийн холбоос өгнө"}
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
