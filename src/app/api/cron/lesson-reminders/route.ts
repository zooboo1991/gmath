import { NextResponse } from "next/server";
import {
  createNotification,
  listCourses,
  listRegistrationsByProgram,
  listSentReminderKeys,
  listYearlyPrograms,
  markLessonReminderSent,
  type Lesson,
} from "@/lib/db";
import { mongoliaLocalToUtc, parseScheduleString } from "@/lib/lessonSchedule";

const WINDOW_START_MIN = 24;
const WINDOW_END_MIN = 31;

type Candidate = { programId: string; programLabel: string; lessonIndex: number; lesson: Lesson };

/**
 * Vercel Cron (see vercel.json, every 5 minutes) hits this with an
 * `Authorization: Bearer <CRON_SECRET>` header it attaches automatically
 * once CRON_SECRET is set as an env var — that's the whole auth story,
 * nothing else can trigger this route.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }

  const now = Date.now();
  const windowStart = now + WINDOW_START_MIN * 60_000;
  const windowEnd = now + WINDOW_END_MIN * 60_000;

  const [courses, programs, sentKeys] = await Promise.all([
    listCourses(undefined, { includeDrafts: true }),
    listYearlyPrograms(),
    listSentReminderKeys(),
  ]);

  const candidates: Candidate[] = [];
  for (const course of courses) {
    collectCandidates(course.id, `${course.title} (${course.tag})`, course.lessons, windowStart, windowEnd, sentKeys, candidates);
  }
  for (const program of programs) {
    collectCandidates(program.id, program.label, program.lessons, windowStart, windowEnd, sentKeys, candidates);
  }

  let notified = 0;
  let recipientTotal = 0;
  for (const c of candidates) {
    const registrations = await listRegistrationsByProgram(c.programId);
    const userIds = [...new Set(registrations.filter((r) => r.status === "active" && r.userId).map((r) => r.userId!))];
    if (userIds.length > 0) {
      await createNotification({
        title: "Хичээл 30 минутын дараа эхэлнэ",
        body: `"${c.programLabel}" — "${c.lesson.topic}" хичээл 30 минутын дараа эхэлнэ.`,
        targetType: "users",
        userIds,
        channel: "site",
        // Through the join flow rather than the shared room link: for a
        // tracked meeting the student needs their personal registrant URL or
        // their attendance is never attributed, and the GET below resolves
        // that (or falls back to the plain link) and redirects.
        link: `/api/lessons/join?courseId=${encodeURIComponent(c.programId)}&lessonIndex=${c.lessonIndex}`,
      });
      notified += 1;
      recipientTotal += userIds.length;
    }
    await markLessonReminderSent(c.programId, c.lessonIndex);
  }

  console.log(`[cron/lesson-reminders] candidates=${candidates.length} notified=${notified} recipients=${recipientTotal}`);
  return NextResponse.json({ ok: true, candidates: candidates.length, notified, recipients: recipientTotal });
}

function collectCandidates(
  programId: string,
  programLabel: string,
  lessons: Lesson[],
  windowStart: number,
  windowEnd: number,
  sentKeys: Set<string>,
  out: Candidate[]
): void {
  lessons.forEach((lesson, lessonIndex) => {
    if (lesson.mode === "inperson" || !lesson.zoomLink || !lesson.schedule) return;
    if (sentKeys.has(`${programId}#${lessonIndex}`)) return;

    const { date, startTime } = parseScheduleString(lesson.schedule);
    const start = mongoliaLocalToUtc(date, startTime);
    if (!start) return;

    const startMs = start.getTime();
    if (startMs >= windowStart && startMs <= windowEnd) {
      out.push({ programId, programLabel, lessonIndex, lesson });
    }
  });
}
