import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CourseObjectPage, { type CourseTab } from "@/components/profile/CourseObjectPage";
import { listRegistrationsByUser } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { listAttendanceForUser, listLessonMeetingsForCourse } from "@/lib/zoom/db";
import { listRollCallForUser } from "@/lib/rollCall";
import { listRecordingViews } from "@/lib/recordingViews";
import { summariseAttendance, type AttendanceSpan } from "@/lib/courseAttendance";
import { listAssessmentsByUser } from "@/lib/assessment/db";
import { listExams, listFreeInvitedExams } from "@/lib/assessment/exams";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Миний сургалт",
};

const TABS: CourseTab[] = [
  "schedule",
  "recordings",
  "attendance",
  "assessment",
  "olympiad",
  "contract",
];

/**
 * Нэг сургалтын дэлгэрэнгүй хуудас.
 *
 * Профайл дээрх карт нь зөвхөн "юу болж байна"-г хэлдэг; хуваарь, ирц,
 * шалгалт, гэрээ бүгд энд байна. Сурагч зөвхөн өөрийнхөө идэвхтэй
 * бүртгэлийг л нээж чадна — өөр хүний, эсвэл төлбөр нь баталгаажаагүй
 * сургалтын хуудас байхгүй мэт 404 буцаана.
 */
export default async function ProfileCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getSessionUser();
  // Нэвтрэх нь модалаар ажилладаг тул профайл руу буцаана — тэнд
  // "Та нэвтрээгүй байна" гэсэн тайлбар, нэвтрэх зам хоёулаа бий.
  if (!user) redirect("/profile");

  const { id } = await params;
  const { tab } = await searchParams;

  const registrations = await listRegistrationsByUser(user.id);
  const registration = registrations.find((r) => r.programId === id && r.status === "active");
  if (!registration) notFound();

  const lessons = registration.lessons ?? [];

  const [meetings, rollCall, views, freeExams, assessments, exams] = await Promise.all([
    listLessonMeetingsForCourse(id).catch(() => []),
    listRollCallForUser(id, user.id).catch(() => ({})),
    // Бичлэгийн үзэлтийн хүснэгт шинэ — schema.sql-ээ ажиллуулаагүй
    // орчинд бүтэн хуудас унах учиргүй.
    listRecordingViews(user.id, id).catch(() => []),
    listFreeInvitedExams(user.id).catch(() => []),
    listAssessmentsByUser(user.id)
      .then((all) => all.filter((a) => a.status !== "cancelled"))
      .catch(() => []),
    listExams().catch(() => []),
  ]);

  const attendance = await listAttendanceForUser(
    user.id,
    meetings.map((m) => m.id)
  ).catch(() => []);

  const meetingToLesson = new Map(meetings.map((m) => [m.id, m.lessonIndex]));
  const spansByLessonIndex: Record<number, AttendanceSpan[]> = {};
  for (const row of attendance) {
    const lessonIndex = meetingToLesson.get(row.lessonMeetingId);
    if (lessonIndex === undefined) continue;
    (spansByLessonIndex[lessonIndex] ??= []).push({ joinedAt: row.joinedAt, leftAt: row.leftAt });
  }

  const summary = summariseAttendance({
    lessons,
    spansByLessonIndex,
    trackedLessonIndexes: new Set(meetings.map((m) => m.lessonIndex)),
    rollCallByLessonIndex: rollCall,
    watchedLessonIndexes: new Set(views.map((v) => v.lessonIndex)),
  });

  const invited = freeExams.find((e) => e.viaProgramId === id);
  const mine = invited ? assessments.find((a) => a.examId === invited.id) : undefined;

  return (
    <>
      <Navbar />
      <main>
        <CourseObjectPage
          registration={registration}
          summary={summary}
          initialTab={TABS.find((t) => t === tab) ?? "schedule"}
          nowIso={new Date().toISOString()}
          freeExam={
            invited
              ? {
                  id: invited.id,
                  title: invited.title,
                  assessmentId: mine?.id ?? null,
                  status: mine?.status ?? null,
                }
              : null
          }
          assessments={assessments.map((a) => ({
            id: a.id,
            title: exams.find((e) => e.id === a.examId)?.title ?? "Түвшин тогтоох шалгалт",
            status: a.status,
            createdAt: a.createdAt,
          }))}
        />
      </main>
      <Footer />
    </>
  );
}
