import type { ArticleSummary, Course } from "@/lib/db";
import Reveal from "@/components/Reveal";
import CourseCard from "@/components/CourseCard";
import { RegisterTriggerButton } from "./ProgramRegister";
import RelatedArticles from "./RelatedArticles";
import type { RelatedCourse } from "./CourseDetail";
import {
  IconBook,
  IconCalendar,
  IconCheckCircle,
  IconClock,
  IconMonitor,
  IconPencil,
  IconPlayBox,
  IconTarget,
  IconTrophy,
  IconVideoCamera,
} from "@/components/icons";
import { formatCourseDate } from "@/lib/courseDate";
import { onlineOlympiadCourse } from "@/lib/siteContent";
import { courseTotals, courseWeeks, shortRange, weeklyRhythm, type OnlineLessonKind } from "@/lib/onlineCourse";

/**
 * An online olympiad course run week by week: two video lessons, two sets of
 * problems, a Zoom lesson with the teacher and a test, on the same days every
 * week, one subject a week.
 *
 * A parent deciding on such a course asks what a week looks like and what is
 * taught when — so the page is built around the weekly rhythm and the
 * week-by-week subjects, both read from the course row (see lib/onlineCourse)
 * so the teacher edits them in the admin like any other course.
 */

const KIND_LABEL: Record<OnlineLessonKind, string> = { video: "Видео", zoom: "Zoom", other: "Хичээл" };

function KindIcon({ kind, className }: { kind: OnlineLessonKind; className?: string }) {
  return kind === "zoom" ? <IconVideoCamera className={className} /> : <IconPlayBox className={className} />;
}

/** Icon and colour for a rhythm line, by what happens that day. */
function rhythmLook(text: string): { icon: React.ReactNode; tone: string } {
  if (/^видео/i.test(text)) return { icon: <IconPlayBox className="w-5 h-5" />, tone: "bg-blue-soft text-blue-strong" };
  if (/^даалгавар/i.test(text)) return { icon: <IconPencil className="w-5 h-5" />, tone: "bg-green-soft text-green" };
  if (/^zoom/i.test(text)) return { icon: <IconVideoCamera className="w-5 h-5" />, tone: "bg-purple-soft text-purple" };
  if (/^сорил/i.test(text)) return { icon: <IconTarget className="w-5 h-5" />, tone: "bg-gold-soft text-gold-strong" };
  return { icon: <IconCalendar className="w-5 h-5" />, tone: "bg-bg-soft text-ink-3" };
}

const Eyebrow = ({ children, center }: { children: React.ReactNode; center?: boolean }) => (
  <span
    className={`inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong ${center ? "justify-center" : ""}`}
  >
    {children}
  </span>
);

