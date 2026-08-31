import { getWeekdayNameMn } from "./courseDate";
import { mongoliaLocalToUtc, parseScheduleString } from "./lessonSchedule";

/**
 * Хичээл бүрийн ирц — нэг сурагчийн нүдээр.
 *
 * Онлайн хичээлийн ирцийг Zoom-ийн орсон/гарсан бичлэгээс тооцно: хичээлийн
 * үргэлжлэх хугацааны талаас илүүг сууснаа "ирсэн", түүнээс бага боловч
 * орсон бол "дутуу суусан" гэж үзнэ. Танхимын хичээлийг багш өөрөө
 * бүртгэдэг тул зүгээр л түүний тэмдэглэсэн зүйлийг харуулна.
 *
 * Энэ модуль ямар ч мэдээллийн сангийн импортгүй — цэвэр тооцоолол тул
 * сервер, браузер хоёулаа дуудаж, шууд тестлэх боломжтой.
 */

export type AttendanceMode = "online" | "inperson";

/** Zoom-д орсон, гарсан цаг. `leftAt` дутуу бол хичээл дуустал сууснаар тооцно. */
export type AttendanceSpan = { joinedAt: string; leftAt?: string };

/**
 * `unmarked` нь "мэдэхгүй" гэсэн үг — тасалсан гэсэн үг биш. Zoom-оор
 * хянагдаагүй хичээл, багш бүртгэл аваагүй танхимын хичээл энд ордог.
 * Хүүхдийг мэдээлэл дутуугаас болж таслагч гэж харуулах нь буруу.
 */
export type AttendanceOutcome = "present" | "partial" | "absent" | "unmarked" | "upcoming";

/** Хичээлийн ирц харуулахад л хэрэгтэй талбарууд (Lesson-ийн дэд олонлог). */
export type AttendanceLesson = {
  topic: string;
  schedule?: string;
  mode?: AttendanceMode;
  recordingLink?: string;
};

export type LessonAttendance = {
  lessonIndex: number;
  topic: string;
  mode: AttendanceMode;
  /** "2026.08.24 Даваа" — хуваарь тавиагүй бол хоосон. */
  dateLabel: string;
  /** "18:00–20:00" — цаг оруулаагүй бол хоосон. */
  timeLabel: string;
  outcome: AttendanceOutcome;
  /** Онлайн хичээлд суусан минут (бүхэл тоо). */
  minutes?: number;
  /** Хичээлийн үргэлжлэх хугацааны хэдэн хувийг сууссан бэ. */
  percent?: number;
  /** Хичээлийг бичлэгээр нөхөж үзсэн эсэх. */
  watchedRecording: boolean;
  hasRecording: boolean;
};

export type AttendanceSummary = {
  lessons: LessonAttendance[];
  present: number;
  partial: number;
  absent: number;
  unmarked: number;
  upcoming: number;
  /** Дүгнэлт гарсан хичээлүүдээс ирсний хувь. Дүгнэх юмгүй бол null. */
  rate: number | null;
};

/** Цаг оруулаагүй хичээлийг хоёр цаг үргэлжилсэнд тооцно (хуваарийн модультай ижил). */
const ASSUMED_LENGTH_MS = 2 * 60 * 60 * 1000;

/** Хичээлийн талаас илүүг сууссан бол ирсэнд тооцно. */
export const PRESENT_THRESHOLD_PERCENT = 50;

function lessonWindow(schedule: string | undefined): { start: Date; end: Date } | null {
  const { date, startTime, endTime } = parseScheduleString(schedule ?? "");
  const start = mongoliaLocalToUtc(date, startTime);
  if (!start) return null;
  const end = mongoliaLocalToUtc(date, endTime) ?? new Date(start.getTime() + ASSUMED_LENGTH_MS);
  // Шөнө дундыг давсан хичээл (18:00–01:00) сөрөг урттай гарахаас сэргийлнэ.
  return { start, end: end > start ? end : new Date(start.getTime() + ASSUMED_LENGTH_MS) };
}

