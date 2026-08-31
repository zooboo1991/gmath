"use client";

import { useState, useSyncExternalStore } from "react";
import RecordingPlayer from "@/components/profile/RecordingPlayer";
import LessonNoteButton from "@/components/profile/LessonNoteButton";
import { IconClock, IconVideoCamera, IconLocation, IconPlayBox } from "@/components/icons";
import type { RegistrationWithGroup } from "@/lib/db";
import { formatTimeUntil, getLessonStates, type LessonWithState } from "@/lib/lessonSchedule";
import { formatMb } from "@/lib/imageResize";

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

/** Хичээлийн дугаар, сэдэв, огноо, үйлдэл — жагсаалтын нэг мөр. */
function LessonRow({
  info,
  lesson,
  lessonIndex,
  courseId,
}: {
  info: LessonWithState | undefined;
  lesson: { topic: string; mode?: "online" | "inperson" };
  lessonIndex: number;
  courseId: string;
}) {
  return (
    // The topic gets the full row width; the date and the action share
    // the line below it, so nothing has to be truncated on a phone.
    <div className="flex gap-3 py-2.5 border-b border-line last:border-0">
      <span
        className={`w-6 h-6 rounded-md grid place-items-center font-extrabold text-[.72rem] shrink-0 mt-0.5 ${
          info?.state === "live"
            ? "bg-green text-white"
            : "bg-surface text-ink-2 border border-line-2"
        }`}
      >
        {lessonIndex + 1}
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
          <LessonAction info={info} courseId={courseId} lessonIndex={lessonIndex} />
        </div>
      </div>
    </div>
  );
}

/**
 * Хамгийн ойрын хичээл — жагсаалтын нэг мөр байхаас илүү зүйл.
 *
 * Сурагчийн энэ хуудсанд ирж байгаа гол шалтгаан нь "дараагийн хичээл
 * хэзээ, хаанаас орох вэ" гэсэн асуулт тул түүнийг мөрүүдийн дунд
 * төөрүүлэхгүй, дээр нь тодоор гаргана.
 */