export default function OnlineOlympiadDetail({
  course,
  related,
  articles,
}: {
  course: Course;
  related: RelatedCourse[];
  articles: ArticleSummary[];
}) {
  // Same shape the ordinary course page builds — /api/enroll reads `tag` server-side.
  const program = {
    id: course.id,
    label: `${course.title} (${course.tag})`,
    price: course.price,
    tag: course.tag,
    splittable: false,
    songon: false,
  };
  const rhythm = weeklyRhythm(course.weeklySchedule);
  const weeks = courseWeeks(course.lessons);
  const totals = courseTotals(course.lessons, rhythm);
  const infoSession = course.slug ? onlineOlympiadCourse.infoSessions[course.slug] : undefined;
  const lastDay = weeks.at(-1)?.end;

  const stats = [
    { value: totals.videos, label: "видео хичээл", icon: <IconPlayBox className="w-6 h-6" />, tone: "bg-blue-soft text-blue-strong" },
    { value: totals.zooms, label: "Zoom хичээл", icon: <IconVideoCamera className="w-6 h-6" />, tone: "bg-purple-soft text-purple" },
    { value: totals.tasks, label: "даалгавар", icon: <IconPencil className="w-6 h-6" />, tone: "bg-green-soft text-green" },
    { value: totals.tests, label: "сорил", icon: <IconTarget className="w-6 h-6" />, tone: "bg-gold-soft text-gold-strong" },
  ].filter((s) => s.value > 0);

  const register = (wide: boolean) => (
    <RegisterTriggerButton
      program={program}
      className={`inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-gold-ink shadow-gold transition-transform hover:-translate-y-0.5 hover:bg-gold-strong ${
        wide ? "w-full px-[26px] py-4" : "px-[34px] py-[19px] text-[1.075rem]"
      }`}
    >
      {wide ? "Бүртгүүлэх" : "Сургалтанд бүртгүүлэх"} <span>→</span>
    </RegisterTriggerButton>
  );

  return (
    <>
      <section className="hero-navy relative text-white overflow-hidden">
        <div className="hero-dotgrid pointer-events-none absolute inset-0 opacity-50" />
        <div className="wrap relative z-[2] py-[clamp(48px,7vw,84px)] max-w-[780px]">
          <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-gold bg-white/9 px-[14px] py-2 rounded-full before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
            {course.tag}
          </span>
          <h1 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] font-extrabold leading-[1.14] tracking-[-.02em] text-balance">
            {course.title}
          </h1>
          <p className="mt-4 text-navy-ink-2 text-[1.05rem] font-semibold max-w-[58ch]">{course.topics}</p>

          <div className="flex gap-[26px] mt-[26px] flex-wrap">
            {course.startDate && (
              <div className="flex items-center gap-[10px]">
                <IconCalendar className="w-[22px] h-[22px] text-gold" />
                <div>
                  <b className="text-[1.3rem] font-extrabold block leading-none">
                    {formatCourseDate(course.startDate).slice(5)}
                    {lastDay ? `–${lastDay.slice(5).replace("-", ".")}` : ""}
                  </b>
                  <small className="text-navy-ink-2 font-bold text-[.78rem]">{course.startDate.slice(0, 4)} он</small>
                </div>
              </div>
            )}
            {totals.weeks > 0 && (
              <div className="flex items-center gap-[10px]">
                <IconClock className="w-[22px] h-[22px] text-gold" />
                <div>
                  <b className="text-[1.3rem] font-extrabold block leading-none">{totals.weeks}</b>
                  <small className="text-navy-ink-2 font-bold text-[.78rem]">долоо хоног</small>
                </div>
              </div>
            )}
            <div className="flex items-center gap-[10px]">
              <IconMonitor className="w-[22px] h-[22px] text-gold" />
              <div>
                <b className="text-[1.3rem] font-extrabold block leading-none">Онлайн</b>
                <small className="text-navy-ink-2 font-bold text-[.78rem]">видео, Zoom, вэб</small>
              </div>
            </div>
          </div>

          <div className="mt-7 flex items-center gap-4 flex-wrap">
            {register(false)}
            {infoSession && (
              <span className="inline-flex items-center gap-2 text-[.9rem] font-bold text-white bg-white/10 rounded-full px-4 py-2.5">
                <IconVideoCamera className="w-4 h-4 text-gold" />
                {`Мэдээлэл өгөх уулзалт: ${infoSession}`}
              </span>
            )}
          </div>
        </div>
      </section>

      {stats.length > 0 && (
        <section className="section-pad">
          <div className="wrap">
            <div className="max-w-[680px] mx-auto text-center">
              <Eyebrow center>Сургалтын бүтэц</Eyebrow>
              <h2 className="text-[clamp(1.6rem,3vw,2.1rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
                {`${totals.weeks} долоо хоногт юу үзэх вэ`}
              </h2>
              <p className="text-ink-2 font-medium mt-4 leading-[1.75]">{onlineOlympiadCourse.format}.</p>
            </div>
            <ul className="grid grid-cols-2 nav:grid-cols-4 gap-[18px] max-w-[980px] mx-auto mt-[40px]">
              {stats.map((s) => (
                <Reveal key={s.label} as="li" className="card-flat px-[22px] py-[24px] text-center">
                  <span className={`w-12 h-12 rounded-[14px] grid place-items-center mx-auto mb-3 ${s.tone}`}>{s.icon}</span>
                  <b className="block font-extrabold text-ink text-[1.9rem] leading-none tabular-nums">{s.value}</b>
                  <span className="block text-ink-2 font-bold text-[.92rem] mt-1.5">{s.label}</span>
                </Reveal>
              ))}
            </ul>
            <p className="text-ink-3 font-semibold text-[.9rem] text-center max-w-[640px] mx-auto mt-6 leading-[1.65]">
              {onlineOlympiadCourse.taskNote}
            </p>
          </div>
        </section>
      )}

      {rhythm.length > 0 && (
        <section className="section-pad bg-bg-soft">
          <div className="wrap max-w-[860px]">
            <Eyebrow>Долоо хоногийн хэмнэл</Eyebrow>
            <h2 className="text-[clamp(1.4rem,2.6vw,1.8rem)] font-extrabold leading-[1.14] text-ink mt-3.5">
              Долоо хоног бүр ижил хуваариар
            </h2>
            <ul className="flex flex-col gap-2.5 mt-6">
              {rhythm.map((r) => {
                const look = rhythmLook(r.text);
                return (
                  <li key={`${r.day}-${r.text}`} className="bg-surface border border-line rounded-md px-4 py-3.5 flex items-center gap-4">
                    <span className={`w-10 h-10 rounded-[12px] grid place-items-center shrink-0 ${look.tone}`}>{look.icon}</span>
                    <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[110px_130px_1fr] gap-x-4 gap-y-0.5 items-baseline">
                      <b className="font-extrabold text-ink text-[.98rem]">{r.day}</b>
                      <span className="font-bold text-blue-strong text-[.9rem] tabular-nums">{r.time}</span>
                      <span className="text-ink-2 font-semibold text-[.92rem] leading-[1.5]">{r.text}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-ink-3 font-semibold text-[.88rem] mt-4 leading-[1.65]">{onlineOlympiadCourse.videoNote}</p>
          </div>
        </section>
      )}

      {weeks.length > 0 && (
        <section className="section-pad">
          <div className="wrap max-w-[980px]">
            <Eyebrow>Сэдвийн хуваарь</Eyebrow>
            <h2 className="text-[clamp(1.4rem,2.6vw,1.8rem)] font-extrabold leading-[1.14] text-ink mt-3.5">
              {`Долоо хоног бүр нэг сэдэв`}
            </h2>
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              {weeks.map((w) => (
                <Reveal key={w.start} as="li" className="card-flat px-5 py-5">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="text-[.76rem] font-extrabold tracking-[.08em] uppercase text-blue-strong">
                      {`${w.number}-р долоо хоног`}
                    </span>
                    <span className="text-[.82rem] font-bold text-ink-3 tabular-nums">{shortRange(w.start, w.end)}</span>
                  </div>
                  <b className="block font-extrabold text-ink text-[1.08rem] mt-1.5 leading-[1.35]">{w.subjects.join(" · ")}</b>
                  <ul className="flex flex-col mt-3">
                    {w.lessons.map((l) => (
                      <li key={l.date + l.title} className="flex items-center gap-2.5 border-t border-line py-2 text-[.88rem]">
                        <KindIcon kind={l.kind} className="w-4 h-4 text-blue-strong shrink-0" />
                        <span className="font-bold text-ink-2 min-w-0 flex-1">{l.title}</span>
                        <span className="font-semibold text-ink-3 shrink-0">{`${KIND_LABEL[l.kind]} · ${l.weekday}`}</span>
                      </li>
                    ))}
                  </ul>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section className="section-pad bg-bg-soft">
        <div className="wrap grid grid-cols-1 nav:grid-cols-2 gap-6 max-w-[980px]">
          <div className="bg-surface border border-line rounded-lg px-7 py-8">
            <span className="w-12 h-12 rounded-[14px] grid place-items-center bg-gold-soft text-gold-strong">
              <IconTrophy className="w-6 h-6" />
            </span>
            <b className="block font-extrabold text-ink text-[1.15rem] mt-4">Сертификат</b>
            <p className="text-ink-2 font-medium text-[.95rem] leading-[1.65] mt-2">{onlineOlympiadCourse.certificate}</p>
            <ul className="flex flex-col gap-2 mt-4">
              {["Ирц", "Даалгаврын гүйцэтгэл", "Сорилын гүйцэтгэл"].map((item) => (
                <li key={item} className="flex items-center gap-2 text-[.92rem] font-bold text-ink-2">
                  <IconCheckCircle className="w-4 h-4 text-green shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-surface border border-line rounded-lg shadow-md px-8 py-8 text-center flex flex-col justify-center">
            <IconBook className="w-7 h-7 text-blue-strong mx-auto" />
            <small className="font-extrabold text-ink-2 text-[.9rem] block mt-3">Сургалтын төлбөр</small>
            <b className="block text-[2.1rem] font-extrabold text-navy mt-1.5">
              {course.price} <span className="text-[1rem] text-ink-3 font-bold">{course.period}</span>
            </b>
            <p className="text-ink-3 font-semibold text-[.92rem] mt-3">
              {course.startDate ? `Эхлэх огноо: ${formatCourseDate(course.startDate)}. ` : ""}
              Бүртгүүлсний дараа хичээлийн хуваарь, видео, даалгавар профайл дээр тань гарна.
            </p>
            <div className="mt-6">{register(true)}</div>
          </div>
        </div>
      </section>

      <RelatedArticles articles={articles} />

      {related.length > 0 && (
        <section className="section-pad">
          <div className="wrap">
            <h2 className="text-[1.4rem] font-extrabold mb-[22px]">Бусад сургалт</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 nav:grid-cols-3 gap-5">
              {related.map((r) => (
                <CourseCard key={r.href} tag={r.tag} title={r.title} topics={r.topics} price={r.price} period={r.period} ctaHref={r.href} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
