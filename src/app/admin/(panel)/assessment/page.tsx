import type { Metadata } from "next";
import AssessmentPanel from "@/components/admin/panels/AssessmentPanel";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { getAssessmentFee, getAssessmentSla, getQuizFee, isAssessmentOpen } from "@/lib/assessment/db";
import { DEFAULT_ASSESSMENT_FEE, DEFAULT_ASSESSMENT_SLA, DEFAULT_QUIZ_FEE } from "@/lib/assessment/config";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Үнэлгээ — Админ" };

export default async function AdminAssessmentPage() {
  await requireAdminSection("assessment");
  const [assessmentFee, quizFee, sla, open] = await Promise.all([
    getAssessmentFee().catch(() => DEFAULT_ASSESSMENT_FEE),
    getQuizFee().catch(() => DEFAULT_QUIZ_FEE),
    getAssessmentSla().catch(() => DEFAULT_ASSESSMENT_SLA),
    isAssessmentOpen(),
  ]);
  return (
    <div className="px-6 lg:px-10 py-8">
      <AdminPageHeader title="Түвшин тогтоох үнэлгээ" />
      <AssessmentPanel
        initialFee={assessmentFee}
        initialQuizFee={quizFee}
        initialSla={sla}
        initialOpen={open}
      />
    </div>
  );
}
