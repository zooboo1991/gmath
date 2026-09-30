import type { Metadata } from "next";
import { redirect } from "next/navigation";
import GradingQueue from "@/components/admin/GradingQueue";
import {
  listAssessmentsForGrading,
  listCancelledAssessments,
  listCompletedAssessments,
  listPaperTotals,
} from "@/lib/assessment/db";
import { isAdmin } from "@/lib/session";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Шалгах дараалал — Админ хэсэг",
};

export default async function AdminGradingPage() {
  await requireAdminSection("grading");
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const [queue, completed, cancelled] = await Promise.all([
    listAssessmentsForGrading().catch(() => []),
    listCompletedAssessments().catch(() => []),
    listCancelledAssessments().catch(() => []),
  ]);

  // Only finished papers show a total: a paper still in the queue may carry
  // pre-filled scores the teacher has not looked at yet.
  const totals = await listPaperTotals(completed).catch(() => ({}));

  return <GradingQueue queue={queue} completed={completed} cancelled={cancelled} totals={totals} />;
}
