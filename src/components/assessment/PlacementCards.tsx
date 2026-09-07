"use client";

import type { ReactNode } from "react";
import MathText from "@/components/assessment/MathText";
import PlacementRadar from "@/components/assessment/PlacementRadar";
import { IconClock } from "@/components/icons";
import AnswerBoxes from "@/components/assessment/AnswerBoxes";
import type { AnswerType, PublicAnswerBox } from "@/lib/assessment/answerShape";

/**
 * Шаталсан шалгалтын харагдах картууд — сурагчийн урсгал, админы туршилт
 * хоёулаа яг эдгээрийг ашигладаг тул хоёр дэлгэц хэзээ ч зөрөхгүй.
 * Өгөгдөл хаанаас ирэхийг эдгээр нь мэдэхгүй: сурагчийнх серверээс,
 * админыхых санах ойгоос ирдэг.
 */

export const PLACEMENT_CARD =
  "bg-surface border border-line rounded-lg shadow-sm px-[26px] py-[26px]";

export function PlacementQuestionCard({
  position,
  total,
  remainingSeconds,
  topic,
  bodyLatex,
  answerHint,
  answerType,
  answerBoxes,
  answerDisplay,
  answer,
  onAnswerChange,
  boxValues,
  onBoxesChange,
  onSubmit,
  busy,
  error,
}: {
  position: number;
  total: number;
  remainingSeconds: number;
  topic: string;
  bodyLatex: string;
  answerHint: string;
  answerType: AnswerType;
  answerBoxes: PublicAnswerBox[];
  answerDisplay: string;
  answer: string;
  onAnswerChange: (value: string) => void;
  boxValues: string[];
  onBoxesChange: (values: string[]) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <div className={PLACEMENT_CARD}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[.82rem] font-extrabold text-ink-3">
          {`Бодлого ${position} / ${total}`}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 text-[.9rem] font-extrabold tabular-nums ${
            remainingSeconds < 300 ? "text-red-soft" : "text-ink-2"
          }`}
        >
          <IconClock className="w-4 h-4" /> {minutes}:{seconds}
        </span>
      </div>

      {/* Явцын зурвас. */}
      <div className="h-1.5 bg-bg-soft rounded-full mt-3 overflow-hidden">
        <div
          className="h-full bg-blue rounded-full transition-all"
          style={{ width: `${((position - 1) / total) * 100}%` }}
        />
      </div>

      <div className="mt-5">
        <span className="inline-flex items-center text-[.72rem] font-extrabold tracking-[.06em] uppercase text-blue-strong bg-blue-soft px-2.5 py-1 rounded-full">
          {topic}
        </span>
        <div className="text-[1.05rem] leading-[1.7] mt-3">
          <MathText source={bodyLatex} />
        </div>
      </div>

      {answerType === "text" ? (
        <div className="flex items-stretch gap-2.5 mt-5">
          <input
            value={answer}
            onChange={(e) => onAnswerChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            placeholder="Хариултаа бичнэ үү"
            inputMode="text"
            autoFocus
            className="flex-1 h-12 rounded-md border-[1.5px] border-line-2 px-4 font-bold text-[1.05rem] bg-surface focus:border-blue outline-none"
          />
          <button
            type="button"
            disabled={busy || !answer.trim()}
            onClick={onSubmit}
            className="shrink-0 px-6 rounded-md bg-blue text-white font-extrabold shadow-blue disabled:opacity-50"
          >
            {busy ? "…" : "Илгээх"}
          </button>
        </div>
      ) : (
        <div className="flex items-end justify-between gap-4 flex-wrap mt-5">
          <AnswerBoxes
            type={answerType}
            boxes={answerBoxes}
            values={boxValues}
            onChange={onBoxesChange}
            onSubmit={onSubmit}
            display={answerDisplay}
          />
          <button
            type="button"
            disabled={busy || boxValues.length !== answerBoxes.length || boxValues.some((v) => !v.trim())}
            onClick={onSubmit}
            className="shrink-0 h-12 px-6 rounded-md bg-blue text-white font-extrabold shadow-blue disabled:opacity-50"
          >
            {busy ? "…" : "Илгээх"}
          </button>
        </div>
      )}
      <p className="text-[.8rem] font-semibold text-ink-3 mt-2 leading-[1.55]">
        {`${answerHint} Илгээснийг буцаах боломжгүй.`}
      </p>
      {error && <p className="text-red-soft font-bold text-[.85rem] mt-2">{error}</p>}
    </div>
  );
}

export function PlacementResultCard({
  levelLabel,
  topics,
  recommendation,
  footer,
}: {
  levelLabel: string;
  topics: { topicOrder: number; topic: string; score: number }[];
  recommendation?: string;
  footer: ReactNode;
}) {
  return (
    <div className={PLACEMENT_CARD}>
      <div className="text-center">
        <span className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-blue-soft">
          <b className="text-[1.15rem] font-extrabold text-blue-strong">{levelLabel}</b>
        </span>
        <h2 className="text-[1.3rem] font-extrabold mt-4">Түвшин тогтоолтын үр дүн</h2>
        <p className="text-ink-3 font-semibold text-[.9rem] mt-1">
          Сэдэв бүрийн ойлголт — 0-оос 3 хүртэл
        </p>
      </div>

      <div className="mt-5">
        <PlacementRadar topics={topics} />
      </div>

      {recommendation && (
        <div className="bg-bg-soft rounded-md px-5 py-4 mt-5">
          <b className="font-extrabold text-[.95rem] block mb-2">Дүгнэлт</b>
          <p className="text-ink-2 font-medium leading-[1.75] whitespace-pre-wrap text-[.95rem]">
            {recommendation}
          </p>
        </div>
      )}

      <div className="flex items-center justify-center gap-3 flex-wrap mt-6">{footer}</div>
    </div>
  );
}
