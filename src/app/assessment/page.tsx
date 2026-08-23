import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import AssessmentFlow from "@/components/assessment/AssessmentFlow";
import AssessmentClosed from "@/components/assessment/AssessmentClosed";
import AssessmentIntro from "@/components/assessment/AssessmentIntro";
import SampleTest from "@/components/assessment/SampleTest";
import { DEFAULT_ASSESSMENT_FEE, DEFAULT_ASSESSMENT_SLA, DEFAULT_QUIZ_FEE } from "@/lib/assessment/config";
import {
  getAssessmentFee,
  getAssessmentSla,
  getQuizFee,
  isAssessmentOpen,
  listQuizQuestions,
} from "@/lib/assessment/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Түвшин тогтоох",
  description:
    "Хүүхдийнхээ математикийн түвшинг тогтоож, Б.Ганбат багшийн хувийн зөвлөмж болон тохирох сургалтын санал аваарай. 5 асуултаар үнэгүй туршиж үзэх боломжтой.",
  alternates: { canonical: "/assessment" },
};

export default async function AssessmentPage() {
  if (!(await isAssessmentOpen())) return <AssessmentClosed />;

  // Prices and the turnaround promise are read here rather than through the
  // session-gated API, so a visitor who has not signed in still sees them.
  const [olympiadFee, quizFee, sla, sampleQuestions] = await Promise.all([
    getAssessmentFee().catch(() => DEFAULT_ASSESSMENT_FEE),
    getQuizFee().catch(() => DEFAULT_QUIZ_FEE),
    getAssessmentSla().catch(() => DEFAULT_ASSESSMENT_SLA),
    listQuizQuestions({ activeOnly: true, sample: true }).catch(() => []),
  ]);

  // Only grades that actually have a taster written for them, so the section
  // never offers a button that leads to "not ready yet".
  const sampleGrades = [...new Set(sampleQuestions.map((q) => q.grade))].sort((a, b) => a - b);

  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Түвшин тогтоох" title="Хүүхдийнхээ түвшинг тодорхойлъё" />
        <section className="section-pad">
          <div className="wrap max-w-[700px] mx-auto flex flex-col gap-5">
            {/* The flow itself decides whether to show the login prompt, the
                track picker, or a test in progress. The explanation above it is
                always visible — that is the whole point of this page for
                somebody who has not decided yet. */}
            <AssessmentFlow />
            {sampleGrades.length > 0 && <SampleTest grades={sampleGrades} />}
            <AssessmentIntro quizFee={quizFee} olympiadFee={olympiadFee} sla={sla} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
