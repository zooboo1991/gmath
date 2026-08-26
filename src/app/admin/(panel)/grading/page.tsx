import type { Metadata } from "next";
import { redirect } from "next/navigation";
import GradingQueue from "@/components/admin/GradingQueue";
import {
  listAssessmentsForGrading,
  listCancelledAssessments,
  listCompletedAssessments,
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

  return <GradingQueue queue={queue} completed={completed} cancelled={cancelled} />;
}
