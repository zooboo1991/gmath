"use client";

import { useMemo, useState } from "react";
import MathText from "@/components/assessment/MathText";
import PlacementRadar from "@/components/assessment/PlacementRadar";
import { IconCheckCircle, IconClose } from "@/components/icons";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import {
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
 * Сервер, төлбөр, бүртгэлд огт хүрэхгүй: шатлах дүрэм, хариултын шалгагч
 * хоёулаа цэвэр функц тул бүгд энд, санах ойд явагдана. Сурагчаас ганц
 * ялгаа нь: алхам бүрд зөв/буруу, зөв хариултыг нь ил харуулна — энэ бол
 * хариултын түлхүүрээ шалгах хэрэгсэл.
 */
export default function PlacementPreview({
  grade,
  problems,
  onClose,
}: {
  grade: number;
  problems: PlacementProblem[];
  onClose: () => void;
}) {
  // Гурван түвшин нь бүгд хариулттай сэдвүүд л туршигдана. Идэвхтэй эсэхийг
  // үл харгалзана — идэвхжүүлэхийн ӨМНӨ турших нь яг зорилго.
  const { topics, skipped } = useMemo(() => {
    const byOrder = new Map<number, PlacementProblem[]>();
    for (const p of problems.filter((p) => p.grade === grade)) {
      byOrder.set(p.topicOrder, [...(byOrder.get(p.topicOrder) ?? []), p]);
    }
    const ready = new Map<number, PlacementProblem[]>();
    const skipped: string[] = [];
    for (const [order, list] of [...byOrder.entries()].sort((a, b) => a[0] - b[0])) {
      const complete = [1, 2, 3].every((level) =>
        list.some((p) => p.level === level && p.answers.length > 0)
      );
      if (complete) ready.set(order, list);
      else skipped.push(`${order}. ${list[0].topic}`);
    }
    return { topics: ready, skipped };
  }, [problems, grade]);

  const [steps, setSteps] = useState<{ topicOrder: number; level: number; isCorrect: boolean }[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; expected: string } | null>(null);

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

  const submit = () => {
    if (!current || !answer.trim()) return;
    const correct = isAnswerCorrect(answer, current.answers);
    setFeedback({ correct, expected: current.answers.join("; ") });
    setSteps((s) => [...s, { topicOrder: current.topicOrder, level: current.level, isCorrect: correct }]);
    setAnswer("");
  };

  const scores = [...topics.entries()].map(([order, list]) => ({
    topicOrder: order,
    topic: list[0].topic,
    score: topicScore({ topicOrder: order, steps: steps.filter((s) => s.topicOrder === order) }),
  }));
  const done = topics.size > 0 && current === undefined;
  const answered = steps.length;

  return (
    <div className="fixed inset-0 z-[100] bg-navy-deep/55 grid place-items-center px-4 py-8 overflow-y-auto">
      <div className="bg-surface rounded-lg shadow-lg w-full max-w-[640px] px-6 py-6 max-h-full overflow-y-auto relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Хаах"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-bg-soft grid place-items-center"
        >
          <IconClose className="w-4 h-4 text-ink-3" />
        </button>

        <span className="inline-flex items-center text-[.72rem] font-extrabold tracking-[.06em] uppercase text-gold-strong bg-gold-soft px-2.5 py-1 rounded-full">
          Туршилт — сурагчид харагдахгүй
        </span>
        <h3 className="text-[1.2rem] font-extrabold mt-2">{`${grade}-р ангийн шалгалт`}</h3>

        {skipped.length > 0 && (
          <p className="text-[.8rem] font-semibold text-gold-strong bg-gold-soft rounded-sm px-3 py-2 mt-2 leading-[1.55]">
            {`Гурван түвшин нь хариулттай болоогүй тул алгассан: ${skipped.join(", ")}`}
          </p>
        )}

        {topics.size === 0 ? (
          <p className="text-ink-2 font-semibold text-[.9rem] mt-4">
            Турших сэдэв алга — эхлээд аль нэг сэдвийн гурван түвшинд хариулт оруулна уу.
          </p>
        ) : done ? (
          <>
            <div className="text-center mt-4">
              <span className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-blue-soft">
                <b className="text-[1.05rem] font-extrabold text-blue-strong">
                  {PLACEMENT_LEVEL_LABELS[overallLevel(scores.map((s) => s.score))]}
                </b>
              </span>
            </div>
            <PlacementRadar topics={scores} />
            <div className="bg-bg-soft rounded-sm px-4 py-3 divide-y divide-line">
              {scores.map((s) => (
                <div key={s.topicOrder} className="flex items-center justify-between py-1.5 text-[.88rem]">
                  <span className="font-semibold text-ink-2">{s.topic}</span>
                  <b className="font-extrabold">{s.score}/3</b>
                </div>
              ))}
            </div>
            <p className="text-[.8rem] font-semibold text-ink-3 mt-3 leading-[1.55]">
              Бодит шалгалтад энд AI дүгнэлт нэмж бичигдэнэ — туршилтад дуудагдахгүй.
            </p>
            <button
              type="button"
              onClick={() => {
                setSteps([]);
                setFeedback(null);
              }}
              className="h-11 px-5 mt-3 rounded-md bg-navy text-white font-extrabold text-[.88rem]"
            >
              Дахин турших
            </button>
          </>
        ) : current ? (
          <>
            <div className="flex items-center justify-between mt-3">
              <span className="text-[.8rem] font-extrabold text-ink-3">
                {`Бодлого ${answered + 1} / ${topics.size * 2}`}
              </span>
              <span className="text-[.78rem] font-extrabold text-blue-strong bg-blue-soft px-2.5 py-1 rounded-full">
                {`${current.topic} · ${current.level}-р түвшин`}
              </span>
            </div>

            <div className="text-[1rem] leading-[1.7] mt-3">
              <MathText source={current.bodyLatex} />
            </div>

            {/* Өмнөх хариултын дүгнэлт — админд л харагдана. */}
            {feedback && (
              <p
                className={`flex items-center gap-1.5 text-[.85rem] font-bold mt-3 ${
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

            <div className="flex items-stretch gap-2.5 mt-4">
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Хариултаа бичнэ үү"
                autoFocus
                className={`${INPUT_CLASS} flex-1 h-12 text-[1rem]`}
              />
              <button
                type="button"
                disabled={!answer.trim()}
                onClick={submit}
                className="shrink-0 px-5 rounded-md bg-blue text-white font-extrabold disabled:opacity-50"
              >
                Илгээх
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
