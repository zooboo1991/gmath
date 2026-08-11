import type { Metadata } from "next";
import AssessmentPanel from "@/components/admin/panels/AssessmentPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { getAssessmentFee } from "@/lib/assessment/db";
import { DEFAULT_ASSESSMENT_FEE } from "@/lib/assessment/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Үнэлгээ — Админ" };

export default async function AdminAssessmentPage() {
  const assessmentFee = await getAssessmentFee().catch(() => DEFAULT_ASSESSMENT_FEE);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Түвшин тогтоох үнэлгээ" />
      <AssessmentPanel initialFee={assessmentFee} />
    </div>
  );
}
