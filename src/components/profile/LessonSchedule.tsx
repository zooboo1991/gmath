"use client";

import { useState, useSyncExternalStore } from "react";
import RecordingPlayer from "@/components/profile/RecordingPlayer";
import LessonNoteButton from "@/components/profile/LessonNoteButton";
import { IconClock, IconVideoCamera, IconLocation } from "@/components/icons";
import type { RegistrationWithGroup } from "@/lib/db";
import { getLessonStates, type LessonWithState } from "@/lib/lessonSchedule";
import { formatMb } from "@/lib/imageResize";

/**
 * The Zoom room for a paid-up course. The live/next calculation runs here, in
 * the browser, so it uses the student's own clock rather than the server's UTC.
 */
const TICK_MS = 30_000;

/**
 * The wall clock as an external store: null while rendering on the server (so
 * hydration matches), then ticking every half minute so a student who leaves
 * the page open sees the button go live when the lesson actually starts.
 */
export function useNow(): Date | null {
  const tick = useSyncExternalStore(
    (onStoreChange) => {
      const id = setInterval(onStoreChange, TICK_MS);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / TICK_MS),
    () => null
  );
  return tick === null ? null : new Date();
}

/**
 * The course's lessons, each offering exactly what is useful at that moment:
 * a recording once the lesson is over, the room while it is on, and nothing at
 * all for lessons that have not come round yet. Joining lives here rather than
 * in a separate card above, so there is one place to look.
 */
/**
 * Онлайн / Танхим. Lessons saved before the field existed are online — the
 * schedule editor assumes the same, so the two agree.
 */
