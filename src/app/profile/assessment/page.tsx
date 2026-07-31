import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import AssessmentResult from "@/components/assessment/AssessmentResult";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/assessment/config";
import { findLevel, listAssessmentsByUser, listSolutions } from "@/lib/assessment/db";
import type { Assessment, Level, Solution } from "@/lib/assessment/types";
import { findCourseById, type Course } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { createSignedUrl, GRADED_SHEETS_BUCKET } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Миний түвшин",
};

export default async function ProfileAssessmentPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <>
        <Navbar />
        <main>
          <PageHero eyebrow="Түвшин тогтоох" title="Миний түвшин" />
          <section className="section-pad">
            <div className="wrap max-w-[700px] mx-auto">
              <div className="text-center bg-surface border border-line rounded-lg shadow-sm px-8 py-14">
                <h2 className="text-[1.3rem] font-extrabold">Та нэвтрээгүй байна</h2>
                <p className="text-ink-2 mt-2.5 font-medium">
                  Түвшингийн үр дүнгээ харахын тулд бүртгэлээрээ нэвтэрнэ үү.
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
  const assessments = await listAssessmentsByUser(user.id).catch(() => [] as Assessment[]);
  // Newest first from the query; the finished one is what a parent wants to
  // see, falling back to whatever is still in progress.
  const assessment = assessments.find((a) => a.status === "completed") ?? assessments[0] ?? null;

  let level: Level | null = null;
  let course: Course | null = null;
  let solutions: Solution[] = [];
  let gradedSheetUrl: string | null = null;

  if (assessment?.status === "completed") {
    [level, solutions] = await Promise.all([
      assessment.finalLevel ? findLevel(assessment.finalLevel).then((l) => l ?? null) : Promise.resolve(null),
      listSolutions(assessment.id).catch(() => []),
    ]);
    if (level?.recommendedCourseId) {
      course = (await findCourseById(level.recommendedCourseId)) ?? null;
    }
    if (assessment.gradedSheetPath) {
      gradedSheetUrl = await createSignedUrl(
        GRADED_SHEETS_BUCKET,
        assessment.gradedSheetPath,
        SIGNED_URL_TTL_SECONDS
      );
    }
  }

  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Түвшин тогтоох" title="Миний түвшин" />
        <section className="section-pad">
          <div className="wrap max-w-[700px] mx-auto">
            <AssessmentResult
              assessment={assessment}
              level={level}
              course={course}
              solutions={solutions}
              gradedSheetUrl={gradedSheetUrl}
            />
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
