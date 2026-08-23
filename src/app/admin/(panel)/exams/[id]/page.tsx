import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ExamEditor from "@/components/admin/ExamEditor";
import { listProblems } from "@/lib/assessment/db";
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
  const problems = await listProblems().catch(() => []);
  return <ExamEditor exam={exam} bank={problems} />;
}
