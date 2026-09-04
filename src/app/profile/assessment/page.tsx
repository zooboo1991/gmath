import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import AssessmentClosed from "@/components/assessment/AssessmentClosed";
import AssessmentResult from "@/components/assessment/AssessmentResult";
import { isAssessmentOpen, listAssessmentsByUser } from "@/lib/assessment/db";
import { buildAssessmentReport, type AssessmentReport } from "@/lib/assessment/report";
import type { Assessment } from "@/lib/assessment/types";
import { getSessionUser } from "@/lib/session";
import { placementState } from "@/lib/assessment/placementEngine";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Багшийн дүгнэлт",
};

export default async function ProfileAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string }>;
}) {
  const user = await getSessionUser();
  const open = await isAssessmentOpen();

  if (!open && !user) return <AssessmentClosed />;

  if (!user) {
    return (
      <>
        <Navbar />
        <main>
          <PageHero eyebrow="Түвшин тогтоох" title="Багшийн дүгнэлт" />
          <section className="section-pad">
            <div className="wrap max-w-[700px] mx-auto">
              <div className="text-center bg-surface border border-line rounded-lg shadow-sm px-8 py-14">
                <h2 className="text-[1.3rem] font-extrabold">Та нэвтрээгүй байна</h2>
                <p className="text-ink-2 mt-2.5 font-medium">
                  Багшийн дүгнэлтээ харахын тулд бүртгэлээрээ нэвтэрнэ үү.
                </p>
                <Link
                  href="/assessment"
                  className="inline-flex items-center justify-center font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 mt-6 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
                >
                  Түвшин тогтоох →
                </Link>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  // The assessment tables are newer than the rest of the site — an install
  // that hasn't run the latest schema.sql should see the empty state, not a
  // crash.
  const assessments = (await listAssessmentsByUser(user.id).catch(() => [] as Assessment[])).filter(
    // A voided sitting is not shown at all: the student is meant to start over.
    (a) => a.status !== "cancelled"
  );
  // ?a=<id> comes from the course card they pressed — a child sitting both the
  // C and the D exam has two of these, and they must not be shown each other's
  // marks. Without it: the finished one, falling back to whatever is running.
  const { a: wanted } = await searchParams;
  const assessment =
    (wanted ? assessments.find((x) => x.id === wanted) : undefined) ??
    assessments.find((x) => x.status === "completed") ??
    assessments[0] ??
    null;

  // The marked paper — problem by problem, with the teacher's notes. Read for
  // work that has left the child's hands; before that there is nothing to show.
  const report: AssessmentReport | null =
    assessment && assessment.status !== "awaiting_payment" && assessment.status !== "paid"
      ? await buildAssessmentReport(assessment).catch(() => null)
      : null;

  // Шаталсан шалгалтын сэдэв бүрийн оноо — radar-т. Хөдөлгүүр өөрөө
  // дүгнэлтээ бодож өгдөг тул энд зөвхөн уншина.
  const placement =
    assessment?.track === "placement" && assessment.status === "completed"
      ? await placementState(assessment)
          .then((view) => (view.done ? view.result : null))
          .catch(() => null)
      : null;

  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Түвшин тогтоох" title="Багшийн дүгнэлт" />
        <section className="section-pad">
          <div className="wrap max-w-[700px] mx-auto">
            <AssessmentResult assessment={assessment} report={report} placement={placement} open={open} />
            <Link
              href="/profile"
              className="inline-flex items-center gap-2 font-extrabold text-[.92rem] text-blue-strong mt-7"
            >
              ← Профайл руу буцах
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
