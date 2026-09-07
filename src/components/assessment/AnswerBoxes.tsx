"use client";

import MathText from "@/components/assessment/MathText";
import type { AnswerType, PublicAnswerBox } from "@/lib/assessment/answerShape";

/**
 * ЭЕШ-ын 2-р хэсгийн маягийн хариултын нүднүүд.
 *
 * Хэлбэрийг нүд өөрөө хэлж өгдөг тул сурагч "бутархайгаар бичих үү,
 * аравтаар уу" гэж эргэлзэхгүй — зөвхөн цифр нөхнө.
 */

const BOX =
  "h-12 w-[64px] rounded-md border-[1.5px] border-line-2 bg-surface text-center font-bold text-[1.05rem] focus:border-blue outline-none";

function Box({
  value,
  onChange,
  onSubmit,
  label,
  autoFocus,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  label?: string;
  autoFocus?: boolean;
  width?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSubmit()}
      inputMode="text"
      autoFocus={autoFocus}
      aria-label={label ?? "Хариултын нүд"}
      className={`${BOX} ${width ?? ""}`}
    />
  );
}

export default function AnswerBoxes({
  type,
  boxes,
  values,
  onChange,
  onSubmit,
  display,
}: {
  type: AnswerType;
  boxes: PublicAnswerBox[];
  values: string[];
  onChange: (values: string[]) => void;
  onSubmit: () => void;
  /** Загвар төрөлд: дугаарласан хоосон нүдтэй илэрхийлэл. */
  display?: string;
}) {
  const set = (i: number, v: string) => {
    const next = [...values];
    next[i] = v;
    onChange(next);
  };
  const at = (i: number) => values[i] ?? "";

  if (type === "template") {
    // Нүд нь зэрэг, бутархай дотор ч орж болох тул илэрхийллийн дотор
    // жинхэнэ input байрлуулах боломжгүй — ЭЕШ-ийн адилаар илэрхийлэлд
    // дугаарласан хоосон нүд харуулж, доор нь дугаараар нь бөглүүлнэ.
    return (
      <div>
        {display && (
          <div className="text-[1.25rem] leading-[2] mb-3">
            <MathText source={`$${display}$`} />
          </div>
        )}
        <div className="flex items-end gap-2.5 flex-wrap">
          {boxes.map((box, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className="text-[.76rem] font-extrabold text-ink-3 text-center">
                {box.label ?? String(i + 1)}
              </span>
              <Box
                value={at(i)}
                onChange={(v) => set(i, v)}
                onSubmit={onSubmit}
                label={`${box.label ?? i + 1}-р нүд`}
                autoFocus={i === 0}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "fraction" || type === "mixed") {
    const offset = type === "mixed" ? 1 : 0;
    return (
      <div className="flex items-center gap-3">
        {type === "mixed" && (
          <Box value={at(0)} onChange={(v) => set(0, v)} onSubmit={onSubmit} label="Бүхэл хэсэг" autoFocus />
        )}
        <div className="flex flex-col items-center gap-1.5">
          <Box
            value={at(offset)}
            onChange={(v) => set(offset, v)}
            onSubmit={onSubmit}
            label="Хүртэгч"
            autoFocus={type === "fraction"}
          />
          <div className="h-[2px] w-[76px] bg-ink rounded-full" />
          <Box value={at(offset + 1)} onChange={(v) => set(offset + 1, v)} onSubmit={onSubmit} label="Хуваарь" />
        </div>
      </div>
    );
  }

  if (type === "radical") {
    return (
      <div className="flex items-end gap-1">
        <Box value={at(0)} onChange={(v) => set(0, v)} onSubmit={onSubmit} label="Язгуурын өмнөх тоо" autoFocus />
        <span className="text-[2rem] leading-none font-light pb-1.5" aria-hidden="true">
          √
        </span>
        <div className="border-t-[2px] border-ink pt-1">
          <Box value={at(1)} onChange={(v) => set(1, v)} onSubmit={onSubmit} label="Язгуур доторх тоо" />
        </div>
      </div>
    );
  }

  // integer, decimal, list — нэг эгнээ нүд; list-д нэр байвал дээр нь харагдана.
  return (
    <div className="flex items-end gap-2.5 flex-wrap">
      {boxes.map((box, i) => (
        <div key={i} className="flex flex-col gap-1">
          {box.label && (
            <span className="text-[.76rem] font-extrabold text-ink-3 text-center">{box.label}</span>
          )}
          <Box
            value={at(i)}
            onChange={(v) => set(i, v)}
            onSubmit={onSubmit}
            label={box.label}
            autoFocus={i === 0}
            width={type === "decimal" ? "w-[96px]" : undefined}
          />
        </div>
      ))}
    </div>
  );
}
