import Link from "next/link";
import type { Course } from "@/lib/db";
import Reveal from "@/components/Reveal";
import CourseCard from "@/components/CourseCard";
import { RegisterTriggerButton } from "./ProgramRegister";
import type { RelatedCourse } from "./CourseDetail";
import { parseWeeklySchedule } from "@/lib/weeklySchedule";
import {
  IconCalendar,
  IconCheckCircle,
  IconClock,
  IconLocation,
  IconPeopleHero,
  IconTarget,
} from "@/components/icons";

/**
 * The in-person "Сонгон бэлтгэл" classes (5th-8th grade).
 *
 * All four share this page: the same promise, the same teachers, the same
 * room. Only the timetable and the price differ, and those two come from the
 * course row so the teacher can change them without a deploy — the rest is
 * written here because it is one story told four times, and keeping four
 * copies of it in the database would mean editing it four times to fix a typo.
 *
 * Chosen over the ordinary course layout because the questions a parent asks
 * about a classroom course are different: which days, at what time, where, how
 * many children in the room, and who is standing in front of them.
 */

const highlights = [
  {
    icon: <IconPeopleHero className="w-6 h-6" />,
    iconBg: "bg-blue-soft text-blue-strong",
    title: "Цөөн хүүхэдтэй групп",
    text: "Групп бүр дээд тал нь 18 сурагчтай тул багш хүүхэд бүрт хүрч ажиллана.",
  },
  {
    icon: <IconClock className="w-6 h-6" />,
    iconBg: "bg-gold-soft text-gold-strong",
    title: "Тогтмол давтамж",
    text: "7 хоногт 3 удаа, хичээл тус бүр 2 цаг үргэлжилнэ.",
  },
  {
    icon: <IconCalendar className="w-6 h-6" />,
    iconBg: "bg-green-soft text-green",
    title: "Улирал бүр элсэлт",
    text: "Улирал бүрээр төлбөрөө төлж, бүртгэлээ баталгаажуулна.",
  },
];

const teachers = [
  {
    slug: "batchimeg",
    name: "Б.Батчимэг",
    role: "Үндсэн багш",
    text: "Алтан гадас одонт, Улсын математикийн олимпиадын аварга, багш нарын ур чадварын уралдааны тэргүүн байр эзэлж байсан, олон жилийн туршлагатай багш танхимын хичээлийг тогтмол удирдана.",
  },
  {
    slug: "ganbat",
    name: "Б.Ганбат",
    role: "Олимпиадын багш",
    text: "Олимпиадын анхан шатны хичээлүүдийг орно.",
  },
];

const LOCATION = "Чонон бүрт төв, 4 давхар, 403 тоот";

