"use client";

import Link from "next/link";
import type { AssessmentStatus } from "@/lib/assessment/types";
import { IconCheckCircle, IconTarget } from "@/components/icons";

/**
 * An exam this child's course was invited to sit free, and how far they have
 * got with it.
 */
export type FreeExam = {
  id: string;
  title: string;
  programId?: string;
  /** Their assessment for this exam, if they have started one. */
  assessmentId?: string | null;
  status?: AssessmentStatus | null;
};

/**
 * The invitation card in a course's details.
 *
 * It has to read differently once the child has actually sat the exam —
 * a card that still says "Түвшин тогтоох →" after the work was handed in
 * invites them to do the whole thing a second time.
 */
export default function FreeExamBox({ exam }: { exam: FreeExam }) {
  const handedIn =
    exam.status === "problems_submitted" ||
    exam.status === "grading" ||
    exam.status === "completed";

  if (handedIn) {
    const graded = exam.status === "completed";
    return (
      <div className="bg-green-soft border border-green/25 rounded-sm px-4 py-3.5">
        <span className="inline-flex items-center gap-1.5 text-[.72rem] font-extrabold tracking-[.06em] uppercase text-green">
          <IconCheckCircle className="w-3.5 h-3.5" /> Түвшин тогтоох өгсөн
        </span>
        <b className="block font-extrabold text-[.95rem] mt-1">{exam.title}</b>
        <p className="text-ink-2 font-medium text-[.85rem] mt-1 leading-[1.6]">
          {graded
            ? "Багш бодолтыг чинь шалгаж, дүгнэлтээ бичсэн байна."
            : "Бодолт багшид хүрсэн. Багш шалгаж дуусмагц дүгнэлт энд гарч ирнэ."}
        </p>
        <Link
          href={exam.assessmentId ? `/profile/assessment?a=${exam.assessmentId}` : "/profile/assessment"}
          className="inline-flex items-center justify-center gap-2 font-extrabold text-[.88rem] rounded-full bg-surface text-green border border-green/30 px-5 py-2.5 mt-3"
        >
          {graded ? "Дүгнэлт харах →" : "Явцыг харах →"}
        </Link>
      </div>
    );
  }

  // Started but not handed in — the paper is open, so send them back to it
  // rather than through the starting page again.
  const inProgress = exam.status === "questionnaire_done" && Boolean(exam.assessmentId);

  return (
    <div className="bg-gold-soft border border-gold/30 rounded-sm px-4 py-3.5">
      <span className="inline-flex items-center gap-1.5 text-[.72rem] font-extrabold tracking-[.06em] uppercase text-gold-strong">
        <IconTarget className="w-3.5 h-3.5" /> Үнэгүй
      </span>
      <b className="block font-extrabold text-[.95rem] mt-1">{exam.title}</b>
      <p className="text-ink-2 font-medium text-[.85rem] mt-1 leading-[1.6]">
        {inProgress
          ? "Эхэлсэн шалгалт дуусаагүй байна. Зогссон бодлогоосоо үргэлжлүүлнэ."
          : "Энэ сургалтын сурагчид түвшин тогтоох шалгалтыг төлбөргүй өгнө. Бодлогоо бодоод бодолтынхоо зургийг хавсаргана."}
      </p>
      <Link
        href={inProgress ? `/assessment/${exam.assessmentId}/solve` : `/assessment?exam=${exam.id}`}
        className="inline-flex items-center justify-center gap-2 font-extrabold text-[.88rem] rounded-full bg-gold text-gold-ink shadow-gold px-5 py-2.5 mt-3 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
      >
        {inProgress ? "Үргэлжлүүлэх →" : "Түвшин тогтоох →"}
      </Link>
    </div>
  );
}
