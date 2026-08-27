import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import { TESTS } from "@/lib/tests";
import { listTestResults } from "@/lib/tests/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Тестүүд",
  description:
    "Математик сэтгэлгээгээ таньж мэдэх богино тестүүд. Дүн шалгахгүй — чи бодлогыг яаж боддогийг харуулна.",
};

export default async function TestsPage() {
  const user = await getSessionUser();
  const results = user ? await listTestResults(user.id).catch(() => []) : [];

  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Тестүүд" title="Өөрийгөө таньж мэдэх" />
        <section className="section-pad">
          <div className="wrap max-w-[760px] mx-auto">
            <p className="text-ink-2 font-medium leading-[1.7] mb-7">
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
                    <h2 className="text-[1.25rem] font-extrabold mt-1.5">{test.title}</h2>
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
