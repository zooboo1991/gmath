"use client";

import { useEffect, useState } from "react";
import {
  PlacementQuestionCard,
  PlacementResultCard,
} from "@/components/assessment/PlacementCards";
import { IconCheckCircle, IconClose } from "@/components/icons";
import { filledTemplate, parseAnswerTemplate } from "@/lib/assessment/answerTemplate";
import {
  ANSWER_TYPE_SPECS,
  isBoxedAnswerCorrect,
  renderBoxedAnswer,
  toPublicBoxes,
} from "@/lib/assessment/answerShape";
import {
  answerFormatHint,
  isAnswerCorrect,
  nextLevelForTopic,
  overallLevel,
  topicScore,
  PLACEMENT_LEVEL_LABELS,
} from "@/lib/assessment/placement";
import type { PlacementProblem } from "@/lib/assessment/placementDb";

/**
 * Шалгалтыг сурагчийн нүдээр турших — админд.
 *
 * Дунд нь сурагчийн урсгалын яг тэр картууд (PlacementCards) — тоолуур,
 * явцын зурвас, бичих заавар бүгд адил. Сервер, төлбөр, бүртгэлд огт
 * хүрэхгүй: шатлах дүрэм, хариултын шалгагч цэвэр функц тул бүгд энд,
 * санах ойд явагдана. Админд нэмээд картын ГАДНА талд зөв/буруу,
 * зөв хариултыг харуулна — хариултын түлхүүрээ шалгах хэрэгсэл.
 */
