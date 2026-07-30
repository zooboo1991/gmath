import Image from "next/image";
import Reveal from "./Reveal";
import TeacherIntroCard from "./TeacherIntroCard";
import { IconTrophy, IconMedal, IconClock, IconPeopleAbout } from "./icons";

const achievements = [
  { icon: <IconTrophy className="w-[21px] h-[21px]" />, value: "2024", label: "Дархан аварга багш" },
  { icon: <IconMedal className="w-[21px] h-[21px]" />, value: "4× Алтан медаль", label: "Улсын олимпиад" },
  { icon: <IconClock className="w-[21px] h-[21px]" />, value: "10+ жил", label: "Багшлах туршлага" },
  { icon: <IconPeopleAbout className="w-[21px] h-[21px]" />, value: "500+ сурагч", label: "Амжилттай төгссөн" },
];

export default function About() {
  return (
    <section className="section-pad" id="about">
      <div className="wrap">
        <div className="max-w-[640px] mx-auto text-center">
          <h2 className="text-[clamp(1.85rem,3.6vw,2.6rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink text-balance">
            Шавийн эрдэм багшаас...
          </h2>
          <p className="text-[1.075rem] text-ink-2 mt-3 font-medium">
            10 жилийн туршлагатай, олон медальт олимпиадын багш
          </p>
        </div>

        <Reveal className="grid grid-cols-1 nav:grid-cols-[.9fr_1.1fr] gap-[30px] nav:gap-[48px] items-center mt-[44px]">
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

            <TeacherIntroCard />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
