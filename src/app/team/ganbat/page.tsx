import type { Metadata } from "next";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import { IconTrophy, IconMedal, IconClock, IconPeopleAbout } from "@/components/icons";

export const metadata: Metadata = {
  title: "Б.Ганбат багш",
  description: "Б.Ганбат — Дархан аварга, олон улсын алтан медальт олимпиадын багш.",
};

const achievements = [
  { icon: <IconTrophy className="w-[21px] h-[21px]" />, value: "2024", label: "Дархан аварга багш" },
  { icon: <IconMedal className="w-[21px] h-[21px]" />, value: "4× Алтан медаль", label: "Улсын олимпиад" },
  { icon: <IconClock className="w-[21px] h-[21px]" />, value: "10+ жил", label: "Багшлах туршлага" },
  { icon: <IconPeopleAbout className="w-[21px] h-[21px]" />, value: "500+ сурагч", label: "Амжилттай төгссөн" },
];

export default function GanbatPage() {
  return (
    <>
      <Navbar />
      <main>
        <PageHero eyebrow="Манай баг" title="Б.Ганбат — Үүсгэн байгуулагч, Олимпиадын багш" />

        <section className="section-pad">
          <div className="wrap">
            <div className="grid grid-cols-1 nav:grid-cols-[.9fr_1.1fr] gap-[30px] nav:gap-[48px] items-center max-w-[980px] mx-auto">
              <div className="relative aspect-[4/5] rounded-lg border border-line shadow-sm overflow-hidden max-w-[360px] nav:max-w-none mx-auto nav:mx-0 w-full">
                <Image
                  src="/images/teacher-photo.jpg"
                  alt="Багш Б.Ганбат"
                  fill
                  sizes="(min-width: 980px) 40vw, 360px"
                  className="object-cover"
                />
              </div>

              <div>
                <p className="text-[1.12rem] leading-[1.7] text-ink font-semibold">
                  Сайн байна уу. Намайг <span className="text-blue-strong font-extrabold">Батмөнхийн Ганбат</span> гэдэг.
                  2013 оноос багшилж, 2024 онд Улсын Математикийн олимпиадад 4 дэх Алтан медалиа хүртэж
                  &ldquo;Дархан аварга&rdquo; багш болсон.
                  <br />
                  2023 онд &ldquo;Олон улсын багш, дасгалжуулагчдын 5-р олимпиадад&rdquo; Дасгалжуулагчдын төрөлд
                  (League of Trainers) Монгол улсын анхны Алтан медаль хүртсэн.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px] mt-[26px]">
                  {achievements.map((a) => (
                    <div
                      key={a.label}
                      className="flex items-center gap-[12px] bg-surface border border-line rounded-sm px-[16px] py-[14px] shadow-xs"
                    >
                      <span className="w-10 h-10 rounded-[11px] bg-blue-soft text-blue-strong grid place-items-center shrink-0">
                        {a.icon}
                      </span>
                      <div>
                        <b className="text-[1.02rem] font-extrabold leading-[1.15] block">{a.value}</b>
                        <small className="text-[.82rem] text-ink-3 font-semibold">{a.label}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
