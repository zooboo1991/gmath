import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import { IconBook } from "@/components/icons";

export const metadata: Metadata = {
  title: "Нийтлэл — Б.Ганбат багш",
  description: "Б.Ганбат багшийн олимпиадын математикийн сургалттай холбоотой нийтлэл, зөвлөгөөнүүд.",
};

export default function ArticlesPage() {
  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Нийтлэл" title="Зөвлөгөө, нийтлэлүүд" />

        <section className="section-pad">
          <div className="wrap">
            <div className="max-w-[560px] mx-auto text-center bg-surface border border-line rounded-lg shadow-sm px-[32px] py-[52px]">
              <span className="inline-grid w-[64px] h-[64px] rounded-[18px] bg-blue-soft text-blue-strong place-items-center mx-auto">
                <IconBook className="w-8 h-8" />
              </span>
              <h2 className="text-[1.5rem] font-extrabold mt-6 tracking-[-.01em]">
                Тун удахгүй нээгдэнэ
              </h2>
              <p className="text-[1rem] text-ink-2 mt-3 font-medium">
                Багшийн зөвлөгөө, олимпиадад бэлдэх арга зүй, сурган хүмүүжлийн нийтлэлүүдийг энд
                удахгүй нийтэлж эхэлнэ. Түр хүлээгээд дараа дахин зочилно уу.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-[14px] mt-8">
                <Link
                  href="/courses"
                  className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-[oklch(0.32_0.06_70)] shadow-gold px-[26px] py-[16px] transition-transform hover:-translate-y-0.5 hover:bg-gold-strong"
                >
                  Сургалтууд үзэх <span>→</span>
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-surface text-ink shadow-[inset_0_0_0_1.5px_var(--color-line-2)] px-[26px] py-[16px] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1.5px_var(--color-blue)] hover:text-blue-strong"
                >
                  Нүүр хуудас
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
