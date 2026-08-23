import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MathText from "@/components/assessment/MathText";
import { findExamDetail } from "@/lib/assessment/exams";
import { requireAdminSection } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Шалгалт харах — Админ хэсэг" };

/**
 * The exam as a child meets it: the problems in order, with the answer key
 * left out — the same thing toPublicProblem strips before a problem is ever
 * sent to a student.
 *
 * A read-only page rather than a real run of the flow. The teacher wants to
 * check the paper reads correctly, and starting an actual assessment to do
 * that would leave a stray record and, on an open exam, take a payment.
 */
export default async function ExamPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSection("assessment");
  const { id } = await params;
  const exam = await findExamDetail(id);
  if (!exam) notFound();

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[760px]">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
        <Link href={`/admin/exams/${exam.id}`} className="font-extrabold text-[.9rem] text-blue-strong">
          ← Засах руу
        </Link>
        <span className="text-[.78rem] font-extrabold text-gold-strong bg-gold-soft px-3 py-1.5 rounded-full">
          Сурагчид ингэж харагдана
        </span>
      </div>

      <h1 className="text-[1.4rem] font-extrabold tracking-[-.02em]">{exam.title}</h1>
      <p className="text-ink-3 font-semibold text-[.88rem] mt-1 mb-6">
        {exam.category} ангилал ({exam.category === "C" ? "5-6" : "7-8"} анги) · {exam.problems.length} бодлого ·{" "}
        {exam.fee}
      </p>

      {exam.problems.length === 0 ? (
        <p className="text-ink-3 font-semibold text-[.9rem] py-12 text-center">
          Бодлого сонгоогүй байна.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {exam.problems.map((problem, index) => (
            <div key={problem.id} className="card-flat px-[22px] py-[20px]">
              <span className="text-[.72rem] font-extrabold text-blue-strong bg-blue-soft px-2.5 py-1 rounded-full">
                {index + 1}-р бодлого
              </span>
              {problem.topic && (
                <b className="text-[.9rem] font-extrabold block mt-2.5">{problem.topic}</b>
              )}
              {problem.bodyLatex && (
                <div className="mt-2">
                  <MathText source={problem.bodyLatex} className="text-[.98rem] overflow-x-auto" />
                </div>
              )}
              {problem.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={problem.imageUrl}
                  alt=""
                  className="mt-3 max-w-full rounded-sm border border-line"
                />
              )}
              <p className="text-[.82rem] text-ink-3 font-semibold mt-3 pt-3 border-t border-line">
                Сурагч энд бодолтынхоо зургийг хавсаргана.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
