import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import AssessmentClosed from "@/components/assessment/AssessmentClosed";
import SolutionUploader from "@/components/assessment/SolutionUploader";
import { isAssessmentOpen } from "@/lib/assessment/db";
import { requireOwnAssessment } from "@/lib/assessment/guard";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Бодолт оруулах",
};

export default async function SolvePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Closed means closed, including for a test somebody had already started:
  // finishing it would score against a problem bank that is being replaced.
  if (!(await isAssessmentOpen())) return <AssessmentClosed />;

  // Gate on the server as well as in the API: a signed-out visitor should be
  // sent to log in, and someone else's assessment id must 404 rather than
  // render an empty page that looks like a glitch.
  if (!(await getSessionUser())) {
    redirect("/assessment");
  }
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) notFound();

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
