import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import AssessmentClosed from "@/components/assessment/AssessmentClosed";
import SolutionUploader from "@/components/assessment/SolutionUploader";
import { openExamPaper } from "@/lib/assessment/exams";
import { canUseAssessment, requireOwnAssessment } from "@/lib/assessment/guard";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Бодолт оруулах",
};

export default async function SolvePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Gate on the server as well as in the API: a signed-out visitor should be
  // sent to log in, and someone else's assessment id must 404 rather than
  // render an empty page that looks like a glitch.
  const user = await getSessionUser();
  if (!user) {
    redirect("/assessment");
  }
  // Closed to the public — but a child invited to a free exam keeps working.
  if (!(await canUseAssessment(user))) return <AssessmentClosed />;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) notFound();

  // Paid, but the paper was never laid out: an assessment started before the
  // questionnaire step was removed, or a payment that settled through a path
  // that did not open it. Idempotent, so arriving here twice is harmless.
  if (guard.assessment.status === "paid" && guard.assessment.examId) {
    await openExamPaper(id);
  }

  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Түвшин тогтоох" title="Бодолтоо оруулах" />
        <section className="section-pad">
          <div className="wrap max-w-[700px] mx-auto">
            <SolutionUploader assessmentId={id} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