export default function SonginDetail({ course, related }: { course: Course; related: RelatedCourse[] }) {
  // Same shape the ordinary course page builds — /api/enroll reads `tag`
  // server-side for the payment description.
  const program = { id: course.id, label: `${course.title} (${course.tag})`, price: course.price, tag: course.tag };
  const slots = parseWeeklySchedule(course.weeklySchedule);

  return (
    <>
      <section className="hero-navy relative text-white overflow-hidden">
        <div className="hero-dotgrid pointer-events-none absolute inset-0 opacity-50" />

        <div className="wrap relative z-[2] py-[clamp(48px,7vw,84px)] max-w-[760px]">
          <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-gold bg-white/9 px-[14px] py-2 rounded-full before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
            {course.tag}
          </span>
          <h1 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] font-extrabold leading-[1.14] tracking-[-.02em] text-balance">
            {course.title}
          </h1>
          <p className="mt-4 text-navy-ink-2 text-[1.05rem] font-semibold max-w-[56ch]">
            Стандарт ангид сурдаг ч, сонгоны ангийн түвшинд суралцах боломж. Улсын математикийн
            аварга багш нарын хамтарсан танхимын сургалт.
          </p>

          <div className="flex gap-[26px] mt-[26px] flex-wrap">
            <div className="flex items-center gap-[10px]">
              <IconClock className="w-[22px] h-[22px] text-gold" />
              <div>
                <b className="text-[1.3rem] font-extrabold block leading-none">7 хоногт 3</b>
                <small className="text-navy-ink-2 font-bold text-[.78rem]">удаа, 2 цаг</small>
              </div>
            </div>
            <div className="flex items-center gap-[10px]">
              <IconPeopleHero className="w-[22px] h-[22px] text-gold" />
              <div>
                <b className="text-[1.3rem] font-extrabold block leading-none">18</b>
                <small className="text-navy-ink-2 font-bold text-[.78rem]">хүртэлх сурагч</small>
              </div>
            </div>
            <div className="flex items-center gap-[10px]">
              <IconLocation className="w-[22px] h-[22px] text-gold" />
              <div>
                <b className="text-[1.3rem] font-extrabold block leading-none">Танхим</b>
                <small className="text-navy-ink-2 font-bold text-[.78rem]">Чонон бүрт төв</small>
              </div>
            </div>
          </div>

          <div className="mt-7">
            <RegisterTriggerButton program={program} className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[34px] py-[19px] text-[1.075rem] transition-transform hover:-translate-y-0.5 hover:bg-gold-strong">
              Сургалтанд бүртгүүлэх <span>→</span>
            </RegisterTriggerButton>
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="wrap">
          <div className="max-w-[680px] mx-auto text-center">
            <span className="inline-flex items-center justify-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
              Хөтөлбөрийн тухай
            </span>
            <h2 className="text-[clamp(1.6rem,3vw,2.1rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
              Стандарт ангиас сонгоны түвшин рүү
            </h2>
            <p className="text-ink-2 font-medium mt-4 leading-[1.75]">
              Энэхүү хөтөлбөр нь энгийн ангид суралцдаг хүүхдүүдэд сонгоны ангийн түвшний
              математикийн мэдлэгийг эзэмшүүлэх зорилготой танхимын сургалт юм. Сурагчийн одоогийн
              түвшнээс эхлэн суурь цоорхойг нөхөж, шат ахиулан гүнзгийрүүлнэ.
            </p>
            <p className="text-ink-3 font-semibold mt-3.5 leading-[1.7] text-[.95rem]">
              <b className="text-ink-2">Хичээлийн агуулга:</b> стандарт ангийн хичээл дээр үзэж буй
              агуулгыг бататгах + олимпиадын анхан шатны хичээлүүд.
            </p>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-[18px] max-w-[980px] mx-auto mt-[44px]">
            {highlights.map((item) => (
              <Reveal key={item.title} as="li" className="card-flat px-[22px] py-[26px]">
                <span className={`w-12 h-12 rounded-[14px] grid place-items-center mb-3.5 ${item.iconBg}`}>
                  {item.icon}
                </span>
                <b className="block font-extrabold text-ink text-[1rem]">{item.title}</b>
                <p className="text-ink-2 font-medium text-[.92rem] leading-[1.6] mt-1.5">{item.text}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-pad bg-bg-soft">
        <div className="wrap">
          <div className="max-w-[880px] mx-auto">
            <div className="grid grid-cols-1 nav:grid-cols-2 gap-8 nav:gap-10">
              {/* Timetable first: it is the one thing a parent must check
                  against their child's own school shift before anything else
                  on this page matters. */}
              <div>
                <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
                  Хичээлийн хуваарь
                </span>
                <h2 className="text-[clamp(1.4rem,2.6vw,1.8rem)] font-extrabold leading-[1.14] text-ink mt-3.5">
                  {course.title}
                </h2>

                {slots.length > 0 ? (
                  <ul className="flex flex-col gap-2 mt-5">
                    {slots.map((slot) => (
                      <li
                        key={`${slot.day}-${slot.time}`}
                        className="flex items-center justify-between gap-4 bg-surface border border-line rounded-md px-4 py-3"
                      >
                        <b className="font-extrabold text-ink text-[.95rem]">{slot.day}</b>
                        <span className="font-bold text-blue-strong text-[.95rem]">{slot.time}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-3 font-semibold mt-5">
                    Хуваарь удахгүй зарлагдана. Бүртгүүлсэн сурагчдад тусад нь мэдэгдэнэ.
                  </p>
                )}

                <p className="text-ink-3 font-medium text-[.88rem] leading-[1.65] mt-4">
                  Хуваарь нь ойролцоох сургуулиудын ээлжийн цагтай уялдуулан зохиогдсон: өглөө
                  ээлжийн сурагчид үдээс хойш, өдөр ээлжийн сурагчид өглөө хичээллэнэ.
                </p>

                <div className="flex items-start gap-2.5 mt-5 bg-surface border border-line rounded-md px-4 py-3.5">
                  <IconLocation className="w-[18px] h-[18px] text-blue-strong shrink-0 mt-0.5" />
                  <div>
                    <b className="block font-extrabold text-ink text-[.92rem]">Байршил</b>
                    <span className="text-ink-2 font-semibold text-[.9rem]">{LOCATION}</span>
                  </div>
                </div>
              </div>

              <div>
                <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
                  Багшлах бүрэлдэхүүн
                </span>
                <div className="flex flex-col gap-3.5 mt-5">
                  {teachers.map((t) => (
                    <div key={t.name} className="bg-surface border border-line rounded-md px-[18px] py-[18px]">
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <Link
                          href={`/team/${t.slug}`}
                          className="font-extrabold text-[1.02rem] text-ink hover:text-blue-strong transition-colors"
                        >
                          {t.name}
                        </Link>
                        <span className="text-[.78rem] font-extrabold tracking-[.06em] uppercase text-blue-strong bg-blue-soft px-2.5 py-1 rounded-full">
                          {t.role}
                        </span>
                      </div>
                      <p className="text-ink-2 font-medium text-[.9rem] leading-[1.65] mt-2">{t.text}</p>
                    </div>
                  ))}
                </div>
                <Link
                  href="/team"
                  className="inline-block mt-4 text-[.9rem] font-extrabold text-blue-strong hover:underline"
                >
                  Манай багтай танилцах →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="wrap flex justify-center">
          <div className="bg-surface border border-line rounded-lg shadow-md px-8 py-10 text-center max-w-[520px] w-full">
            <small className="font-extrabold text-ink-2 text-[.9rem]">Сургалтын төлбөр</small>
            <b className="block text-[2.1rem] font-extrabold text-navy mt-1.5">
              {course.price} <span className="text-[1rem] text-ink-3 font-bold">{course.period}</span>
            </b>
            <p className="text-ink-3 font-semibold text-[.92rem] mt-3">
              Төлбөрийг улирлаар төлнө. Групп 18 сурагчтай тул суудлын тоо хязгаарлагдмал —
              дүүрэхэд элсэлт хаагдана.
            </p>
            <div className="mt-6">
              <RegisterTriggerButton program={program} className="inline-flex items-center justify-center gap-[10px] w-full font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong">
                Бүртгүүлэх <span>→</span>
              </RegisterTriggerButton>
            </div>
            <div className="flex items-center justify-center gap-2 mt-5 text-ink-3">
              <IconCheckCircle className="w-4 h-4 text-green" />
              <span className="font-semibold text-[.85rem]">Бүртгэл баталгаажмагц багш тантай холбогдоно</span>
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="section-pad bg-bg-soft">
          <div className="wrap">
            <div className="flex items-baseline gap-3.5 mb-[22px]">
              <h2 className="text-[1.4rem] font-extrabold">Бусад сургалт</h2>
              <span className="text-[.9rem] font-bold text-ink-3">
                <IconTarget className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                Хүүхдийнхээ түвшинд тохирохыг сонгоорой
              </span>
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
