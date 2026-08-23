import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ExamEditor from "@/components/admin/ExamEditor";
import { listProblems } from "@/lib/assessment/db";
import { listCourses, listYearlyPrograms } from "@/lib/db";
import { findExamDetail } from "@/lib/assessment/exams";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Шалгалт — Админ хэсэг" };

export default async function AdminExamPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSection("assessment");
  const { id } = await params;
  const exam = await findExamDetail(id);
  if (!exam) notFound();

  // Only live problems can be added; an archived one already on the exam
  // stays there (it is part of a paper children may already have sat).
  const [problems, courses, yearly] = await Promise.all([
    listProblems().catch(() => []),
    listCourses().catch(() => []),
    listYearlyPrograms().catch(() => []),
  ]);

  // Everything a student can hold a registration on, in one list.
  const programmes = [
    ...yearly.map((p) => ({ id: p.id, label: p.label })),
    ...courses.map((c) => ({ id: c.id, label: `${c.title} (${c.tag})` })),
  ];

  return <ExamEditor exam={exam} bank={problems} courses={programmes} />;
}
