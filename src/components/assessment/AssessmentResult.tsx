import Link from "next/link";
import { IconCheckCircle, IconClock, IconTarget, IconTrophy } from "@/components/icons";
import { TRACK_LABELS } from "@/lib/assessment/types";
import type { Assessment, Level, Solution } from "@/lib/assessment/types";
import type { Course } from "@/lib/db";
import { courseHref } from "@/lib/courseHref";

const CARD = "bg-surface border border-line rounded-lg shadow-sm px-[26px] py-[26px]";

/** Where the student is, in words, while the work is still with the teacher. */
const IN_PROGRESS_COPY: Record<string, { title: string; text: string; cta?: string }> = {
  awaiting_payment: {
    title: "Үнэлгээ эхлээгүй байна",
    text: "Төлбөрөө төлснөөр анкет болон бодлогууд нээгдэнэ.",
    cta: "Үргэлжлүүлэх",
  },
  paid: {
    title: "Анкет бөглөх шат",
    text: "Товч анкет бөглөснөөр танд тохирох бодлогууд гарч ирнэ.",
    cta: "Үргэлжлүүлэх",
  },
  questionnaire_done: {
    title: "Бодлого сонгох шат",
    text: "Танд тохирох бодлогуудаас сонгож, бодолтоо оруулна уу.",
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
  level,
  course,
  solutions,
  gradedSheetUrls,
  open = true,
}: {
  assessment: Assessment | null;
  level: Level | null;
  course: Course | null;
  solutions: Solution[];
  gradedSheetUrls: string[];
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
        <h2 className="text-[1.25rem] font-extrabold">Түвшингээ хараахан тогтоогоогүй байна</h2>
        <p className="text-ink-2 font-medium mt-2.5 max-w-[46ch] mx-auto">
          Богино үнэлгээ өгснөөр хүүхдийнхээ математикийн түвшин, багшийн хувийн зөвлөмж, тохирох
          сургалтын саналыг авах боломжтой.
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
    return (
      <div className={CARD}>
        <span className="inline-flex items-center gap-2 text-[.8rem] font-extrabold text-gold-strong bg-gold-soft px-3 py-1.5 rounded-full">
          <IconClock className="w-3.5 h-3.5" /> Хүлээгдэж буй
        </span>
        <h2 className="text-[1.25rem] font-extrabold mt-3.5">{copy.title}</h2>
        <p className="text-ink-2 font-medium mt-2">{copy.text}</p>
        {copy.cta && open && (
          <Link
            href="/assessment"
            className="inline-flex items-center justify-center font-extrabold rounded-full bg-blue text-white shadow-blue px-[26px] py-3.5 mt-5 transition-transform hover:-translate-y-0.5"
          >
            {copy.cta} →
          </Link>
        )}
      </div>
    );
  }

  // A completed quiz (Энгийн/Сонгон) has a score and an AI зөвлөмж instead of
  // a teacher-assigned level — its result card is a different shape entirely.
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

  const scored = solutions.filter((s) => s.graderScore !== undefined);
  const total = scored.reduce((sum, s) => sum + (s.graderScore ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Level headline */}
      <div className="panel-blue rounded-lg text-white px-[26px] py-[28px] shadow-blue">
        <span className="inline-flex items-center gap-2 text-[.78rem] font-extrabold tracking-[.12em] uppercase text-gold">
          <IconTrophy className="w-4 h-4" /> Таны түвшин
        </span>
        <div className="flex items-baseline gap-3 mt-2.5 flex-wrap">
          <b className="text-[3rem] font-extrabold leading-none">{assessment.finalLevel}</b>
          <span className="text-[1.25rem] font-extrabold">{level?.name}</span>
        </div>
        {level?.description && (
          <p className="text-navy-ink-2 font-medium mt-3 leading-[1.7]">{level.description}</p>
        )}
        {scored.length > 0 && (
          <p className="text-[.85rem] text-navy-ink-2 font-semibold mt-4 pt-4 border-t border-white/12">
            Шалгасан бодлого: {scored.length} · Нийт оноо: {total}
          </p>
        )}
      </div>

      {assessment.teacherComment && (
        <div className={CARD}>
          <h2 className="text-[1.05rem] font-extrabold mb-2.5">Багшийн дүгнэлт</h2>
          {/* The teacher types plain text; keep their line breaks. */}
          <p className="text-ink-2 font-medium leading-[1.75] whitespace-pre-line">
            {assessment.teacherComment}
          </p>
        </div>
      )}

      {gradedSheetUrls.length > 0 && (
        <div className={CARD}>
          <h2 className="text-[1.05rem] font-extrabold mb-3">
            Багшийн засварласан хуудас{gradedSheetUrls.length > 1 ? ` (${gradedSheetUrls.length})` : ""}
          </h2>
          <div className="flex flex-col gap-3">
            {gradedSheetUrls.map((url) => (
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

      {(level?.scope || level?.howToAdvance) && (
        <div className={CARD}>
          {level.scope && (
            <>
              <h2 className="text-[1.05rem] font-extrabold mb-2">Энэ түвшинд юу багтах вэ</h2>
              <p className="text-ink-2 font-medium leading-[1.75] whitespace-pre-line">{level.scope}</p>
            </>
          )}
          {level.howToAdvance && (
            <div className={level.scope ? "mt-5 pt-5 border-t border-line" : ""}>
              <h2 className="text-[1.05rem] font-extrabold mb-2 flex items-center gap-2">
                <IconCheckCircle className="w-[18px] h-[18px] text-green" />
                Дараагийн түвшинд гарахын тулд
              </h2>
              <p className="text-ink-2 font-medium leading-[1.75] whitespace-pre-line">
                {level.howToAdvance}
              </p>
            </div>
          )}
        </div>
      )}

      {course && (
        <div className={`${CARD} border-gold border-[1.5px]`}>
          <span className="text-[.76rem] font-extrabold tracking-[.1em] uppercase text-blue-strong">
            Танд санал болгож буй
          </span>
          <h2 className="text-[1.35rem] font-extrabold mt-1.5">{course.title}</h2>
          <p className="text-[.95rem] text-ink-2 font-semibold mt-1">{course.topics}</p>
          <div className="flex items-baseline gap-[7px] mt-4">
            <b className="text-[1.7rem] font-extrabold tracking-[-.02em]">{course.price}</b>
            <span className="text-[.9rem] text-ink-3 font-bold">{course.period}</span>
          </div>
          <Link
            href={courseHref(course)}
            className="flex items-center justify-center gap-[10px] w-full font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 mt-5 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
          >
            Сургалт үзэх <span>→</span>
          </Link>
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
