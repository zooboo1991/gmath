import Link from "next/link";
import MathText from "@/components/assessment/MathText";
import { IconCheckCircle, IconClock, IconTarget } from "@/components/icons";
import type { AssessmentReport, ReportItem } from "@/lib/assessment/report";
import { TRACK_LABELS } from "@/lib/assessment/types";
import type { Assessment } from "@/lib/assessment/types";

const CARD = "bg-surface border border-line rounded-lg shadow-sm px-[26px] py-[26px]";

/** Where the student is, in words, while the work is still with the teacher. */
const IN_PROGRESS_COPY: Record<string, { title: string; text: string; cta?: string }> = {
  awaiting_payment: {
    title: "Шалгалт эхлээгүй байна",
    text: "Төлбөрөө төлснөөр бодлогууд нээгдэнэ.",
    cta: "Үргэлжлүүлэх",
  },
  paid: {
    title: "Шалгалт бэлэн боллоо",
    text: "Бодлогууд бэлэн байна. Нэг нэгээр нь бодоод, бодолтынхоо зургийг оруулаарай.",
    cta: "Шалгалт руу орох",
  },
  questionnaire_done: {
    title: "Шалгалт үргэлжилж байна",
    text: "Бодлогоо бодоод зургаа оруулаарай. Зогссон бодлогоосоо шууд үргэлжлүүлнэ.",
    cta: "Үргэлжлүүлэх",
  },
  problems_submitted: {
    title: "Багш шалгаж байна",
    text: "Таны бодолт хүлээн авагдсан. Дүгнэлт гарсны дараа энэ хуудсанд харагдана.",
  },
  grading: {
    title: "Багш шалгаж байна",
    text: "Таны бодолтыг шалгаж эхэлсэн. Дүгнэлт удахгүй энд харагдана.",
  },
};

