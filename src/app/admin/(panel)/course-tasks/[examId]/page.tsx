import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CourseTaskEditor from "@/components/admin/CourseTaskEditor";
import { listProblems } from "@/lib/assessment/db";
import { findExamDetail } from "@/lib/assessment/exams";
import { findCourseById } from "@/lib/db";
import { requireAdminSection } from "@/lib/adminAccess";
import { can } from "@/lib/adminSections";
import type { Problem } from "@/lib/assessment/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Даалгавар — Админ хэсэг" };

export default async function AdminCourseTaskPage({ params }: { params: Promise<{ examId: string }> }) {
  const role = await requireAdminSection("courses");
  const { examId } = await params;
  const task = await findExamDetail(examId);
  if (!task || task.kind === "placement" || !task.programId) notFound();
  const canEdit = can(role, "courseInfo");
  // The whole live bank (a course paper is not tied to one category) — and only
  // what the page shows of a problem: the answer key and worked solution are
  // the bank's, which a read-only admin is not shown.
  const [bank, course] = await Promise.all([
    canEdit ? listProblems().catch(() => [] as Problem[]) : Promise.resolve([] as Problem[]),
    findCourseById(task.programId),
  ]);
  const shown = (p: Problem) => ({ id: p.id, topic: p.topic, bodyLatex: p.bodyLatex, category: p.category });
  return (
    <CourseTaskEditor
      task={{ ...task, problems: task.problems.map(shown) }}
      bank={bank.map(shown)}
      courseHref={`/admin/courses/${task.programId}`}
      courseTitle={course?.title ?? "Сургалт"}
      canEdit={canEdit}
    />
  );
}