export function LessonModeTag({ mode }: { mode?: "online" | "inperson" }) {
  const inPerson = mode === "inperson";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[.68rem] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
        inPerson ? "text-gold-strong bg-gold-soft" : "text-blue-strong bg-blue-soft"
      }`}
    >
      {inPerson ? (
        <>
          <IconLocation className="w-[11px] h-[11px]" /> Танхим
        </>
      ) : (
        <>
          <IconVideoCamera className="w-[11px] h-[11px]" /> Онлайн
        </>
      )}
    </span>
  );
}

export default function LessonSchedule({ registration }: { registration: RegistrationWithGroup }) {
  const now = useNow();
  const lessons = registration.lessons ?? [];

  if (lessons.length === 0) {
    // No schedule entered yet. If the course still has a room, keep a way in —
    // otherwise removing the card above would have locked these students out.
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap bg-bg-soft rounded-sm px-4 py-3">
        <span className="flex items-center gap-2.5 text-ink-2 font-bold text-[.9rem]">
          <IconClock className="w-[18px] h-[18px] shrink-0 text-ink-3" /> Хуваарь тун удахгүй
        </span>
        {registration.zoomLink && (
          <a
            href={registration.zoomLink}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 font-extrabold text-[.85rem] text-white bg-blue shadow-blue rounded-full px-5 py-2.5 transition-transform hover:-translate-y-0.5"
          >
            <IconVideoCamera className="w-4 h-4" /> Хичээлд орох
          </a>
        )}
      </div>
    );
  }

  // Until hydration `now` is null, so every row renders in its neutral state
  // and the server and client markup match.
  const states = now ? getLessonStates(lessons, now) : null;

  return (
    <div className="bg-bg-soft rounded-sm px-4 py-3.5">
      <div className="mb-2.5">
        <b className="font-extrabold text-[.9rem] block">Хичээлийн хуваарь ({lessons.length})</b>
        {/* Some students join from the Zoom app by ID rather than the link. */}
        {(registration.zoomMeetingId || registration.zoomPasscode) && (
          <span className="block text-[.78rem] font-semibold text-ink-3 mt-0.5">
            {registration.zoomMeetingId && `ID: ${registration.zoomMeetingId}`}
            {registration.zoomMeetingId && registration.zoomPasscode && " · "}
            {registration.zoomPasscode && `Код: ${registration.zoomPasscode}`}
          </span>
        )}
      </div>
      <div className="flex flex-col">
        {lessons.map((lesson, i) => {
          const info = states?.[i];
          return (
            // The topic gets the full row width; the date and the action share
            // the line below it, so nothing has to be truncated on a phone.
            <div key={i} className="flex gap-3 py-2.5 border-b border-line last:border-0">
              <span
                className={`w-6 h-6 rounded-md grid place-items-center font-extrabold text-[.72rem] shrink-0 mt-0.5 ${
                  info?.state === "live"
                    ? "bg-green text-white"
                    : "bg-surface text-ink-2 border border-line-2"
                }`}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[.88rem] text-ink">{lesson.topic}</span>
                  {/* Where the lesson happens decides what the family does that
                      evening — it belongs next to the topic, not buried in a
                      link they only see once the room opens. */}
                  <LessonModeTag mode={lesson.mode} />
                </span>
                <div className="flex items-center justify-between gap-3 flex-wrap mt-1">
                  <span className="text-[.78rem] font-semibold text-ink-3">
                    {info?.dateLabel}
                    {info?.dateLabel && info?.timeLabel && " · "}
                    {info?.timeLabel}
                  </span>
                  <LessonAction info={info} courseId={registration.programId} lessonIndex={i} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Entirely driven by what the teacher typed on the lesson itself — no
 * date gating and no falling back to the course-level room. A lesson shows a
 * join button only once it has been given its own Zoom link, so the schedule
 * reads as a checklist of what has actually been set up.
 * The one date check that remains: a *past* lesson without a recording says
 * so instead of offering a join button to a room that has already closed.
 */
export function LessonAction({
  info,
  courseId,
  lessonIndex,
}: {
  info: LessonWithState | undefined;
  courseId: string;
  lessonIndex: number;
}) {
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  if (!info) return null;

  // The notes sit beside whatever else the lesson offers rather than replacing
  // it: a lesson can have notes while its recording is still being uploaded,
  // and a student who attended live wants the notes without the video at all.
  const note = info.lesson.noteFile ? (
    <LessonNoteButton
      courseId={courseId}
      lessonIndex={lessonIndex}
      sizeLabel={info.lesson.noteSize ? formatMb(info.lesson.noteSize) : undefined}
    />
  ) : null;
  const withNote = (action: React.ReactNode) =>
    note ? (
      <span className="flex items-center justify-end gap-2 flex-wrap shrink-0">
        {action}
        {note}
      </span>
    ) : (
      action
    );

  if (info.lesson.recordingLink) {
    // The link itself is no longer rendered: RecordingPlayer asks the server
    // for a signed, expiring URL and plays it here on the page.
    return withNote(
      <RecordingPlayer courseId={courseId} lessonIndex={lessonIndex} topic={info.lesson.topic} />
    );
  }

  if (info.state === "past") {
    return withNote(<span className="shrink-0 font-bold text-[.78rem] text-ink-3">Бичлэг удахгүй</span>);
  }

  if (!info.lesson.zoomLink) return note;

  // The actual join link is resolved on click rather than rendered as a
  // plain href — a lesson with a tracked Zoom meeting needs a personal,
  // per-student registrant link (not the shared one), which only the
  // server can hand out and only once, on demand.
  const join = async () => {
    setJoining(true);
    setJoinError(null);
    // Claimed inside the tap itself. Safari on a phone refuses window.open
    // once the gesture that triggered it has expired — which is exactly what
    // happens while the fetch below runs, and why the button used to look
    // like it did nothing at all on an iPhone.
    const room = window.open("", "_blank");
    try {
      const res = await fetch("/api/lessons/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, lessonIndex }),
      });
      const json = await res.json();
      if (!res.ok || !json.joinUrl) {
        room?.close();
        setJoinError(json.error ?? "Алдаа гарлаа, дахин дарна уу");
        return;
      }
      if (room) {
        room.location.href = json.joinUrl;
      } else {
        // The browser refused the new tab anyway — go there in this one
        // rather than leaving the student staring at an unchanged page.
        window.location.href = json.joinUrl;
      }
    } catch {
      room?.close();
      setJoinError("Сүлжээний алдаа. Дахин дарна уу");
    } finally {
      setJoining(false);
    }
  };

  const isLive = info.state === "live";
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={joining}
        onClick={join}
        className={`shrink-0 inline-flex items-center gap-1.5 font-extrabold text-[.85rem] text-white rounded-full px-5 py-2.5 transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${
          isLive ? "bg-green shadow-sm" : "bg-blue shadow-blue"
        }`}
      >
        <IconVideoCamera className="w-4 h-4" /> {joining ? "Түр хүлээнэ үү…" : "Хичээлд орох"}
        {!joining && isLive ? " →" : ""}
      </button>
      {joinError && <span className="text-[.75rem] font-bold text-red-soft text-right">{joinError}</span>}
    </span>
  );
}

