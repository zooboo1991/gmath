import type { Metadata } from "next";
import QuizQuestionsPanel from "@/components/admin/QuizQuestionsPanel";
import { listQuizQuestions } from "@/lib/assessment/db";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Тестийн асуултын сан — Админ хэсэг",
};

export default async function AdminQuizQuestionsPage() {
  await requireAdminSection("assessment");
  // Archived questions listed too, so one can be restored.
  const questions = await listQuizQuestions().catch(() => []);
  return <QuizQuestionsPanel initialQuestions={questions} />;
}