export default function AssessmentResult({
  assessment,
  report,
  open = true,
}: {
  assessment: Assessment | null;
  /** The marked paper. Null until there is work to show. */
  report: AssessmentReport | null;
  /**
   * False while the level test is switched off. A result already earned stays
   * readable — it is the student's own — but nothing here may invite them into
   * a test that would refuse them at the next click.
   */
  open?: boolean;
}) {
  if (!assessment) {
    if (!open) {
      return (
        <div className={`${CARD} text-center`}>
          <span className="w-[54px] h-[54px] rounded-[16px] bg-bg-soft text-ink-3 grid place-items-center mx-auto mb-4">
            <IconTarget className="w-6 h-6" />
          </span>
          <h2 className="text-[1.25rem] font-extrabold">Түвшин тогтоох түр хаалттай</h2>
          <p className="text-ink-2 font-medium mt-2.5 max-w-[46ch] mx-auto">
            Бодлогын санг шинэчилж байна. Бэлэн болмогц энд дахин нээгдэнэ.
          </p>
        </div>
      );
    }

    return (
      <div className={`${CARD} text-center`}>
        <span className="w-[54px] h-[54px] rounded-[16px] bg-blue-soft text-blue-strong grid place-items-center mx-auto mb-4">
          <IconTarget className="w-6 h-6" />
        </span>
        <h2 className="text-[1.25rem] font-extrabold">Түвшин тогтоох шалгалт өгөөгүй байна</h2>
        <p className="text-ink-2 font-medium mt-2.5 max-w-[46ch] mx-auto">
          Шалгалт өгснөөр багш бодолт бүрийг тань шалгаж, оноо болон зөвлөмжөө бичиж өгнө.
        </p>
        <Link
          href="/assessment"
          className="inline-flex items-center justify-center gap-2 font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[30px] py-4 mt-6 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
        >
          Түвшин тогтоох →
        </Link>
      </div>
    );
  }

  if (assessment.status !== "completed") {
    const copy = IN_PROGRESS_COPY[assessment.status] ?? IN_PROGRESS_COPY.problems_submitted;
    // Unfinished work goes back to the paper itself, not to the starting page —
    // the child left off at a problem, and that is where they belong.
    const href =
      assessment.status === "paid" || assessment.status === "questionnaire_done"
        ? `/assessment/${assessment.id}/solve`
        : "/assessment";
    const handedIn = assessment.status === "problems_submitted" || assessment.status === "grading";
    const done = report?.items.filter((i) => i.skipped || i.imageUrls.length > 0).length ?? 0;

    return (
      <div className={CARD}>
        {handedIn ? (
          <span className="inline-flex items-center gap-2 text-[.8rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full">
            <IconCheckCircle className="w-3.5 h-3.5" /> Илгээгдсэн
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-[.8rem] font-extrabold text-gold-strong bg-gold-soft px-3 py-1.5 rounded-full">
            <IconClock className="w-3.5 h-3.5" /> Дуусаагүй
          </span>
        )}
        <h2 className="text-[1.25rem] font-extrabold mt-3.5">{copy.title}</h2>
        <p className="text-ink-2 font-medium mt-2">{copy.text}</p>
        {!handedIn && report && report.items.length > 0 && (
          <p className="text-ink-3 font-semibold text-[.88rem] mt-2">
            {report.items.length} бодлогын {done}-г бөглөсөн байна.
          </p>
        )}
        {copy.cta && open && (
          <Link
            href={href}
            className="inline-flex items-center justify-center font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-3.5 mt-5 transition-transform hover:-translate-y-0.5"
          >
            {copy.cta} →
          </Link>
        )}
      </div>
    );
  }

  // A completed quiz (Энгийн/Сонгон) has a score and an AI зөвлөмж instead of
  // a teacher's marking — its result card is a different shape entirely.
  if (assessment.track === "regular" || assessment.track === "advanced") {
    return (
      <div className={CARD}>
        <div className="text-center">
          <span className="inline-grid place-items-center w-24 h-24 rounded-full bg-blue-soft">
            <b className="text-[1.6rem] font-extrabold text-blue-strong">
              {assessment.quizScore ?? 0}/{assessment.quizTotal ?? 0}
            </b>
          </span>
          <h2 className="text-[1.3rem] font-extrabold mt-4">{TRACK_LABELS[assessment.track]}</h2>
          {assessment.quizGrade && (
            <p className="text-ink-3 font-semibold text-[.9rem] mt-1">{assessment.quizGrade}-р ангийн тест</p>
          )}
        </div>
        {assessment.aiRecommendation && (
          <div className="bg-bg-soft rounded-md px-5 py-4 mt-5">
            <b className="font-extrabold text-[.95rem] block mb-2">Зөвлөмж</b>
            <p className="text-ink-2 font-medium leading-[1.75] whitespace-pre-wrap text-[.95rem]">
              {assessment.aiRecommendation}
            </p>
          </div>
        )}
        <div className="text-center mt-6">
          <Link
            href="/courses"
            className="inline-flex items-center justify-center font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-3.5 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
          >
            Сургалтууд үзэх →
          </Link>
        </div>
      </div>
    );
  }

  const items = report?.items ?? [];
  const solved = items.filter((i) => !i.skipped);

  return (
    <div className="flex flex-col gap-4">
      {/* The headline: what the teacher gave, in points. */}
      <div className="panel-blue rounded-lg text-white px-[26px] py-[28px] shadow-blue">
        <span className="inline-flex items-center gap-2 text-[.78rem] font-extrabold tracking-[.12em] uppercase text-gold">
          <IconCheckCircle className="w-4 h-4" /> Шалгалт дууссан
        </span>
        <h2 className="text-[1.5rem] font-extrabold mt-2.5">Багшийн дүгнэлт гарлаа</h2>
        {report && report.scoredCount > 0 && (
          <div className="flex items-baseline gap-3 mt-3 flex-wrap">
            <b className="text-[2.6rem] font-extrabold leading-none">{report.totalScore}</b>
            <span className="text-[1.05rem] font-extrabold text-navy-ink-2">оноо</span>
          </div>
        )}
        <p className="text-[.85rem] text-navy-ink-2 font-semibold mt-4 pt-4 border-t border-white/12">
          Бодсон бодлого: {solved.length}
          {items.length > 0 && ` / ${items.length}`}
          {report && report.scoredCount > 0 && ` · Шалгасан: ${report.scoredCount}`}
        </p>
      </div>

      {assessment.teacherComment && (
        <div className={CARD}>
          <h2 className="text-[1.05rem] font-extrabold mb-2.5">Эцсийн дүгнэлт</h2>
          {/* The teacher types plain text; keep their line breaks. */}
          <p className="text-ink-2 font-medium leading-[1.75] whitespace-pre-line">
            {assessment.teacherComment}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className={CARD}>
          <h2 className="text-[1.05rem] font-extrabold">Бодлого бүрийн үнэлгээ</h2>
          <p className="text-ink-3 font-semibold text-[.85rem] mt-1">
            Багшийн бичсэн тэмдэглэл, оноо бодлого тус бүрээр.
          </p>
          <div className="flex flex-col gap-4 mt-4">
            {items.map((item, i) => (
              <GradedProblem key={item.problem?.id ?? i} index={i} item={item} />
            ))}
          </div>
        </div>
      )}

      {report && report.gradedSheetUrls.length > 0 && (
        <div className={CARD}>
          <h2 className="text-[1.05rem] font-extrabold mb-3">
            Багшийн засварласан хуудас
            {report.gradedSheetUrls.length > 1 ? ` (${report.gradedSheetUrls.length})` : ""}
          </h2>
          <div className="flex flex-col gap-3">
            {report.gradedSheetUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Багшийн засварласан хуудас"
                  className="max-w-full rounded-sm border border-line hover:border-blue transition-colors"
                />
              </a>
            ))}
          </div>
          <p className="text-[.8rem] text-ink-3 font-medium mt-2">Томруулж харах бол зураг дээр дарна уу.</p>
        </div>
      )}

      <p className="text-center text-ink-3 font-medium text-[.85rem]">
        Асуух зүйл байвал{" "}
        <a href="tel:90777400" className="font-extrabold text-blue-strong">
          9077 7400
        </a>{" "}
        дугаарт холбогдоно уу.
      </p>
    </div>
  );
}

