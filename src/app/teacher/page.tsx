import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import JsonLd, { SITE_URL } from "@/components/JsonLd";
import TeacherTimeline from "@/components/teacher/TeacherTimeline";
import { IconCrown, IconGraduationCap, IconBriefcase, IconBook } from "@/components/icons";
import { teacherBooks, teacherEducation, teacherExperience } from "@/lib/teacherTimeline";

export const metadata: Metadata = {
  title: "Багшийн танилцуулга",
  description:
    "Б.Ганбат — Монголын математикийн олимпиадын «Дархан аварга» багш. 2013 оноос багшилж, 4 удаа Алтан медаль хүртсэн туршлага, шавь нарын амжилт, хэвлүүлсэн номууд.",
  alternates: { canonical: "/teacher" },
};

export default function TeacherPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Person",
          name: "Б.Ганбат",
          jobTitle: "Математикийн олимпиадын багш",
          description:
            "Монголын математикийн олимпиадын «Дархан аварга» багш, 4 удаагийн Алтан медальт.",
          image: `${SITE_URL}/images/teacher-photo.jpg`,
          url: `${SITE_URL}/teacher`,
          worksFor: { "@type": "EducationalOrganization", name: "Б.Ганбат багшийн математикийн сургалт" },
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
                Б.Ганбат — Монголын математикийн олимпиадын «Дархан аварга» багш
              </h1>
              <p className="text-[1.05rem] text-navy-ink-2 mt-4 max-w-[54ch] font-medium">
                2013 оноос математикийн багшаар ажиллаж, 2024 онд Монголын математикийн олимпиадад{" "}
                <b className="text-white">4 дэх Алтан медалиа</b> хүртсэн. Онолын математикийн магистр,
                Сөүлийн Их Сургуулийн докторант.
              </p>
              <div className="grid grid-cols-3 gap-[10px] mt-[26px] max-w-[440px]">
                {[
                  { value: "4×", label: "Алтан медаль (МО, багш)" },
                  { value: "13", label: "жилийн багшлах туршлага" },
                  { value: "6", label: "хэвлүүлсэн ном" },
                ].map((m) => (
                  <div key={m.label} className="bg-white/7 border border-white/10 rounded-sm px-[12px] py-[14px]">
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
                  src="/images/teacher-photo.jpg"
                  alt="Б.Ганбат багш"
                  fill
                  sizes="(min-width: 980px) 320px, 60vw"
                  className="object-cover"
                  priority
                />
              </div>
              <div className="absolute -bottom-5 -left-5 flex items-center gap-3 bg-surface text-ink rounded-sm px-[16px] py-[13px] shadow-md max-w-[240px]">
                <span className="w-10 h-10 rounded-[11px] bg-gold-soft text-gold-strong grid place-items-center shrink-0">
                  <IconCrown className="w-5 h-5" />
                </span>
                <div>
                  <b className="text-[.95rem] font-extrabold leading-none block">Дархан аварга</b>
                  <small className="text-[.76rem] text-ink-3 font-semibold">2024 · МО 60-р олимпиад</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pt-10 md:pt-12 pb-0">
          <div className="wrap">
            <Reveal className="relative rounded-lg bg-[linear-gradient(150deg,var(--color-blue),var(--color-navy))] text-white flex items-start gap-5 px-[26px] py-[26px] max-w-[840px] mx-auto shadow-blue overflow-hidden">
              <span className="w-[54px] h-[54px] rounded-[15px] bg-gold-soft text-gold-strong grid place-items-center shrink-0">
                <IconCrown className="w-6 h-6" />
              </span>
              <div>
                <small className="text-[.78rem] text-navy-ink-2 font-extrabold uppercase tracking-[.08em]">
                  Онцлох амжилт · 2023
                </small>
                <h3 className="text-[1.15rem] font-extrabold leading-[1.3] mt-1.5">
                  Олон улсын Математик, Физик, Компьютерийн ухааны багш, дасгалжуулагчдын 5-р олимпиад — Алтан медаль
                </h3>
                <p className="text-[.95rem] text-navy-ink-2 font-medium mt-2">
                  International Mathematics, Physics and Computer Science Teachers and Trainers Olympiad —
                  дасгалжуулагчдын төрөлд (League of Trainers) Монгол улсын анхны Алтан медаль.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="section-pad bg-bg-soft" id="timeline">
          <div className="wrap">
            <div className="max-w-[640px] mx-auto text-center">
              <span className="inline-flex items-center justify-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
                Он цагийн хэлхээс
              </span>
              <h2 className="text-[clamp(1.85rem,3.6vw,2.6rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
                2009 оноос өнөөг хүртэл
              </h2>
              <p className="text-[1.075rem] text-ink-2 mt-3 font-medium">
                Багшийн хувийн амжилт, шавь нарын медаль, боловсрол болон хэвлүүлсэн номууд
              </p>
            </div>

            <div className="mt-[44px]">
              <TeacherTimeline />
            </div>
          </div>
        </section>

        <section className="section-pad">
          <div className="wrap">
            <div className="max-w-[640px] mx-auto text-center">
              <span className="inline-flex items-center justify-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
                Хэвлүүлсэн ном
              </span>
              <h2 className="text-[clamp(1.85rem,3.6vw,2.6rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
                6 ном, олимпиадын бэлтгэлийн гарын авлага
              </h2>
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 nav:grid-cols-3 gap-[18px] mt-[44px]">
              {teacherBooks.map((b) => (
                <Reveal key={b.title} className="card-flat px-[22px] py-[24px]">
                  <span className="w-[46px] h-[46px] rounded-[13px] bg-blue-soft text-blue-strong grid place-items-center mb-3">
                    <IconBook className="w-5 h-5" />
                  </span>
                  <small className="text-[.8rem] text-ink-3 font-bold">{b.year}</small>
                  <h3 className="text-[1.02rem] font-extrabold tracking-[-.005em] mt-1 leading-[1.3]">{b.title}</h3>
                  {b.subtitle && <small className="text-[.82rem] text-ink-3 font-semibold block mt-1">{b.subtitle}</small>}
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section-pad bg-bg-soft">
          <div className="wrap">
            <div className="grid grid-cols-1 nav:grid-cols-2 gap-[36px]">
              <div>
                <h3 className="flex items-center gap-2.5 text-[1.2rem] font-extrabold">
                  <IconGraduationCap className="w-5 h-5 text-blue-strong" /> Боловсрол
                </h3>
                <div className="flex flex-col gap-3 mt-5">
                  {teacherEducation.map((e) => (
                    <div key={e.place + e.range} className="card-flat px-[18px] py-[15px]">
                      <small className="text-[.8rem] text-ink-3 font-bold">{e.range}</small>
                      <b className="block text-[.98rem] font-extrabold mt-0.5">{e.place}</b>
                      <span className="block text-[.88rem] text-ink-2 font-medium">{e.role}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="flex items-center gap-2.5 text-[1.2rem] font-extrabold">
                  <IconBriefcase className="w-5 h-5 text-blue-strong" /> Ажлын туршлага
                </h3>
                <div className="flex flex-col gap-3 mt-5">
                  {teacherExperience.map((e) => (
                    <div key={e.place + e.range} className="card-flat px-[18px] py-[15px]">
                      <small className="text-[.8rem] text-ink-3 font-bold">{e.range}</small>
                      <b className="block text-[.98rem] font-extrabold mt-0.5">{e.place}</b>
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
              Хүүхдээ Ганбат багшийн сургалтад хамруулах уу?
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
