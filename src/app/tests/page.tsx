import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import { TESTS } from "@/lib/tests";
import { listTestResults } from "@/lib/tests/db";
import { getSessionUser } from "@/lib/session";
import { getPlacementFee, isAssessmentOpen } from "@/lib/assessment/db";
import { IconTarget } from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Тестүүд",
  description:
    "Математик сэтгэлгээгээ таньж мэдэх богино тестүүд. Дүн шалгахгүй — чи бодлогыг яаж боддогийг харуулна.",
};

export default async function TestsPage() {
  const user = await getSessionUser();
  const [results, assessmentOpen, placementFee] = await Promise.all([
    user ? listTestResults(user.id).catch(() => []) : Promise.resolve([]),
    isAssessmentOpen().catch(() => true),
    getPlacementFee().catch(() => ""),
  ]);

  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Тестүүд" title="Өөрийгөө таньж мэдэх" />
        <section className="section-pad">
          <div className="wrap max-w-[760px] mx-auto">
            {/* Түвшин тогтоолт: "тест" гэж хайсан эцэг эхийн ихэнх нь үнэндээ
                үүнийг хайж байдаг тул сонирхолтой тестүүдийн дээр тавина.
                Шалгалт хаалттай үед карт огт гарахгүй — орж болохгүй хуудсыг
                урьж болохгүй. */}
            {assessmentOpen && (
              <Link
                href="/assessment"
                className="block bg-[linear-gradient(120deg,var(--color-navy-deep)_0%,var(--color-navy)_55%,var(--color-blue-strong)_100%)] text-white rounded-lg shadow-sm px-6 py-6 mb-7 transition-transform hover:-translate-y-0.5"
              >
                <span className="inline-flex items-center gap-1.5 text-[.72rem] font-extrabold tracking-[.06em] uppercase text-gold">
                  <IconTarget className="w-3.5 h-3.5" /> Түвшин тогтоох
                </span>
                <h2 className="text-[1.25rem] font-extrabold mt-1.5">Түвшин тогтоох шалгалт</h2>
                <p className="text-navy-ink-2 font-medium mt-2 leading-[1.7]">
                  Сэдэв бүрээр шатлан асууж хүүхдийн бодит түвшинг тогтооно. Сэдвийн задаргаа,
                  дүгнэлт, тохирох сургалтын зөвлөмж шууд гарна.
                </p>
                <span className="inline-flex items-center gap-2 font-extrabold text-[.9rem] text-gold mt-3.5">
                  {placementFee && `${placementFee} · `}Шалгалт өгөх →
                </span>
              </Link>
            )}

            <h2 className="text-[1.1rem] font-extrabold mb-1.5">Сонирхолтой тестүүд</h2>
            <p className="text-ink-2 font-medium leading-[1.7] mb-5">
              Богино, сонирхолтой тестүүд. Зөв, буруу хариулт гэж байхгүй — эдгээр нь чиний
              сэтгэлгээний онцлогийг харуулах зорилготой. Үр дүн профайлд чинь хадгалагдана.
            </p>

            <div className="flex flex-col gap-4">
              {TESTS.map((test) => {
                const mine = results.find((r) => r.testSlug === test.slug);
                const archetype = mine ? test.archetypes[mine.primaryCode] : undefined;
                return (
                  <Link
                    key={test.slug}
                    href={`/tests/${test.slug}`}
                    className="bg-surface border border-line rounded-lg shadow-sm px-6 py-6 transition-transform hover:-translate-y-0.5"
                  >
                    <span className="text-[.72rem] font-extrabold tracking-[.06em] uppercase text-blue-strong">
                      {test.questions.length} асуулт · {test.minutes} минут
                    </span>
                    <h3 className="text-[1.25rem] font-extrabold mt-1.5">{test.title}</h3>
                    <p className="text-ink-2 font-medium mt-2 leading-[1.7]">{test.summary}</p>
                    {archetype && (
                      <span className="inline-flex items-center gap-2 text-[.85rem] font-extrabold text-green bg-green-soft px-3.5 py-1.5 rounded-full mt-3.5">
                        Таны төрөл: {archetype.name}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
