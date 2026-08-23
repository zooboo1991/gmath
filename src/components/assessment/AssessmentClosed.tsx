import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";

/**
 * What the level test looks like while it is switched off.
 *
 * A plain 404 was the other option and the wrong one: parents follow links
 * from chat and from their own history, and "энэ хуудас байхгүй" reads as a
 * broken site rather than a temporary pause. This says what is happening and
 * points at the thing they can still do.
 */
export default function AssessmentClosed() {
  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Түвшин тогтоох" title="Түр хаалттай байна" />
        <section className="section-pad">
          <div className="wrap max-w-[700px] mx-auto">
            <div className="text-center bg-surface border border-line rounded-lg shadow-sm px-8 py-14">
              <h2 className="text-[1.3rem] font-extrabold">Бодлогын санг шинэчилж байна</h2>
              <p className="text-ink-2 mt-2.5 font-medium max-w-[46ch] mx-auto leading-[1.7]">
                Түвшин тогтоох шалгалтыг түр хаасан байна. Бодлогын сан бэлэн болмогц
                дахин нээх тул хэсэг хугацааны дараа орж үзээрэй.
              </p>
              <Link
                href="/courses"
                className="inline-flex items-center justify-center font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[26px] py-4 mt-6 transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
              >
                Сургалтууд харах →
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
