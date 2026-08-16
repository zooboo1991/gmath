import Link from "next/link";
import CourseCard from "./CourseCard";
import { listHomepageCourses, listHomepageYearlyPrograms } from "@/lib/db";
import { courseHref } from "@/lib/courseHref";

export default async function Courses() {
  const [dbCourses, yearlyPrograms] = await Promise.all([listHomepageCourses(), listHomepageYearlyPrograms()]);
  const courses = [
    ...dbCourses.map((c) => ({ ...c, href: courseHref(c) })),
    // Yearly programs live outside the courses table (see the schema
    // comment on yearly_programs) — hand-written pages at /courses/c
    // and /courses/d, so the href doesn't follow the course-id pattern.
    ...yearlyPrograms.map((p) => ({ ...p, href: `/courses/${p.id.replace("program-", "")}` })),
  ];
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
          {courses.map(({ href, ...c }) => (
            <CourseCard key={c.id} {...c} ctaHref={href} />
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
      </div>
    </section>
  );
}
