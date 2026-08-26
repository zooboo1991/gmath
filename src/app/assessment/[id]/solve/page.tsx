import type { Metadata } from "next";
import Link from "next/link";
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

  // Decided here rather than in the browser: the page knows the status
  // already, and rendering the stepper first would flash a form at a child
  // whose paper is with the teacher and whose every action would be refused.
  const handedIn =
    guard.assessment.status !== "questionnaire_done" && guard.assessment.status !== "paid";

  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Түвшин тогтоох" title="Бодолтоо оруулах" />
        <section className="section-pad">
          <div className="wrap max-w-[700px] mx-auto">
            {handedIn ? (
              <div className="bg-surface border border-line rounded-lg shadow-sm px-[26px] py-[26px] text-center">
                <h2 className="text-[1.15rem] font-extrabold">Бодолт илгээгдсэн</h2>
                <p className="text-ink-2 font-medium mt-2 leading-[1.7]">
                  Багш таны ажлыг шалгаж байна. Дүгнэлт гарсны дараа профайл дээр тань харагдана.
                </p>
                <Link
                  href="/profile/assessment"
                  className="inline-flex items-center justify-center font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-3.5 mt-5 transition-transform hover:-translate-y-0.5"
                >
                  Явцыг харах →
                </Link>
              </div>
            ) : (
              <SolutionUploader assessmentId={id} />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
