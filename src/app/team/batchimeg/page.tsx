import Image from "next/image";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import { IconTrophy } from "@/components/icons";

export const metadata: Metadata = {
  title: "Б.Батчимэг багш",
  description: "Б.Батчимэг — Алтан гадас одонт, Улсын математикийн олимпиадын аварга багш.",
};

const achievements = ["Алтан гадас одонт багш", "Улсын математикийн олимпиадын аварга"];

export default function BatchimegPage() {
  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Манай баг" title="Б.Батчимэг — Ахлах багш" />

        <section className="section-pad">
          <div className="wrap">
            <div className="grid grid-cols-1 nav:grid-cols-[.9fr_1.1fr] gap-[30px] nav:gap-[48px] items-center max-w-[980px] mx-auto">
              <div className="relative aspect-[4/5] rounded-lg border border-line shadow-sm overflow-hidden max-w-[360px] nav:max-w-none mx-auto nav:mx-0 w-full bg-bg-soft">
                <Image
                  src="/images/batchimeg-photo.jpg"
                  alt="Багш Б.Батчимэг"
                  fill
                  sizes="(max-width: 980px) 360px, 45vw"
                  /* The portrait is taller than the 4:5 frame, and the face
                     sits high in it, so the crop is biased upward instead of
                     trimming equally from both ends. */
                  className="object-cover object-[center_28%]"
                  priority
                />
              </div>

              <div>
                <div className="flex flex-col gap-2.5">
                  {achievements.map((a) => (
                    <div
                      key={a}
                      className="flex items-center gap-[12px] bg-surface border border-line rounded-sm px-[16px] py-[14px] shadow-xs"
                    >
                      <span className="w-10 h-10 rounded-[11px] bg-blue-soft text-blue-strong grid place-items-center shrink-0">
                        <IconTrophy className="w-[21px] h-[21px]" />
                      </span>
                      <b className="text-[.98rem] font-extrabold leading-[1.3]">{a}</b>
                    </div>
                  ))}
                </div>

                <p className="text-ink-3 font-semibold text-[.92rem] mt-6">
                  Дэлгэрэнгүй танилцуулга удахгүй нэмэгдэнэ.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
