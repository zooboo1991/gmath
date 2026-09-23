import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import CourseCard from "@/components/CourseCard";
import SongonClassCard from "@/components/SongonClassCard";
import { countRegistrationsForProgram, listCourses, listYearlyPrograms } from "@/lib/db";
import WaitlistCard from "@/components/WaitlistCard";
import { getSessionUser } from "@/lib/session";
import { buildScheduleBundles } from "@/lib/weeklySchedule";
import ScheduleBundles from "@/components/ScheduleBundles";
import PlacementBookingButton from "@/components/program/PlacementBookingButton";
import { courseHref } from "@/lib/courseHref";
import { PLACEMENT_FEE } from "@/lib/placementBooking";
import { formatMnt } from "@/lib/price";

export const metadata: Metadata = {
  title: "Сургалтууд",
  description:
    "Б.Ганбат багшийн сургалтын хөтөлбөрүүд — сонгон бэлтгэлийн танхимын ангиуд, 1 жилийн гүнзгийрүүлсэн хөтөлбөр.",
};

// Course list is admin-editable (see /admin) and stored in Supabase, so this
// page must read it fresh on every request instead of being cached as
// static output at build time.
export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const [allUpcoming, yearlyPrograms, user] = await Promise.all([
    listCourses("upcoming"),
    listYearlyPrograms(),
    // Only to decide whether the waiting-list form can be filled in — the
    // list is for families the school can actually call back.
    getSessionUser(),
  ]);

  // The classroom groups get their own band rather than sitting in the
  // filtered list: they are one offering split across four grades, and a
  // parent picks by their child's grade, not by filtering.
  // Нэрээр нь эрэмбэлнэ: PostgREST-ийн анхдагч дараалал 5, 8, 6, 7 гэж
  // гаргадаг байсан — багцын дугаарлалт ч мөн нэрийн дарааллыг дагадаг.
  const songon = allUpcoming
    .filter((c) => c.template === "songon")
    .sort((a, b) => a.title.localeCompare(b.title, "mn"));
  const songonBundles = buildScheduleBundles(songon);

  const songonSeats = await Promise.all(
    songon.map((c) => (c.capacity !== undefined ? countRegistrationsForProgram(c.id) : Promise.resolve(0)))
  );

  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Сургалтууд" title="Бүх сургалтын хөтөлбөрүүд" />

        {songon.length > 0 && (
          <section className="pt-[clamp(40px,6vw,60px)]">
            <div className="wrap">
              {/* Танилцуулга зүүн талд, түвшин тогтоох урилга баруун талд —
                  өмнө нь текст хагас өргөнд зогсоод баруун тал хоосон
                  үлддэг байсан. Бүртгэлээс тусдаа зам гэдэг нь ингэснээр
                  бүр тодорхой болно. */}
              <div className="grid grid-cols-1 nav:grid-cols-[minmax(0,1fr)_330px] gap-6 nav:gap-12 items-start">
                <div>
                  <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
                    Танхимын сургалт
                  </span>
                  <h2 className="text-[clamp(1.5rem,2.8vw,2rem)] font-extrabold leading-[1.14] tracking-[-.02em] text-ink mt-3.5 text-balance">
                    Сонгон бэлтгэлийн ангиуд
                  </h2>
                  <p className="text-ink-2 font-medium mt-2.5 leading-[1.7] max-w-[58ch]">
                    Стандарт ангид сурдаг ч сонгоны ангийн түвшинд суралцах боломж. 7 хоногт 3 удаа,
                    дээд тал нь 15 сурагчтай группээр. Эхлээд ангидаа бүртгүүлээрэй — дараа нь уулзаж
                    түвшнээ тогтоогоод, доорх хуваариудаас тохирох цагаа хамтдаа сонгоно.
                  </p>
                </div>

                <div className="rounded-lg border border-blue-soft-2 bg-blue-soft/50 px-[22px] py-[20px]">
                  <b className="block text-[1rem] font-extrabold leading-[1.35]">
                    Аль ангид орохоо мэдэхгүй байна уу?
                  </b>
                  <p className="text-[.88rem] text-ink-2 font-medium mt-1.5 leading-[1.6]">
                    Танхимд ирж түвшин тогтоолгож, аль ангид орохоо багштай ярилцана. Цаг
                    захиалахад {formatMnt(PLACEMENT_FEE)} төлнө — ангидаа бүртгүүлэхэд тэр мөнгө
                    эхний төлөлтөөс хасагдана.
                  </p>
                  <PlacementBookingButton className="w-full mt-4 inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full border-2 border-blue text-blue-strong bg-surface px-[20px] py-[12px] text-[.95rem] transition-colors hover:bg-blue hover:text-white" />
                </div>
              </div>

              {/* Цагийг уулзалтаар тохирдог тул хуваариуд анги бүрийн картад
                  биш, нэг дор — эдгээр нь бүх ангид сонгож болох багцууд. */}
              <div className="mt-[26px]">
                <ScheduleBundles bundles={songonBundles} />
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

        {/* Сонгоны ангиудын доор: дөрвөн ангийг хараад хүүхдийнхээ
            ангийг олоогүй эцэг эх яг энэ мөчид энэ картыг хэрэгтэй. */}
        <section className="pt-[clamp(36px,5vw,52px)]">
          <div className="wrap">
            <WaitlistCard signedIn={Boolean(user)} grade={user?.grade ?? ""} />
          </div>
        </section>

        {/* The yearly programmes are hand-written pages, not `courses` rows,
            so they sit outside the filtered list rather than appearing and
            disappearing as the visitor changes filters. */}
        <section className="bg-gold-soft py-[clamp(48px,7vw,72px)] mt-[clamp(40px,6vw,64px)]">
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
      </main>
      <Footer />
    </>
  );
}
