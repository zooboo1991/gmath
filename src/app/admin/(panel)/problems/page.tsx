import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ProblemsPanel from "@/components/admin/ProblemsPanel";
import { listProblems } from "@/lib/assessment/db";
import { isAdmin } from "@/lib/session";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Бодлогын сан — Админ хэсэг",
};

export default async function AdminProblemsPage() {
  await requireAdminSection("assessment");
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  // Archived problems are listed too, so the admin can restore one.
  const problems = await listProblems({ includeInactive: true }).catch(() => []);
  return <ProblemsPanel initialProblems={problems} />;
}
