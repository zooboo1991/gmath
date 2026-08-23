import type { Metadata } from "next";
import ExamsPanel from "@/components/admin/ExamsPanel";
import { listExams } from "@/lib/assessment/exams";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Шалгалтууд — Админ хэсэг" };

export default async function AdminExamsPage() {
  await requireAdminSection("assessment");
  const exams = await listExams().catch(() => []);
  return <ExamsPanel initialExams={exams} />;
}
