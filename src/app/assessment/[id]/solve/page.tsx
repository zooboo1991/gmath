import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import AssessmentClosed from "@/components/assessment/AssessmentClosed";
import SolutionUploader from "@/components/assessment/SolutionUploader";
import { findExam, openExamPaper } from "@/lib/assessment/exams";
import { TASK_KIND_LABEL, taskWindow } from "@/lib/courseTasks";
import { requireOwnAssessment } from "@/lib/assessment/guard";
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
  const guard = await requireOwnAssessment(id);
  // Closed to the public — but a child invited to a free exam, or doing their
  // course's homework, keeps working.
  if (!guard.ok && guard.status === 503) return <AssessmentClosed />;
  if (!guard.ok) notFound();
  // A course's homework or test: named as such, and handed back to its course's list.
  const exam = guard.assessment.track === "course" && guard.assessment.examId ? await findExam(guard.assessment.examId) : undefined;
  const coursePaper = exam && exam.kind !== "placement" && exam.programId ? exam : undefined;
  const doneHref = coursePaper ? `/profile/course/${encodeURIComponent(coursePaper.programId!)}?tab=tasks` : "/profile/assessment";

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
  // Outside its window a course paper takes nothing — say so before the child
  // photographs a page the server will refuse.
  const shut = coursePaper && !handedIn ? taskWindow(coursePaper) : "open";

  return (
    <>
      <Navbar />
      <main>
        <PageHero
          eyebrow={coursePaper ? TASK_KIND_LABEL[coursePaper.kind as "homework" | "test"] : "Түвшин тогтоох"}
          title={coursePaper ? coursePaper.title : "Бодолтоо оруулах"}
        />
        <section className="section-pad">
          <div className="wrap max-w-[700px] mx-auto">
            {handedIn ? (
              <div className="bg-surface border border-line rounded-lg shadow-sm px-[26px] py-[26px] text-center">
                <h2 className="text-[1.15rem] font-extrabold">Бодолт илгээгдсэн</h2>
                <p className="text-ink-2 font-medium mt-2 leading-[1.7]">
                  Багш таны ажлыг шалгаж байна. Дүгнэлт гарсны дараа профайл дээр тань харагдана.
                </p>
                <Link
                  href={doneHref}
                  className="inline-flex items-center justify-center font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-3.5 mt-5 transition-transform hover:-translate-y-0.5"
                >
                  Явцыг харах →
                </Link>
              </div>
            ) : shut !== "open" ? (
              <div className="bg-surface border border-line rounded-lg shadow-sm px-[26px] py-[26px] text-center">
                <h2 className="text-[1.15rem] font-extrabold">
                  {shut === "before" ? "Хараахан нээгдээгүй байна" : "Хугацаа дууссан"}
                </h2>
                <p className="text-ink-2 font-medium mt-2 leading-[1.7]">
                  {shut === "before"
                    ? "Нээгдэх цагаас нь эхлэн бодолтоо оруулна."
                    : "«Илгээх» дараагүй тул энэ ажил тооцогдохгүй."}
                </p>
                <Link
                  href={doneHref}
                  className="inline-flex items-center justify-center font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-3.5 mt-5 transition-transform hover:-translate-y-0.5"
                >
                  Жагсаалт руу буцах →
                </Link>
              </div>
            ) : (
              <SolutionUploader assessmentId={id} doneHref={doneHref} />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
