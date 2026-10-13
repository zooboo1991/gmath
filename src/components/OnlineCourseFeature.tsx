import Reveal from "@/components/Reveal";
import { IconCalendar, IconPencil, IconPlayBox, IconTarget, IconVideoCamera } from "@/components/icons";
import type { Course } from "@/lib/db";
import { courseHref } from "@/lib/courseHref";
import { formatCourseDate } from "@/lib/courseDate";
import { courseTotals, courseWeeks, weeklyRhythm } from "@/lib/onlineCourse";

/**
 * An online olympiad course as the first thing on /courses: what it is, what
 * it adds up to (videos, Zoom lessons, homework, tests), when it starts and
 * what it costs, with the way into its own page.
 */
export default function OnlineCourseFeature({ course }: { course: Course }) {
  const totals = courseTotals(course.lessons, weeklyRhythm(course.weeklySchedule));
  const lastDay = courseWeeks(course.lessons).at(-1)?.end;
  const stats = [
    { value: totals.videos, label: "видео хичээл", icon: <IconPlayBox className="w-5 h-5" />, tone: "bg-blue-soft text-blue-strong" },
    { value: totals.zooms, label: "Zoom хичээл", icon: <IconVideoCamera className="w-5 h-5" />, tone: "bg-purple-soft text-purple" },
    { value: totals.tasks, label: "даалгавар", icon: <IconPencil className="w-5 h-5" />, tone: "bg-green-soft text-green" },
    { value: totals.tests, label: "сорил", icon: <IconTarget className="w-5 h-5" />, tone: "bg-gold-soft text-gold-strong" },
  ].filter((s) => s.value > 0);

  return (
    <Reveal className="card-flat card-flat--accent grid grid-cols-1 nav:grid-cols-[minmax(0,1fr)_300px] gap-6 nav:gap-10 px-[26px] py-[28px] nav:px-[34px] nav:py-[32px]">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
          {`Онлайн сургалт · ${course.tag}`}
        </span>
        <h2 className="text-[clamp(1.5rem,2.8vw,2rem)] font-extrabold leading-[1.14] tracking-[-.02em] text-ink mt-3 text-balance">
          {course.title}
        </h2>
        <p className="text-ink-2 font-medium mt-2.5 leading-[1.7] max-w-[62ch]">{course.topics}</p>
        {stats.length > 0 && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 mt-5">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-2 xs:gap-2.5 rounded-md bg-bg-soft px-2.5 xs:px-3 py-2.5">
                <span className={`w-9 h-9 rounded-[10px] grid place-items-center shrink-0 ${s.tone}`}>{s.icon}</span>
                <span className="leading-tight">
                  <b className="block text-[1.15rem] font-extrabold">{s.value}</b>
                  <small className="text-[.78rem] font-bold text-ink-3">{s.label}</small>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col nav:border-l nav:border-line nav:pl-10">
        {course.startDate && (
          <div className="flex items-center gap-2.5 text-ink-2 font-bold text-[.92rem]">
            <IconCalendar className="w-[18px] h-[18px] text-gold-strong shrink-0" />
            {`${formatCourseDate(course.startDate)}${lastDay ? ` – ${formatCourseDate(lastDay)}` : ""}`}
          </div>
        )}
        <div className="flex items-baseline gap-[7px] mt-4 flex-wrap">
          <b className="text-[1.9rem] font-extrabold tracking-[-.02em]">{course.price}</b>
          <span className="text-[.9rem] text-ink-3 font-bold">{course.period}</span>
        </div>
        <div className="mt-auto pt-6">
          <a
            href={courseHref(course)}
            className="flex items-center justify-center gap-[10px] w-full font-extrabold rounded-full px-[26px] py-[16px] bg-gold text-gold-ink shadow-gold transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
          >
            Дэлгэрэнгүй <span>→</span>
          </a>
        </div>
      </div>
    </Reveal>
  );
}
