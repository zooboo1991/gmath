import Link from "next/link";
import Reveal from "@/components/Reveal";
import { IconClock } from "@/components/icons";
import type { WeeklySlot } from "@/lib/weeklySchedule";

/**
 * One classroom class in the "Сонгон бэлтгэл" row.
 *
 * The generic course card was the wrong shape here. Four cards that differ
 * only by grade were each led by a two-line title ("Сонгон бэлтгэл — 5-р
 * анги") and a price repeated identically four times, so the one thing a
 * parent scans for — their child's year, then whether the hours clash with
 * school — was the smallest text on the card.
 *
 * So: the grade is the headline, the timetable is the body, and the price
 * (the same in all four) is a quiet line above the button.
 */
export default function SongonClassCard({
  grade,
  slots,
  price,
  period,
  href,
  seatsLeft,
  capacity,
}: {
  grade: string;
  slots: WeeklySlot[];
  price: string;
  period: string;
  href: string;
  /** Null when the class has no seat limit. */
  seatsLeft: number | null;
  capacity?: number;
}) {
  const full = seatsLeft !== null && seatsLeft <= 0;
  const nearlyFull = seatsLeft !== null && seatsLeft > 0 && seatsLeft <= 5;

  return (
    <Reveal className="card-flat flex flex-col px-[22px] py-[22px]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="block text-[.72rem] font-extrabold tracking-[.12em] uppercase text-blue-strong">
            Танхим
          </span>
          <b className="block text-[1.6rem] font-extrabold tracking-[-.02em] leading-none mt-1.5">
            {grade}
          </b>
        </div>
        {full ? (
          <span className="text-[.72rem] font-extrabold text-red-soft bg-red-soft/12 px-2.5 py-1 rounded-full shrink-0">
            Дүүрсэн
          </span>
        ) : nearlyFull ? (
          <span className="text-[.72rem] font-extrabold text-gold-strong bg-gold-soft px-2.5 py-1 rounded-full shrink-0">
            {seatsLeft} суудал
          </span>
        ) : null}
      </div>

      {/* The timetable, not a summary of it: a parent checks these three rows
          against their child's school shift before anything else matters. */}
      {slots.length > 0 && (
        <ul className="flex flex-col gap-1 mt-4">
          {slots.map((slot) => (
            <li
              key={`${slot.day}-${slot.time}`}
              className="flex items-center justify-between gap-2 text-[.85rem] border-b border-line last:border-0 py-1.5"
            >
              <span className="font-bold text-ink-2">{slot.day}</span>
              <span className="font-extrabold text-ink tabular-nums">{slot.time}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Kept to one line: at this card width the longer phrasing wrapped and
          turned a footnote into a paragraph. */}
      <div className="flex items-center gap-1.5 text-[.8rem] font-semibold text-ink-3 mt-3">
        <IconClock className="w-3.5 h-3.5 shrink-0" />
        2 цаг{capacity ? ` · ${capacity} хүртэл сурагч` : ""}
      </div>

      <div className="mt-auto pt-4">
        <div className="flex items-baseline gap-1.5 mb-3">
          <b className="text-[1.05rem] font-extrabold text-navy">{price}</b>
          <span className="text-[.82rem] text-ink-3 font-bold">{period}</span>
        </div>
        <Link
          href={href}
          className="flex items-center justify-center gap-[10px] w-full font-extrabold text-[.92rem] rounded-full px-[20px] py-[13px] btn-ring bg-surface text-ink hover:text-blue-strong transition-transform hover:-translate-y-0.5"
        >
          {full ? "Дэлгэрэнгүй харах" : "Дэлгэрэнгүй"} <span>→</span>
        </Link>
      </div>
    </Reveal>
  );
}
