import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import AssessmentFlow from "@/components/assessment/AssessmentFlow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Түвшин тогтоох",
  description:
    "Хүүхдийнхээ математикийн түвшинг тогтоож, Б.Ганбат багшийн хувийн зөвлөмж болон тохирох сургалтын санал аваарай.",
  alternates: { canonical: "/assessment" },
};

export default function AssessmentPage() {
  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Түвшин тогтоох" title="Хүүхдийнхээ түвшинг тодорхойлъё" />
        <section className="section-pad">
          <div className="wrap max-w-[700px] mx-auto">
            <AssessmentFlow />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
