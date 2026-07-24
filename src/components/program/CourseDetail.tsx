import type { Course } from "@/lib/db";
import { RegisterTriggerButton } from "./ProgramRegister";
import CourseCard from "@/components/CourseCard";
import {
  IconCalendar,
  IconMonitor,
  IconBook,
  IconPlayBox,
  IconPeopleHero,
  IconTarget,
  IconMessenger,
} from "@/components/icons";

const aboutItems = (lessonCount: number) => [
  {
    icon: <IconMonitor className="w-6 h-6" />,
    iconBg: "bg-blue-soft text-blue-strong",
    title: "Хаанаас ч хамрагдана",
    text: "Улаанбаатар, орон нутаг ялгаагүй интернэттэй газраас онлайнаар хамрагдах боломжтой.",
  },
  {
    icon: <IconCalendar className="w-6 h-6" />,
    iconBg: "bg-gold-soft text-gold-strong",
    title: lessonCount > 0 ? `Нийт ${lessonCount} хичээл` : "Тогтмол хуваарь",
    text: "Хуваарийн дагуу тогтмол үргэлжлэх эрчимжүүлсэн хичээллэлт.",
  },
  {
    icon: <IconPlayBox className="w-6 h-6" />,
    iconBg: "bg-green-soft text-green",
    title: "Бичлэг үлдэнэ",
    text: "Тасалсан хичээлээ бичлэгээр нөхөж, дахин үзэх боломжтой.",
  },
  {
    icon: <IconPeopleHero className="w-6 h-6" />,
    iconBg: "bg-[oklch(0.93_0.04_300)] text-[oklch(0.52_0.15_300)]",
    title: "Zoom-ээр хичээллэнэ",
    text: "Сургалтыг zoom-ээр орох ба багш сурагчидтай харилцаад хичээллэдэг.",
  },
  {
    icon: <IconTarget className="w-6 h-6" />,
    iconBg: "bg-blue-soft text-blue-strong",
    title: "Бодлогод суурилсан арга зүй",
    text: "Практик буюу олимпиадад ирдэг бодлогуудыг хэрхэн бодох талаар бодлого дээр суурилж заадаг.",
  },
  {
    icon: <IconMessenger className="w-6 h-6" />,
    iconBg: "bg-gold-soft text-gold-strong",
    text: "Сургалтын фэйсбүүк групп үүсгэх ба группт сургалтын талаарх зүйлсээ чөлөөтэй ярилцдаг.",
    title: "Facebook групп",
  },
];

export type RelatedCourse = {
  tag: string;
  title: string;
  topics: string;
  price: string;
  period: string;
  href: string;
};

