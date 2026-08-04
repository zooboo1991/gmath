import Link from "next/link";
import Reveal from "./Reveal";
import CourseCard from "./CourseCard";
import { IconQuestion } from "./icons";
import { listHomepageCourses } from "@/lib/db";

export default async function Courses() {
  const courses = await listHomepageCourses();
  if (courses.length === 0) return null;

  return (
    <section className="section-pad bg-bg-soft" id="courses">
      <div className="wrap">
        <div className="max-w-[640px] mx-auto text-center">
          <span className="inline-flex items-center justify-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
            Сургалтууд
          </span>
          <h2 className="text-[clamp(1.85rem,3.6vw,2.6rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
            Элсэлт авч байгаа сургалтууд
          </h2>
          <p className="text-[1.075rem] text-ink-2 mt-3 font-medium">
            Хүүхдийнхээ ангийн түвшнээ сонгоно уу
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] mt-[44px] items-stretch">
          {courses.map((c) => (
            <CourseCard key={c.id} {...c} ctaHref={`/courses/${c.id}`} />
          ))}
        </div>

        <div className="flex justify-center mt-8">
          <Link
            href="/courses"
            className="btn-ring inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-surface text-ink px-[26px] py-[16px] transition-transform hover:-translate-y-0.5 hover:text-blue-strong"
          >
            Бүх сургалтыг үзэх <span>→</span>
          </Link>
        </div>

        <Reveal className="panel-blue relative overflow-hidden mt-8 rounded-lg text-white px-[24px] md:px-[44px] py-[30px] flex items-center gap-6 flex-wrap shadow-blue">
          <span className="w-[58px] h-[58px] rounded-2xl bg-white/14 grid place-items-center shrink-0">
            <IconQuestion className="w-7 h-7" />
          </span>
          <div>
            <b className="text-[1.3rem] font-extrabold block tracking-[-.01em]">
              Аль ангилал танай хүүхдэд тохирох вэ?
            </b>
            <span className="text-[.98rem] text-[oklch(0.88_0.02_250)]">
              Товч анкет бөглөж, бодлого бодоод багшийн хувийн үнэлгээ аваарай
            </span>
          </div>
          <Link
            href="/assessment"
            className="md:ml-auto relative z-[2] inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-surface text-blue-strong shadow-sm px-[26px] py-[16px] transition-transform hover:-translate-y-0.5"
          >
            Түвшин тогтоох <span>→</span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
