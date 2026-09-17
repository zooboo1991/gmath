import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import JsonLd, { SITE_URL } from "@/components/JsonLd";
import TeacherTimeline from "@/components/teacher/TeacherTimeline";
import { IconCrown, IconGraduationCap, IconBook, IconMedal, IconTrophy } from "@/components/icons";
import {
  BATCHIMEG_TOTAL_MEDALS,
  batchimegAwards,
  batchimegBooks,
  batchimegEducation,
  batchimegInternational,
  batchimegMedalsByYear,
  batchimegTeachingYear,
  batchimegTimeline,
} from "@/lib/batchimegProfile";

export const metadata: Metadata = {
  title: "Б.Батчимэг багш",
  description:
    "Б.Батчимэг — 1991 оноос хойш математикийн багшаар ажиллаж буй, Төрийн «Алтан гадас» болон «Хөдөлмөрийн гавьяаны улаан туг» одонт багш. Шавь нар нь 1998–2019 онд 772 медаль хүртсэн.",
  alternates: { canonical: "/team/batchimeg" },
  // Багш өөрөө танилцуулгаа баталгаажуулах хүртэл нуув: "Манай баг"-аас
  // холбоосыг авч, sitemap-аас хасаж, индекслэхийг хориглов. Хаягаар нь
  // шууд орвол харагдана — багшид үзүүлэхэд ингэх нь хэрэгтэй.
  robots: { index: false, follow: false },
};