/** One problem as it comes back: the question, the child's own photo, the mark. */
function GradedProblem({ index, item }: { index: number; item: ReportItem }) {
  return (
    <div className="border border-line rounded-md px-4 py-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <b className="font-extrabold text-[.95rem]">
          {index + 1}-р бодлого
          {item.problem?.topic ? ` · ${item.problem.topic}` : ""}
        </b>
        {item.score !== undefined ? (
          <span className="text-[.8rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full">
            {item.score} оноо
          </span>
        ) : item.skipped ? (
          <span className="text-[.8rem] font-extrabold text-ink-3 bg-bg-soft px-3 py-1.5 rounded-full">
            Бодож чадсангүй
          </span>
        ) : (
          <span className="text-[.8rem] font-extrabold text-ink-3 bg-bg-soft px-3 py-1.5 rounded-full">
            Оноо тавиагүй
          </span>
        )}
      </div>

      {item.problem?.bodyLatex && (
        <div className="mt-2.5">
          <MathText source={item.problem.bodyLatex} className="text-[.95rem] overflow-x-auto" />
        </div>
      )}

      {item.imageUrls.length > 0 && (
        <div className="flex gap-2.5 flex-wrap mt-3">
          {item.imageUrls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Миний бодолт"
                className="w-[110px] h-[110px] object-cover rounded-sm border border-line hover:border-blue transition-colors"
              />
            </a>
          ))}
        </div>
      )}

      {item.comment ? (
        <div className="bg-blue-soft/60 rounded-sm px-4 py-3 mt-3">
          <span className="text-[.72rem] font-extrabold tracking-[.06em] uppercase text-blue-strong">
            Багшийн тэмдэглэл
          </span>
          <p className="text-ink-2 font-medium text-[.9rem] leading-[1.7] whitespace-pre-line mt-1">
            {item.comment}
          </p>
        </div>
      ) : (
        !item.skipped && (
          <p className="text-ink-3 font-semibold text-[.85rem] mt-3">Багш тэмдэглэл бичээгүй байна.</p>
        )
      )}
    </div>
  );
}