/** Хичээлийн цонхтой давхцсан хугацааг миллисекундээр. */
function overlapMs(spans: AttendanceSpan[], start: Date, end: Date): number {
  let total = 0;
  for (const span of spans) {
    const joined = new Date(span.joinedAt).getTime();
    if (Number.isNaN(joined)) continue;
    // Гарсан цаг байхгүй бол Zoom-ийн "гарлаа" дохио алдагдсан гэж үзээд
    // хичээл дуустал сууссанд тооцно — хүүхдийг хохироохгүй тал руу.
    const leftRaw = span.leftAt ? new Date(span.leftAt).getTime() : end.getTime();
    const left = Number.isNaN(leftRaw) ? end.getTime() : leftRaw;
    const from = Math.max(joined, start.getTime());
    const to = Math.min(left, end.getTime());
    if (to > from) total += to - from;
  }
  return total;
}

export function summariseAttendance(input: {
  lessons: AttendanceLesson[];
  /** Хичээлийн дугаараар Zoom-ийн ирцийн бичлэгүүд. */
  spansByLessonIndex: Record<number, AttendanceSpan[]>;
  /** Zoom-оор хянагдаж байгаа хичээлүүдийн дугаар. Үүнд байхгүй бол ирц мэдэгдэхгүй. */
  trackedLessonIndexes: Set<number>;
  /** Танхимын хичээлд багшийн тавьсан тэмдэглэгээ. */
  rollCallByLessonIndex: Record<number, boolean>;
  /** Бичлэгийг нь үзсэн хичээлүүдийн дугаар. */
  watchedLessonIndexes: Set<number>;
  now?: Date;
}): AttendanceSummary {
  const now = input.now ?? new Date();

  const lessons = input.lessons.map((lesson, lessonIndex): LessonAttendance => {
    const mode: AttendanceMode = lesson.mode === "inperson" ? "inperson" : "online";
    const { date, startTime, endTime } = parseScheduleString(lesson.schedule ?? "");
    const weekday = getWeekdayNameMn(date);
    const win = lessonWindow(lesson.schedule);
    const watchedRecording = input.watchedLessonIndexes.has(lessonIndex);
    const base = {
      lessonIndex,
      topic: lesson.topic,
      mode,
      dateLabel: date ? `${date.replaceAll("-", ".")}${weekday ? ` ${weekday}` : ""}` : "",
      timeLabel: startTime && endTime ? `${startTime}–${endTime}` : startTime,
      watchedRecording,
      hasRecording: Boolean(lesson.recordingLink),
    };

    if (win && win.end.getTime() > now.getTime()) {
      return { ...base, outcome: "upcoming" };
    }

    if (mode === "inperson") {
      const marked = input.rollCallByLessonIndex[lessonIndex];
      return { ...base, outcome: marked === undefined ? "unmarked" : marked ? "present" : "absent" };
    }

    // Zoom-оор хянагдаагүй онлайн хичээлээс ирц мэдэх аргагүй.
    if (!input.trackedLessonIndexes.has(lessonIndex) || !win) {
      return { ...base, outcome: "unmarked" };
    }

    const durationMs = win.end.getTime() - win.start.getTime();
    const attendedMs = overlapMs(input.spansByLessonIndex[lessonIndex] ?? [], win.start, win.end);
    const percent = Math.min(100, Math.round((attendedMs / durationMs) * 100));
    const minutes = Math.round(attendedMs / 60_000);

    if (attendedMs === 0) return { ...base, outcome: "absent", minutes: 0, percent: 0 };
    return {
      ...base,
      outcome: percent >= PRESENT_THRESHOLD_PERCENT ? "present" : "partial",
      minutes,
      percent,
    };
  });

  const count = (outcome: AttendanceOutcome) => lessons.filter((l) => l.outcome === outcome).length;
  const present = count("present");
  const partial = count("partial");
  const absent = count("absent");
  const judged = present + partial + absent;

  return {
    lessons,
    present,
    partial,
    absent,
    unmarked: count("unmarked"),
    upcoming: count("upcoming"),
    rate: judged > 0 ? Math.round((present / judged) * 100) : null,
  };
}
