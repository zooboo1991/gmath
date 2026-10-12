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
import { getSupabase } from "@/lib/supabase";

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

  // A course's homework and test papers carry their name in the list; a placement test needs none.
  const coursePapers = [...queue, ...completed, ...cancelled].filter((a) => a.track === "course" && a.examId);
  const paperTitles: Record<string, string> = {};
  if (coursePapers.length > 0) {
    const { data } = await getSupabase()
      .from("exams")
      .select("id, title")
      .in("id", [...new Set(coursePapers.map((a) => a.examId!))]);
    const titles = new Map(((data ?? []) as { id: string; title: string }[]).map((e) => [e.id, e.title]));
    for (const a of coursePapers) {
      const title = titles.get(a.examId!);
      if (title) paperTitles[a.id] = title;
    }
  }

  return <GradingQueue queue={queue} completed={completed} cancelled={cancelled} totals={totals} paperTitles={paperTitles} />;
}
