import type { Metadata } from "next";
import { headers } from "next/headers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import FormField from "@/components/FormField";
import { findCertificateByNumber } from "@/lib/db";
import { formatCourseDate } from "@/lib/courseDate";
import { isTooLong, MAX_LEN } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Сертификат шалгах",
};

export default async function CertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ number?: string }>;
}) {
  const { number } = await searchParams;
  const query = (number ?? "").trim();

  let certificate = null;
  let rateLimited = false;
  if (query && !isTooLong(query, MAX_LEN.certificateNumber)) {
    const ip = getClientIp(await headers());
    const rate = await checkRateLimit(`certificate-search:${ip}`, 20, 60);
    if (!rate.allowed) {
      rateLimited = true;
    } else {
      // certificates is a newer table — before the migration runs this
      // throws, and a visitor searching shouldn't see a 500 for it.
      certificate = (await findCertificateByNumber(query).catch(() => undefined)) ?? null;
    }
  }

  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Сертификат" title="Сертификатын мэдээлэл шалгах" />
        <section className="section-pad">
          <div className="wrap max-w-[560px] mx-auto">
            <form method="GET" className="bg-surface border border-line rounded-lg shadow-sm px-6 py-7">
              <FormField label="Сертификатын дугаар" required>
                <input type="text" name="number" defaultValue={query} placeholder="Жишээ: 2026-0142" required />
              </FormField>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-6 py-[14px] transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
              >
                Шалгах
              </button>
            </form>

            {query && (
              <div className="mt-6">
                {rateLimited ? (
                  <p className="text-center text-red-soft font-semibold bg-surface border border-line rounded-lg px-6 py-8">
                    Хэт олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.
                  </p>
                ) : certificate ? (
                  <div className="bg-surface border border-line rounded-lg shadow-sm px-6 py-7">
                    <span className="inline-flex items-center gap-1.5 text-[.78rem] font-extrabold text-green bg-green-soft px-3 py-1.5 rounded-full">
                      Баталгаажсан
                    </span>
                    <h2 className="text-[1.3rem] font-extrabold mt-3">
                      {certificate.lastName} {certificate.firstName}
                    </h2>
                    <div className="flex flex-col gap-2.5 mt-5">
                      <CertRow label="Сертификатын дугаар" value={certificate.certificateNumber} />
                      <CertRow label="Сургалтын ангилал" value={certificate.category} />
                      <CertRow label="Курс" value={certificate.course} />
                      <CertRow label="Хамрагдсан огноо" value={formatCourseDate(certificate.issuedDate)} />
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-ink-2 font-semibold bg-surface border border-line rounded-lg px-6 py-8">
                    &quot;{query}&quot; дугаартай сертификат олдсонгүй.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function CertRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0">
      <span className="font-bold text-[.88rem] text-ink-3">{label}</span>
      <span className="font-extrabold text-[.92rem] text-right">{value}</span>
    </div>
  );
}
