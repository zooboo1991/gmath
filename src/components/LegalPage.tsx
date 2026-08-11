import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";

/**
 * Shared shell for the two policy pages (/privacy, /data-deletion). Both are
 * plain prose with the same heading rhythm, so the typography lives here
 * rather than being repeated — and any future policy page gets it for free.
 */
export default function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <PageHero eyebrow={eyebrow} title={title} />
      <section className="section-pad">
        <div className="wrap max-w-[760px]">
          <p className="text-ink-3 font-semibold text-[.85rem]">Шинэчилсэн: {updated}</p>
          <div
            className="mt-7 flex flex-col gap-5 text-ink-2 font-medium text-[1.02rem] leading-[1.75]
              [&_h2]:text-ink [&_h2]:font-extrabold [&_h2]:text-[1.25rem] [&_h2]:mt-5 [&_h2]:leading-snug
              [&_h3]:text-ink [&_h3]:font-extrabold [&_h3]:text-[1.02rem] [&_h3]:mt-3
              [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5 [&_li]:list-disc
              [&_a]:text-blue-strong [&_a]:underline [&_a]:font-semibold
              [&_strong]:text-ink [&_strong]:font-extrabold"
          >
            {children}
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