export default function PlacementPreview({
  grade,
  minutes,
  problems,
  onClose,
}: {
  grade: number;
  minutes: number;
  problems: PlacementProblem[];
  onClose: () => void;
}) {
  // Гурван түвшин нь бүгд хариулттай сэдвүүд л туршигдана. Идэвхтэй эсэхийг
  // үл харгалзана — идэвхжүүлэхийн ӨМНӨ турших нь яг зорилго.
  const byOrder = new Map<number, PlacementProblem[]>();
  for (const p of problems.filter((p) => p.grade === grade)) {
    byOrder.set(p.topicOrder, [...(byOrder.get(p.topicOrder) ?? []), p]);
  }
  const topics = new Map<number, PlacementProblem[]>();
  const skipped: string[] = [];
  for (const [order, list] of [...byOrder.entries()].sort((a, b) => a[0] - b[0])) {
    const complete = [1, 2, 3].every((level) =>
      list.some(
        (p) =>
          p.level === level &&
          (p.answerType === "text"
            ? p.answers.length > 0
            : p.answerType === "template"
              ? parseAnswerTemplate(p.answerTemplate).values.every((v) => v !== "") &&
                parseAnswerTemplate(p.answerTemplate).values.length > 0
              : p.answerBoxes.length > 0 && p.answerBoxes.every((b) => b.value.trim() !== ""))
      )
    );
    if (complete) topics.set(order, list);
    else skipped.push(`${order}. ${list[0].topic}`);
  }

  const [steps, setSteps] = useState<{ topicOrder: number; level: number; isCorrect: boolean }[]>([]);
  const [answer, setAnswer] = useState("");
  const [boxValues, setBoxValues] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ correct: boolean; expected: string } | null>(null);
  const [deadlineAt, setDeadlineAt] = useState(() => Date.now() + minutes * 60_000);
  const [now, setNow] = useState(() => Date.now());

  // Тоолуур — сурагчийнхтай адил секунд тутам.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.floor((deadlineAt - now) / 1000));

  // Дараагийн бодлого — хөдөлгүүрийн ижил дүрмээр. Өгөгдөл жижиг тул memo хэрэггүй.
  let current: PlacementProblem | undefined;
  for (const [order, list] of topics) {
    const next = nextLevelForTopic({
      topicOrder: order,
      steps: steps.filter((s) => s.topicOrder === order),
    });
    if (next === null) continue;
    current = list.find((p) => p.level === next);
    break;
  }

  const boxed = current !== undefined && current.answerType !== "text";
  const expectedBoxes =
    current === undefined
      ? []
      : current.answerType === "template"
        ? parseAnswerTemplate(current.answerTemplate).values.map((value) => ({ value }))
        : current.answerBoxes;

  // Сурагчийн урсгал шинэ бодлого бүрд нүдээ шинэчилдэг; энд төлөв хоосон
  // үлдэж болох тул харуулж буй массиваараа шалгана — эс бөгөөс хоосон
  // Enter нь [] илгээгээд "буруу" гэж бүртгэгдэнэ.
  const shownValues =
    boxValues.length === expectedBoxes.length ? boxValues : expectedBoxes.map(() => "");

  const submit = () => {
    if (!current || remaining === 0) return;
    if (boxed ? shownValues.some((v) => !v.trim()) : !answer.trim()) return;
    const correct = boxed
      ? isBoxedAnswerCorrect(expectedBoxes, shownValues)
      : isAnswerCorrect(answer, current.answers);
    const expected = boxed
      ? current.answerType === "template"
        ? filledTemplate(current.answerTemplate)
        : renderBoxedAnswer(current.answerType, current.answerBoxes.map((b) => b.value))
      : current.answers.join("; ");
    setFeedback({ correct, expected });
    setSteps((s) => [...s, { topicOrder: current.topicOrder, level: current.level, isCorrect: correct }]);
    setAnswer("");
    setBoxValues([]);
  };

  const scores = [...topics.entries()].map(([order, list]) => ({
    topicOrder: order,
    topic: list[0].topic,
    score: topicScore({ topicOrder: order, steps: steps.filter((s) => s.topicOrder === order) }),
  }));
  // Хугацаа дуусахад сервер шууд дүгнэдэг — туршилт ч мөн адил.
  const done = topics.size > 0 && (current === undefined || remaining === 0);

  return (
    <div className="fixed inset-0 z-[100] bg-navy-deep/55 grid place-items-center px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-[640px] max-h-full overflow-y-auto">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="inline-flex items-center text-[.72rem] font-extrabold tracking-[.06em] uppercase text-gold-ink bg-gold px-2.5 py-1 rounded-full">
            {`Туршилт — ${grade}-р анги, сурагчид харагдахгүй`}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Хаах"
            className="w-8 h-8 rounded-full bg-surface grid place-items-center shrink-0"
          >
            <IconClose className="w-4 h-4 text-ink-3" />
          </button>
        </div>

        {skipped.length > 0 && (
          <p className="text-[.8rem] font-semibold text-gold-strong bg-gold-soft rounded-sm px-3 py-2 mb-3 leading-[1.55]">
            {`Гурван түвшин нь хариулттай болоогүй тул алгассан: ${skipped.join(", ")}`}
          </p>
        )}

        {topics.size === 0 ? (
          <p className="bg-surface rounded-lg px-5 py-4 text-ink-2 font-semibold text-[.9rem]">
            Турших сэдэв алга — эхлээд аль нэг сэдвийн гурван түвшинд хариулт оруулна уу.
          </p>
        ) : done ? (
          <>
            <PlacementResultCard
              levelLabel={PLACEMENT_LEVEL_LABELS[overallLevel(scores.map((s) => s.score))]}
              topics={scores}
              footer={
                <button
                  type="button"
                  onClick={() => {
                    setSteps([]);
                    setAnswer("");
                    setBoxValues([]);
                    setFeedback(null);
                    setDeadlineAt(Date.now() + minutes * 60_000);
                  }}
                  className="h-11 px-6 rounded-full bg-navy text-white font-extrabold text-[.9rem]"
                >
                  Дахин турших
                </button>
              }
            />
            <div className="bg-surface/90 rounded-lg px-5 py-4 mt-3">
              <b className="text-[.8rem] font-extrabold tracking-[.04em] uppercase text-ink-3 block mb-1.5">
                Туршилтын мэдээлэл
              </b>
              {feedback && (
                <p
                  className={`flex items-center gap-1.5 text-[.85rem] font-bold mb-2 ${
                    feedback.correct ? "text-green" : "text-red-soft"
                  }`}
                >
                  {feedback.correct ? (
                    <>
                      <IconCheckCircle className="w-4 h-4" /> Сүүлийн хариулт зөв
                    </>
                  ) : (
                    <>
                      <IconClose className="w-4 h-4" />
                      {`Сүүлийн хариулт буруу (зөв: ${feedback.expected})`}
                    </>
                  )}
                </p>
              )}
              <div className="divide-y divide-line">
                {scores.map((s) => (
                  <div key={s.topicOrder} className="flex items-center justify-between py-1.5 text-[.88rem]">
                    <span className="font-semibold text-ink-2">{s.topic}</span>
                    <b className="font-extrabold">{s.score}/3</b>
                  </div>
                ))}
              </div>
              <p className="text-[.8rem] font-semibold text-ink-3 mt-2 leading-[1.55]">
                Бодит шалгалтад энд AI дүгнэлт нэмж бичигдэнэ — туршилтад дуудагдахгүй.
              </p>
            </div>
          </>
        ) : current ? (
          <>
            <PlacementQuestionCard
              position={steps.length + 1}
              total={topics.size * 2}
              remainingSeconds={remaining}
              topic={current.topic}
              bodyLatex={current.bodyLatex}
              answerHint={
                current.answerType === "text"
                  ? answerFormatHint(current.answers)
                  : ANSWER_TYPE_SPECS[current.answerType].hint
              }
              answerType={current.answerType}
              answerBoxes={
                current.answerType === "template"
                  ? expectedBoxes.map((_, i) => ({ label: String(i + 1) }))
                  : toPublicBoxes(current.answerBoxes)
              }
              answerDisplay={
                current.answerType === "template"
                  ? parseAnswerTemplate(current.answerTemplate).display
                  : ""
              }
              answer={answer}
              onAnswerChange={setAnswer}
              boxValues={shownValues}
              onBoxesChange={setBoxValues}
              onSubmit={submit}
              busy={false}
              error={null}
            />
            {/* Өмнөх хариултын дүгнэлт — зөвхөн туршилтад, картын гадна. */}
            {feedback && (
              <p
                className={`flex items-center gap-1.5 bg-surface/90 rounded-md px-4 py-2.5 mt-3 text-[.85rem] font-bold ${
                  feedback.correct ? "text-green" : "text-red-soft"
                }`}
              >
                {feedback.correct ? (
                  <>
                    <IconCheckCircle className="w-4 h-4" /> Өмнөх хариулт зөв
                  </>
                ) : (
                  <>
                    <IconClose className="w-4 h-4" />
                    {`Өмнөх хариулт буруу (зөв: ${feedback.expected})`}
                  </>
                )}
              </p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
