import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import CourseCard, { CourseMeta, VodStatus } from "@/components/CourseCard";
import { listCourses } from "@/lib/db";
import { yearlyPrograms } from "@/lib/staticPrograms";

export const metadata: Metadata = {
  title: "Сургалтууд",
  description: "Б.Ганбат багшийн бүх сургалтын хөтөлбөрүүд — 1 жилийн хөтөлбөр, удахгүй эхлэх сургалтууд, бичлэгээр үзэх сургалтууд.",
};

// Course list is admin-editable (see /admin) and stored in Supabase, so this
// page must read it fresh on every request instead of being cached as
// static output at build time.
export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const [upcomingCourses, vodCourses] = await Promise.all([
    listCourses("upcoming"),
    listCourses("vod"),
  ]);

  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Сургалтууд" title="Бүх сургалтын хөтөлбөрүүд" />

        <section className="bg-gold-soft py-[44px]">
          <div className="wrap">
            <div className="grid grid-cols-1 nav:grid-cols-2 gap-5 max-w-[900px] mx-auto">
              {yearlyPrograms.map(({ href, ...c }) => (
                <CourseCard key={c.tag} {...c} featured ctaHref={href} ctaLabel="Дэлгэрэнгүй" />
              ))}
            </div>
          </div>
        </section>

        <section className="pt-[44px] pb-[clamp(64px,9vw,116px)]">
          <div className="wrap">
            <div className="flex items-baseline gap-3.5 mb-[22px]">
              <h2 className="text-[1.4rem] font-extrabold">Удахгүй эхлэх сургалтууд</h2>
              <span className="text-[.9rem] font-bold text-ink-3">{upcomingCourses.length} хөтөлбөр</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 nav:grid-cols-3 gap-5">
              {upcomingCourses.map((c) => (
                <CourseCard
                  key={c.id}
                  tag={c.tag}
                  title={c.title}
                  topics={c.topics}
                  price={c.price}
                  period={c.period}
                  ctaHref={`/courses/${c.id}`}
                  ctaLabel="Дэлгэрэнгүй"
                  extra={<CourseMeta startDate={c.startDate ?? ""} mode={c.mode ?? ""} />}
                />
              ))}
            </div>

            <div className="flex items-baseline gap-3.5 mt-14 mb-[22px]">
              <h2 className="text-[1.4rem] font-extrabold">Бичлэгээр үзэх сургалтууд</h2>
              <span className="text-[.9rem] font-bold text-ink-3">
                Хүссэн үедээ нөхөж үзэх боломжтой
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 nav:grid-cols-3 gap-5">
              {vodCourses.map((c) => (
                <CourseCard
                  key={c.id}
                  tag={c.tag}
                  title={c.title}
                  topics={c.topics}
                  price={c.price}
                  period={c.period}
                  ctaHref={`/courses/${c.id}`}
                  ctaLabel="Дэлгэрэнгүй"
                  extra={<VodStatus />}
                />
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