function NextLessonCard({
  info,
  lessonIndex,
  courseId,
}: {
  info: LessonWithState;
  lessonIndex: number;
  courseId: string;
}) {
  const live = info.state === "live";
  const until = info.startsInMs !== undefined ? formatTimeUntil(info.startsInMs) : "";

  // Zoom холбоос ч, тэмдэглэл ч ороогүй хичээл дээр LessonAction юу ч
  // буцаадаггүй тул баруун баганыг огт гаргахгүй.
  const hasAction = Boolean(
    info.lesson.zoomLink || info.lesson.recordingLink || info.lesson.noteFile
  );

  return (
    <div
      className={`rounded-md px-4 py-4 border ${
        live ? "bg-green-soft border-green/30" : "bg-surface border-blue-soft-2 shadow-xs"
      }`}
    >
      {/* Товч нь мэдээллийнхээ хажууд суудаг: доор нь тусдаа мөр болгоход
          картын ёроолд ганцаараа үлдэж, юуны товч болох нь тасардаг.
          Нарийн дэлгэц дээр л доошоо буун, гэхдээ тоолуурын шууд дор. */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 text-[.72rem] font-extrabold tracking-[.06em] uppercase ${
              live ? "text-green" : "text-blue-strong"
            }`}
          >
            {live ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green" /> Хичээл яг одоо болж байна
              </>
            ) : (
              <>
                <IconClock className="w-3.5 h-3.5" /> Дараагийн хичээл
              </>
            )}
          </span>

          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <b className="font-extrabold text-[1.05rem]">
              {lessonIndex + 1}. {info.lesson.topic}
            </b>
            <LessonModeTag mode={info.lesson.mode} />
          </div>

          <span className="block text-[.85rem] font-semibold text-ink-2 mt-0.5">
            {info.dateLabel}
            {info.dateLabel && info.timeLabel && " · "}
            {info.timeLabel}
          </span>

          {/* Тоолуур: "3 цаг 20 минут" гэдэг нь "маргааш" гэхээс хамаагүй
              ойлгомжтой — гэрийн хүн бэлдэх цагаа шууд мэднэ. */}
          {!live && until && (
            <span className="block font-extrabold text-[.95rem] text-blue-strong mt-2">
              {`Хичээл эхлэхэд ${until} үлдлээ`}
            </span>
          )}
        </div>

        {hasAction && (
          <div className="shrink-0">
            <LessonAction info={info} courseId={courseId} lessonIndex={lessonIndex} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Хичээлүүдийг хоёр байдлаар харуулна:
 *
 * - `upcoming` — болоогүй хичээлүүд, хамгийн ойрынх нь дээрээ тодроод.
 * - `past` — өнгөрсөн хичээлүүд, сүүлд болсон нь эхэндээ. Нөхөж үзэх
 *   хүн хамгийн сүүлийн хичээлээ хайдаг болохоос эхнийхийг биш.
 *
 * `nowIso` нь серверийн цаг: эхний рендер сервер, браузер хоёрт яг адил
 * гарч, hydration зөрөхгүй байх үүрэгтэй. Дараа нь браузерын цаг авна.
 */
export default function LessonSchedule({
  registration,
  show,
  nowIso,
}: {
  registration: RegistrationWithGroup;
  show: "upcoming" | "past";
  nowIso: string;
}) {
  const clientNow = useNow();
  const now = clientNow ?? new Date(nowIso);
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

  const states = getLessonStates(lessons, now);
  const numbered = states.map((info, lessonIndex) => ({ info, lessonIndex }));

  if (show === "past") {
    const done = numbered.filter(({ info }) => info.state === "past").reverse();
    if (done.length === 0) {
      return (
        <div className="flex items-center gap-3 bg-bg-soft border border-line rounded-sm px-4 py-5 text-ink-2">
          <IconPlayBox className="w-6 h-6 shrink-0 text-ink-3" />
          <span className="font-semibold text-[.9rem]">
            Болж өнгөрсөн хичээл хараахан алга байна.
          </span>
        </div>
      );
    }
    return (
      <div className="bg-bg-soft rounded-sm px-4 py-3.5">
        <b className="font-extrabold text-[.9rem] block mb-2.5">
          {`Болсон хичээлүүд (${done.length})`}
        </b>
        <div className="flex flex-col">
          {done.map(({ info, lessonIndex }) => (
            <LessonRow
              key={lessonIndex}
              info={info}
              lesson={info.lesson}
              lessonIndex={lessonIndex}
              courseId={registration.programId}
            />
          ))}
        </div>
      </div>
    );
  }

  const ahead = numbered.filter(({ info }) => info.state !== "past");
  // Явж байгаа хичээл байвал тэр, үгүй бол хамгийн ойрын хуваарьтай нь.
  const next =
    ahead.find(({ info }) => info.state === "live") ??
    ahead.find(({ info }) => info.state === "upcoming");
  const rest = ahead.filter((row) => row !== next);

  return (
    <div className="flex flex-col gap-3">
      {next && (
        <NextLessonCard
          info={next.info}
          lessonIndex={next.lessonIndex}
          courseId={registration.programId}
        />
      )}

      {(registration.zoomMeetingId || registration.zoomPasscode) && (
        // Some students join from the Zoom app by ID rather than the link.
        <span className="block text-[.78rem] font-semibold text-ink-3">
          {registration.zoomMeetingId && `Zoom ID: ${registration.zoomMeetingId}`}
          {registration.zoomMeetingId && registration.zoomPasscode && " · "}
          {registration.zoomPasscode && `Код: ${registration.zoomPasscode}`}
        </span>
      )}

      {rest.length > 0 ? (
        <div className="bg-bg-soft rounded-sm px-4 py-3.5">
          <b className="font-extrabold text-[.9rem] block mb-2.5">
            {`Цаашдын хичээлүүд (${rest.length})`}
          </b>
          <div className="flex flex-col">
            {rest.map(({ info, lessonIndex }) => (
              <LessonRow
                key={lessonIndex}
                info={info}
                lesson={info.lesson}
                lessonIndex={lessonIndex}
                courseId={registration.programId}
              />
            ))}
          </div>
        </div>
      ) : (
        !next && (
          <div className="flex items-center gap-3 bg-bg-soft border border-line rounded-sm px-4 py-5 text-ink-2">
            <IconClock className="w-6 h-6 shrink-0 text-ink-3" />
            <span className="font-semibold text-[.9rem]">
              Бүх хичээл болж дууссан байна. Бичлэгүүдийг «Хичээл нөхөж үзэх» хэсгээс үзнэ үү.
            </span>
          </div>
        )
      )}
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