export default function CourseDetail({ course, related }: { course: Course; related: RelatedCourse[] }) {
  const program = { id: course.id, label: `${course.title} (${course.tag})`, price: course.price };

  return (
    <>
      <section className="relative text-white overflow-hidden bg-[radial-gradient(120%_120%_at_85%_0%,rgba(14,95,196,.55),transparent_55%),radial-gradient(90%_90%_at_0%_100%,rgba(8,47,94,.7),transparent_60%),linear-gradient(158deg,var(--color-navy),var(--color-navy-deep))]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.05)_1px,transparent_1px)] bg-[length:26px_26px] opacity-50 [mask-image:linear-gradient(180deg,#000,transparent_70%)]" />

        <div className="wrap relative z-[2] py-[clamp(48px,7vw,84px)] max-w-[760px]">
          <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-gold before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
            {course.tag}
          </span>
          <h1 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] font-extrabold leading-[1.14] tracking-[-.02em] text-balance">
            {course.title}
          </h1>
          <p className="mt-4 text-[oklch(0.86_0.025_250)] text-[1.05rem] font-semibold max-w-[56ch]">
            {course.topics}
          </p>

          <div className="flex gap-[26px] mt-[26px] flex-wrap">
            {course.startDate && (
              <div className="flex items-center gap-[10px]">
                <IconCalendar className="w-[22px] h-[22px] text-gold" />
                <div>
                  <b className="text-[1.3rem] font-extrabold block leading-none">{course.startDate}</b>
                  <small className="text-[oklch(0.82_0.025_250)] font-bold text-[.78rem]">эхлэх огноо</small>
                </div>
              </div>
            )}
            {course.lessons.length > 0 && (
              <div className="flex items-center gap-[10px]">
                <IconBook className="w-[22px] h-[22px] text-gold" />
                <div>
                  <b className="text-[1.3rem] font-extrabold block leading-none">{course.lessons.length}</b>
                  <small className="text-[oklch(0.82_0.025_250)] font-bold text-[.78rem]">хичээл</small>
                </div>
              </div>
            )}
            {course.mode && (
              <div className="flex items-center gap-[10px]">
                <IconMonitor className="w-[22px] h-[22px] text-gold" />
                <div>
                  <b className="text-[1.3rem] font-extrabold block leading-none">{course.mode}</b>
                  <small className="text-[oklch(0.82_0.025_250)] font-bold text-[.78rem]">төрөл</small>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6">
            <RegisterTriggerButton program={program} className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-[oklch(0.32_0.06_70)] shadow-gold px-[34px] py-[19px] text-[1.075rem] transition-transform hover:-translate-y-0.5 hover:bg-gold-strong">
              Сургалтанд бүртгүүлэх <span>→</span>
            </RegisterTriggerButton>
          </div>
        </div>
      </section>

      {course.lessons.length > 0 && (
        <section className="section-pad">
          <div className="wrap max-w-[760px]">
            <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
              {course.lessons.length} ХИЧЭЭЛИЙН ХУВААРЬ
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.1rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 mb-[26px]">
              Сургалтын агуулга
            </h2>
            <div className="flex flex-col gap-3">
              {course.lessons.map((lesson, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 flex-wrap bg-surface border border-line rounded-md shadow-xs px-6 py-5"
                >
                  <div className="flex items-center gap-4">
                    <span className="w-9 h-9 rounded-md bg-blue-soft text-blue-strong grid place-items-center font-extrabold shrink-0">
                      {i + 1}
                    </span>
                    <b className="font-extrabold text-[1rem]">{lesson.topic}</b>
                  </div>
                  {lesson.schedule && (
                    <span className="inline-flex items-center gap-1.5 text-[.85rem] font-bold text-ink-3">
                      <IconCalendar className="w-[15px] h-[15px] text-gold-strong shrink-0" />
                      {lesson.schedule}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section-pad bg-bg-soft">
        <div className="wrap">
          <div className="max-w-[640px] mx-auto text-center">
            <span className="inline-flex items-center justify-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
              Тухай
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.1rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
              Сургалтын тухай
            </h2>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 nav:grid-cols-3 gap-[18px] max-w-[960px] mx-auto mt-[44px]">
            {aboutItems(course.lessons.length).map((item) => (
              <li
                key={item.title}
                className="bg-surface border border-line rounded-md px-[22px] py-[26px] shadow-xs transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-md"
              >
                <span className={`w-12 h-12 rounded-[14px] grid place-items-center mb-3.5 ${item.iconBg}`}>
                  {item.icon}
                </span>
                <b className="font-extrabold text-ink text-[1.02rem] block mb-1">{item.title}</b>
                <p className="text-ink-2 text-[.92rem] leading-[1.4]">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-pad">
        <div className="wrap flex justify-center">
          <div className="bg-surface border border-line rounded-lg shadow-md px-8 py-10 text-center max-w-[520px] w-full">
            <small className="font-extrabold text-ink-2 text-[.9rem]">{course.title}ын төлбөр</small>
            <b className="block text-[2.1rem] font-extrabold text-navy mt-1.5">
              {course.price} <span className="text-[1rem] text-ink-3 font-bold">{course.period}</span>
            </b>
            <p className="text-ink-3 font-semibold text-[.92rem] mt-3">
              {course.startDate && `Эхлэх огноо: ${course.startDate}. `}Суудлын тоо хязгаарлагдмал тул эрт
              бүртгүүлсэн сурагч урьтал эдэлнэ.
            </p>
            <div className="mt-6">
              <RegisterTriggerButton program={program} className="inline-flex items-center justify-center gap-[10px] w-full font-extrabold rounded-full bg-gold text-[oklch(0.32_0.06_70)] shadow-gold px-[26px] py-4 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong">
                Бүртгүүлэх <span>→</span>
              </RegisterTriggerButton>
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="section-pad bg-bg-soft">
          <div className="wrap">
            <div className="flex items-baseline gap-3.5 mb-[22px]">
              <h2 className="text-[1.4rem] font-extrabold">Төстэй сургалтууд</h2>
              <span className="text-[.9rem] font-bold text-ink-3">{course.tag}-тай холбоотой</span>
            </div>
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
