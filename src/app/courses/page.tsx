import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import CourseCard from "@/components/CourseCard";
import SongonClassCard from "@/components/SongonClassCard";
import CourseBrowser from "@/components/CourseBrowser";
import { countRegistrationsForProgram, listCourses, listYearlyPrograms } from "@/lib/db";
import WaitlistCard from "@/components/WaitlistCard";
import { getSessionUser } from "@/lib/session";
import { parseWeeklySchedule } from "@/lib/weeklySchedule";
import { courseHref } from "@/lib/courseHref";

export const metadata: Metadata = {
  title: "Сургалтууд",
  description: "Б.Ганбат багшийн бүх сургалтын хөтөлбөрүүд — 1 жилийн хөтөлбөр, удахгүй эхлэх сургалтууд, бичлэгээр үзэх сургалтууд.",
};

// Course list is admin-editable (see /admin) and stored in Supabase, so this
// page must read it fresh on every request instead of being cached as
// static output at build time.
export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const [allUpcoming, vodCourses, yearlyPrograms, user] = await Promise.all([
    listCourses("upcoming"),
    listCourses("vod"),
    listYearlyPrograms(),
    // Only to decide whether the waiting-list form can be filled in — the
    // list is for families the school can actually call back.
    getSessionUser(),
  ]);

  // The classroom groups get their own band rather than sitting in the
  // filtered list: they are one offering split across four grades, and a
  // parent picks by their child's grade, not by filtering.
  const songon = allUpcoming.filter((c) => c.template === "songon");
  const upcomingCourses = allUpcoming.filter((c) => c.template !== "songon");

  const songonSeats = await Promise.all(
    songon.map((c) => (c.capacity !== undefined ? countRegistrationsForProgram(c.id) : Promise.resolve(0)))
  );

  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Сургалтууд" title="Бүх сургалтын хөтөлбөрүүд" />

        {/* Above the list on purpose: the parent who does not find their
            child's grade below is exactly the one this is for. */}
        <section className="pt-[34px]">
          <div className="wrap">
            <WaitlistCard signedIn={Boolean(user)} grade={user?.grade ?? ""} />
          </div>
        </section>

        {/* The yearly programmes are hand-written pages, not `courses` rows,
            so they sit outside the filtered list rather than appearing and
            disappearing as the visitor changes filters. */}
        <section className="bg-gold-soft py-[44px]">
          <div className="wrap">
            <div className="grid grid-cols-1 nav:grid-cols-2 gap-5 max-w-[900px] mx-auto">
              {yearlyPrograms.map((p) => (
                <CourseCard
                  key={p.id}
                  tag={p.tag}
                  title={p.title}
                  topics={p.topics}
                  price={p.price}
                  period={p.period}
                  featured
                  ctaHref={`/courses/${p.id.replace("program-", "")}`}
                  ctaLabel="Дэлгэрэнгүй"
                />
              ))}
            </div>
          </div>
        </section>

        {songon.length > 0 && (
          <section className="pt-[clamp(48px,7vw,72px)]">
            <div className="wrap">
              <div className="max-w-[680px]">
                <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
                  Танхимын сургалт
                </span>
                <h2 className="text-[clamp(1.5rem,2.8vw,2rem)] font-extrabold leading-[1.14] tracking-[-.02em] text-ink mt-3.5 text-balance">
                  Сонгон бэлтгэлийн ангиуд
                </h2>
                <p className="text-ink-2 font-medium mt-2.5 leading-[1.7]">
                  Стандарт ангид сурдаг ч сонгоны ангийн түвшинд суралцах боломж. 7 хоногт 3 удаа,
                  дээд тал нь 18 сурагчтай группээр. Хүүхдийнхээ ангийг сонгоно уу.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 nav:grid-cols-4 gap-5 mt-[30px]">
                {songon.map((c, i) => {
                  const taken = songonSeats[i];
                  // The grade is the card's headline, so it is pulled out of the
                  // title rather than repeating "Сонгон бэлтгэл" four times.
                  const grade = c.title.replace(/^.*—\s*/, "");
                  return (
                    <SongonClassCard
                      key={c.id}
                      grade={grade}
                      slots={parseWeeklySchedule(c.weeklySchedule)}
                      price={c.price}
                      period={c.period}
                      href={courseHref(c)}
                      capacity={c.capacity}
                      seatsLeft={c.capacity === undefined ? null : Math.max(0, c.capacity - taken)}
                    />
                  );
                })}
              </div>
            </div>
          </section>
        )}

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
