import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import CourseCard from "@/components/CourseCard";
import CourseBrowser from "@/components/CourseBrowser";
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

        {/* The yearly programmes are hand-written pages, not `courses` rows,
            so they sit outside the filtered list rather than appearing and
            disappearing as the visitor changes filters. */}
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
            <CourseBrowser upcoming={upcomingCourses} vod={vodCourses} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