export default function BatchimegPage() {
  const years = batchimegTeachingYear();

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Person",
          name: "Б.Батчимэг",
          jobTitle: "Математикийн багш",
          description:
            "Төрийн «Алтан гадас», «Хөдөлмөрийн гавьяаны улаан туг» одонт математикийн багш. Шавь нар нь 1998–2019 онд 772 медаль хүртсэн.",
          image: `${SITE_URL}/images/batchimeg-photo.jpg`,
          url: `${SITE_URL}/team/batchimeg`,
          worksFor: {
            "@type": "EducationalOrganization",
            name: "Б.Ганбат багшийн математикийн сургалт",
          },
        }}
      />
      <Navbar />
      <main>
        <section className="panel-blue relative text-white overflow-hidden">
          <div className="wrap relative z-[2] grid grid-cols-1 nav:grid-cols-[1.05fr_.95fr] gap-[30px] nav:gap-[48px] items-center py-[clamp(40px,7vw,92px)]">
            <div>
              <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-gold bg-white/9 px-[14px] py-2 rounded-full before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
                Багшийн танилцуулга
              </span>
              <h1 className="mt-4 text-[clamp(1.7rem,4vw,2.6rem)] font-extrabold leading-[1.15] tracking-[-.02em] text-balance">
                Б.Батчимэг — {years} дахь жилдээ багшилж буй математикийн багш
              </h1>
              <p className="text-[1.05rem] text-navy-ink-2 mt-4 max-w-[54ch] font-medium">
                1991 оноос хойш багшилж, шавь нар нь 1998–2019 онд{" "}
                <b className="text-white">нийт {BATCHIMEG_TOTAL_MEDALS} медаль</b> хүртсэн. Олон улсын
                олимпиадад алт, мөнгө, хүрэл медальт шавь бэлтгэсэн. Төрийн «Алтан гадас», «Хөдөлмөрийн
                гавьяаны улаан туг» одонгоор шагнагдсан.
              </p>
              <div className="grid grid-cols-2 gap-[10px] mt-[26px] max-w-[340px]">
                {[
                  { value: `${years}`, label: "дахь жилдээ багшилж байна" },
                  { value: `${BATCHIMEG_TOTAL_MEDALS}`, label: "шавь нарын медаль (1998–2019)" },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="bg-white/7 border border-white/10 rounded-sm px-[12px] py-[14px]"
                  >
                    <b className="text-[1.3rem] font-extrabold block">{m.value}</b>
                    <small className="text-[.76rem] text-navy-ink-2 font-semibold leading-tight block mt-1">
                      {m.label}
                    </small>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[320px]">
              <div className="relative aspect-[4/5] rounded-lg overflow-hidden border border-white/12 shadow-lg">
                <Image
                  src="/images/batchimeg-photo.jpg"
                  alt="Б.Батчимэг багш"
                  fill
                  sizes="(min-width: 980px) 320px, 60vw"
                  /* The portrait is taller than the 4:5 frame and the face sits
                     high in it, so the crop is biased upward. */
                  className="object-cover object-[center_28%]"
                  priority
                />
              </div>
              <div className="absolute -bottom-5 -left-5 flex items-center gap-3 bg-surface text-ink rounded-sm px-[16px] py-[13px] shadow-md max-w-[248px]">
                <span className="w-10 h-10 rounded-[11px] bg-gold-soft text-gold-strong grid place-items-center shrink-0">
                  <IconCrown className="w-5 h-5" />
                </span>
                <div>
                  <b className="text-[.95rem] font-extrabold leading-[1.25] block">
                    Хөдөлмөрийн гавьяаны улаан туг
                  </b>
                  <small className="text-[.76rem] text-ink-3 font-semibold">2020 · Төрийн одон</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pt-10 md:pt-12 pb-10 md:pb-14">
          <div className="wrap">
            <Reveal className="relative rounded-lg bg-[linear-gradient(150deg,var(--color-green),oklch(0.42_0.1_158))] text-white flex flex-col xs:flex-row items-start gap-4 xs:gap-5 px-[26px] py-[26px] max-w-[840px] mx-auto shadow-md overflow-hidden">
              <span className="w-[54px] h-[54px] rounded-[15px] bg-gold-soft text-gold-strong grid place-items-center shrink-0">
                <IconMedal className="w-6 h-6" />
              </span>
              <div>
                <small className="text-[.78rem] text-white/75 font-extrabold uppercase tracking-[.08em]">
                  Онцлох амжилт · 2016
                </small>
                <h2 className="text-[1.15rem] font-extrabold leading-[1.3] mt-1.5">
                  Олон улсын математикийн IMC олимпиад, Тайланд — шавийн анхны Алтан медаль
                </h2>
                <p className="text-[.95rem] text-white/75 font-medium mt-2">
                  Тэр жил 3 шавь нь Монгол Улсаа төлөөлж, 5 жил дараалан оролцсон шавь нь анхны алтан
                  медалиа хүртэж, 2 сурагч тусгай байр эзэлсэн.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="section-pad bg-bg-soft">
          <div className="wrap">
            <div className="max-w-[640px] mx-auto text-center">
              <span className="inline-flex items-center justify-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
                Шавь нарын амжилт
              </span>
              <h2 className="text-[clamp(1.85rem,3.6vw,2.6rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
                1998–2019 онд {BATCHIMEG_TOTAL_MEDALS} медаль
              </h2>
              <p className="text-[1.075rem] text-ink-2 mt-3 font-medium">
                Хичээлийн жил тус бүрд шавь нарынх нь олимпиадаас хүртсэн медаль
              </p>
            </div>

            <div className="mt-[44px]">
              <h3 className="flex items-center gap-2.5 text-[1.2rem] font-extrabold">
                <IconTrophy className="w-5 h-5 text-blue-strong" /> Олон улсын олимпиад
              </h3>
              <div className="grid grid-cols-1 xs:grid-cols-2 nav:grid-cols-4 gap-[18px] mt-5">
                {batchimegInternational.map((one) => (
                  <Reveal key={one.title} className="card-flat px-[20px] py-[18px]">
                    <small className="text-[.8rem] text-ink-3 font-bold">{one.range}</small>
                    <b className="block text-[.98rem] font-extrabold mt-0.5 leading-[1.3]">
                      {one.title}
                    </b>
                    <span className="block text-[.88rem] text-ink-2 font-medium mt-1">
                      {one.result}
                    </span>
                  </Reveal>
                ))}
                <Reveal className="card-flat px-[20px] py-[18px] border-l-[3px] border-l-gold">
                  <small className="text-[.8rem] text-ink-3 font-bold">2019</small>
                  <b className="block text-[.98rem] font-extrabold mt-0.5 leading-[1.3]">
                    Математикийн ЭЕШ — хоёр шавь 800 оноо
                  </b>
                  <span className="block text-[.88rem] text-ink-2 font-medium mt-1">
                    СБД-ийн тэр оны шилдэг аргазүйтэй багшийн өргөмжлөл хүртсэн
                  </span>
                </Reveal>
              </div>
            </div>

            <div className="mt-[52px]">
              <h3 className="flex items-center gap-2.5 text-[1.2rem] font-extrabold">
                <IconMedal className="w-5 h-5 text-blue-strong" /> Хичээлийн жил тус бүрээр
              </h3>
              <div className="grid grid-cols-1 xs:grid-cols-2 nav:grid-cols-3 gap-[14px] mt-5">
                {batchimegMedalsByYear.map((one) => (
                  <div key={one.label} className="card-flat px-[18px] py-[15px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <small className="text-[.85rem] text-ink-3 font-bold tabular-nums">
                        {one.label}
                      </small>
                      <b className="text-[1.02rem] font-extrabold tabular-nums shrink-0">
                        {one.count} медаль
                      </b>
                    </div>
                    {one.note && (
                      <span className="block text-[.84rem] text-ink-2 font-medium mt-1.5 leading-[1.5]">
                        {one.note}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[.85rem] text-ink-3 font-semibold mt-4 leading-[1.6]">
                1998–2007 онд эзэлсэн I, II, III байрыг медальд тооцов.
              </p>
            </div>
          </div>
        </section>

        <section className="section-pad" id="timeline">
          <div className="wrap">
            <div className="max-w-[640px] mx-auto text-center">
              <span className="inline-flex items-center justify-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
                Он цагийн хэлхээс
              </span>
              <h2 className="text-[clamp(1.85rem,3.6vw,2.6rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
                1991 оноос өнөөг хүртэл
              </h2>
              <p className="text-[1.075rem] text-ink-2 mt-3 font-medium">
                Багшийн өөрийн амжилт, шавь нарын медаль, хэвлүүлсэн бүтээлүүд
              </p>
            </div>

            <div className="mt-[44px]">
              <TeacherTimeline groups={batchimegTimeline} />
            </div>
          </div>
        </section>

        <section className="section-pad bg-bg-soft">
          <div className="wrap">
            <div className="max-w-[640px] mx-auto text-center">
              <span className="inline-flex items-center justify-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
                Хэвлүүлсэн бүтээл
              </span>
              <h2 className="text-[clamp(1.85rem,3.6vw,2.6rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
                Цуврал сурах бичиг, бодлогын хураамж, эмхтгэл
              </h2>
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 nav:grid-cols-3 gap-[18px] mt-[44px]">
              {batchimegBooks.map((b) => (
                <Reveal key={b.title} className="card-flat px-[22px] py-[24px]">
                  <span className="w-[46px] h-[46px] rounded-[13px] bg-blue-soft text-blue-strong grid place-items-center mb-3">
                    <IconBook className="w-5 h-5" />
                  </span>
                  <small className="text-[.8rem] text-ink-3 font-bold">{b.year}</small>
                  <h3 className="text-[1.02rem] font-extrabold tracking-[-.005em] mt-1 leading-[1.3]">
                    {b.title}
                  </h3>
                  {b.subtitle && (
                    <small className="text-[.82rem] text-ink-3 font-semibold block mt-1 leading-[1.4]">
                      {b.subtitle}
                    </small>
                  )}
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section-pad">
          <div className="wrap">
            <div className="grid grid-cols-1 nav:grid-cols-2 gap-[36px]">
              <div>
                <h3 className="flex items-center gap-2.5 text-[1.2rem] font-extrabold">
                  <IconCrown className="w-5 h-5 text-blue-strong" /> Төрийн болон салбарын шагнал
                </h3>
                <div className="flex flex-col gap-3 mt-5">
                  {batchimegAwards.map((a) => (
                    <div
                      key={a.title}
                      className={`card-flat px-[18px] py-[15px] ${a.top ? "border-l-[3px] border-l-gold" : ""}`}
                    >
                      <small className="text-[.8rem] text-ink-3 font-bold">{a.year}</small>
                      <b className="block text-[.98rem] font-extrabold mt-0.5 leading-[1.3]">
                        {a.title}
                      </b>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="flex items-center gap-2.5 text-[1.2rem] font-extrabold">
                  <IconGraduationCap className="w-5 h-5 text-blue-strong" /> Боловсрол
                </h3>
                <div className="flex flex-col gap-3 mt-5">
                  {batchimegEducation.map((e) => (
                    <div key={e.place} className="card-flat px-[18px] py-[15px]">
                      <b className="block text-[.98rem] font-extrabold">{e.place}</b>
                      <span className="block text-[.88rem] text-ink-2 font-medium">{e.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="hero-navy section-pad relative overflow-hidden text-white text-center">
          <div className="hero-dotgrid pointer-events-none absolute inset-0 opacity-50" />
          <div className="wrap relative z-[2] max-w-[680px] mx-auto">
            <h2 className="text-[clamp(1.85rem,3.6vw,2.6rem)] font-extrabold leading-[1.15] tracking-[-.02em] text-balance">
              Хүүхдээ бидний сургалтад хамруулах уу?
            </h2>
            <p className="text-navy-ink-2 mt-3 font-medium">
              1 жилийн гүнзгийрүүлсэн хөтөлбөр болон 1 сарын эрчимжүүлсэн сургалтуудаас сонгоорой.
            </p>
            <Link
              href="/courses"
              className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[34px] py-[19px] text-[1.075rem] mt-[26px] transition-transform hover:bg-gold-strong hover:-translate-y-0.5"
            >
              Сургалтууд үзэх <span>→</span>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
