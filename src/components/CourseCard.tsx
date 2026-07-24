import Reveal from "./Reveal";
import { IconCalendar, IconMonitor, IconPlay } from "./icons";

type CourseCardProps = {
  tag: string;
  title: string;
  topics: string;
  price: string;
  period: string;
  ctaHref: string;
  ctaLabel?: string;
  featured?: boolean;
  extra?: React.ReactNode;
};

export default function CourseCard({
  tag,
  title,
  topics,
  price,
  period,
  ctaHref,
  ctaLabel,
  featured = false,
  extra,
}: CourseCardProps) {
  const ctaClass = `flex items-center justify-center gap-[10px] w-full font-extrabold rounded-full px-[26px] py-[16px] transition-transform hover:-translate-y-0.5 ${
    featured
      ? "bg-gold text-[oklch(0.32_0.06_70)] shadow-gold hover:bg-gold-strong"
      : "bg-surface text-ink shadow-[inset_0_0_0_1.5px_var(--color-line-2)] hover:shadow-[inset_0_0_0_1.5px_var(--color-blue)] hover:text-blue-strong"
  }`;
  const label = ctaLabel ?? "Дэлгэрэнгүй";

  return (
    <Reveal
      className={`relative flex flex-col rounded-lg px-[26px] py-[28px] shadow-xs transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-md ${
        featured
          ? "border-[1.5px] border-gold shadow-lg bg-[linear-gradient(180deg,var(--color-gold-soft)_0%,var(--color-surface)_22%)]"
          : "border border-line bg-surface"
      }`}
    >
      <span className="text-[.76rem] font-extrabold tracking-[.1em] uppercase text-blue-strong">
        {tag}
      </span>
      <h3 className="text-[1.5rem] font-extrabold mt-1.5 tracking-[-.01em]">{title}</h3>
      <p className="text-[.95rem] text-ink-2 mt-1 font-semibold">{topics}</p>
      <div className="flex items-baseline gap-[7px] mt-5">
        <b className="text-[1.9rem] font-extrabold tracking-[-.02em]">{price}</b>
        <span className="text-[.9rem] text-ink-3 font-bold">{period}</span>
      </div>
      <div className="h-px bg-line my-5" />
      {extra}
      <div className="mt-auto pt-[22px]">
        <a href={ctaHref} className={ctaClass}>
          {label} <span>→</span>
        </a>
      </div>
    </Reveal>
  );
}

export function CourseMeta({ startDate, mode }: { startDate: string; mode: string }) {
  return (
    <>
      <div className="flex items-center gap-2 text-[.88rem] font-bold text-ink-2 mt-2">
        <IconCalendar className="w-[15px] h-[15px] text-gold-strong shrink-0" />
        Хичээллэх өдөр: {startDate}
      </div>
      <div className="flex items-center gap-2 text-[.88rem] font-bold text-ink-2 mt-1.5">
        <IconMonitor className="w-[15px] h-[15px] text-blue-strong shrink-0" />
        Төрөл: {mode}
      </div>
    </>
  );
}

export function VodStatus() {
  return (
    <div className="flex items-center gap-2 text-[.9rem] font-bold text-blue-strong">
      <IconPlay className="w-[15px] h-[15px] shrink-0" />
      Хэзээ ч эхлэх боломжтой
    </div>
  );
}
