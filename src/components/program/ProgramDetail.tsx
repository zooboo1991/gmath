import Image from "next/image";
import { RegisterTriggerButton } from "./ProgramRegister";
import { IconTrophy, IconPerson, IconClock, IconPlayBox, IconCheckCircle, IconPeopleHero, IconGraduationCap, IconGrid, IconDocument } from "@/components/icons";

const whyItems = [
  {
    icon: <IconClock className="w-6 h-6" />,
    iconBg: "bg-blue-soft text-blue-strong",
    text: "10 сарын турш тогтмол хичээллэнэ",
  },
  {
    icon: <IconTrophy className="w-6 h-6" />,
    iconBg: "bg-gold-soft text-gold-strong",
    text: "Сар бүр 10 хичээл, нийт 100+ хичээл",
  },
  {
    icon: <IconPlayBox className="w-6 h-6" />,
    iconBg: "bg-green-soft text-green",
    text: "Мини олимпиад, улирал бүрийн тайлан",
  },
  {
    icon: <IconCheckCircle className="w-6 h-6" />,
    iconBg: "bg-[oklch(0.93_0.04_300)] text-[oklch(0.52_0.15_300)]",
    text: "Онлайн болон танхимаар хичээллэнэ.",
  },
  {
    icon: <IconPeopleHero className="w-6 h-6" />,
    iconBg: "bg-blue-soft text-blue-strong",
    text: "Багштай ганцаарчилж уулзаж, зөвлөгөө авах",
  },
  {
    icon: <IconGraduationCap className="w-6 h-6" />,
    iconBg: "bg-gold-soft text-gold-strong",
    text: "Vip хаалттай группт хамрагдана",
  },
];

const stepCards = [
  {
    icon: <IconTrophy className="w-[26px] h-[26px]" />,
    gradient: "linear-gradient(135deg,var(--color-blue),var(--color-blue-strong))",
    title: "1 жилийн хөтөлбөр = 10 сар = 100 хичээл",
    text: "Бүтэн жилийн хугацаанд (2026.08 сараас 2027 оны 06 сар хүртэл) хичээллэх ба танхимын хичээлийг ч мөн бичлэг байдлаар оруулах учраас 100% онлайнаар хамрагдах боломжтой.",
  },
  {
    icon: <IconPlayBox className="w-[26px] h-[26px]" />,
    gradient: "linear-gradient(135deg,var(--color-blue-strong),var(--color-navy))",
    title: "Мини олимпиад, тайлан, зөвлөгөө",
    text: "Сар бүрийн эцэст мини олимпиад зохион байгуулж, дэвшлийг үнэлнэ. Эцэг эхэд улирал бүр тайлан, зөвлөгөө хүргэнэ.",
  },
  {
    icon: <IconPeopleHero className="w-[26px] h-[26px]" />,
    gradient: "linear-gradient(135deg,var(--color-navy),var(--color-navy-2))",
    title: "VIP хаалттай групп",
    text: "Олимпиадуудын мэдээ, мэдээлэл, бодолтууд, хичээлийн бичлэг, тэмдэглэл, тайлбар, болон нэмэлт видео, болон зөвлөгөөний контентуудыг нэг дороос авах боломжтой.",
  },
  {
    icon: <IconGrid className="w-[26px] h-[26px]" />,
    gradient: "linear-gradient(135deg,var(--color-navy-2),var(--color-navy-deep))",
    title: "Сургалтын материал, мерчант бүтээгдэхүүн",
    text: "Сургалтад хамрагдсан сурагчид сургалтын материал, брэндийн мерчант бүтээгдэхүүн авах эрхтэй болно.",
  },
];

export default function ProgramDetail({
  category,
  categoryWord,
  grade,
}: {
  category: string;
  categoryWord: string;
  grade: string;
}) {
  const price = "2,800,000₮";
  const program = { id: `program-${category.toLowerCase()}`, label: `1 жилийн хөтөлбөр (${category} ангилал)`, price };

  return (
    <>
      <section className="relative text-white overflow-hidden bg-[radial-gradient(120%_120%_at_85%_0%,rgba(14,95,196,.55),transparent_55%),radial-gradient(90%_90%_at_0%_100%,rgba(8,47,94,.7),transparent_60%),linear-gradient(158deg,var(--color-navy),var(--color-navy-deep))]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.05)_1px,transparent_1px)] bg-[length:26px_26px] opacity-50 [mask-image:linear-gradient(180deg,#000,transparent_70%)]" />

        <div className="wrap relative z-[2] grid grid-cols-1 nav:grid-cols-[1.15fr_.85fr] gap-10 items-center py-[clamp(48px,7vw,84px)]">
          <div>
            <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-gold bg-white/9 px-[14px] py-2 rounded-full before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
              {category} ангилал · 1 жилийн хөтөлбөр
            </span>
            <h1 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] font-extrabold leading-[1.14] tracking-[-.02em] text-balance">
              {categoryWord} ангиллын олимпиадын онлайн, танхим хосолсон 1 жилийн хөтөлбөр
            </h1>
            <p className="mt-4 text-[oklch(0.86_0.025_250)] text-[1.05rem] font-semibold max-w-[52ch]">
              {category} ангилал ({grade}-р анги) сурагчдад, бүтэн жилийн хугацаанд дотоодын болон
              олон улсын олимпиадад бэлдэх хөтөлбөр.
            </p>

            <div className="flex gap-[26px] mt-[26px] flex-wrap">
              <div className="flex items-center gap-[10px]">
                <IconTrophy className="w-[22px] h-[22px] text-gold" />
                <div>
                  <b className="text-[1.3rem] font-extrabold block leading-none">100+</b>
                  <small className="text-[oklch(0.82_0.025_250)] font-bold text-[.78rem]">хичээл</small>
                </div>
              </div>
              <div className="flex items-center gap-[10px]">
                <IconPerson className="w-[22px] h-[22px] text-gold" />
                <div>
                  <b className="text-[1.3rem] font-extrabold block leading-none">1</b>
                  <small className="text-[oklch(0.82_0.025_250)] font-bold text-[.78rem]">анги</small>
                </div>
              </div>
              <div className="flex items-center gap-[10px]">
                <IconClock className="w-[22px] h-[22px] text-gold" />
                <div>
                  <b className="text-[1.3rem] font-extrabold block leading-none">10</b>
                  <small className="text-[oklch(0.82_0.025_250)] font-bold text-[.78rem]">сарын хугацаа</small>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <RegisterTriggerButton program={program} className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-[oklch(0.32_0.06_70)] shadow-gold px-[34px] py-[19px] text-[1.075rem] transition-transform hover:-translate-y-0.5 hover:bg-gold-strong">
                Сургалтанд бүртгүүлэх <span>→</span>
              </RegisterTriggerButton>
            </div>
          </div>

          <div className="relative aspect-[4/5] max-w-[340px] mx-auto w-full">
            <div className="relative w-full h-full rounded-lg overflow-hidden shadow-lg">
              <Image src="/images/teacher-photo.jpg" alt="Багш Б.Ганбат" fill sizes="340px" className="object-cover" />
            </div>
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="wrap">
          <div className="max-w-[640px] mx-auto text-center">
            <span className="inline-flex items-center justify-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
              Тухай
            </span>
            <h2 className="text-[clamp(1.85rem,3.6vw,2.6rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
              Яагаад бүтэн жилийн хөтөлбөр гэж?
            </h2>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 nav:grid-cols-3 gap-[18px] max-w-[960px] mx-auto mt-[44px]">
            {whyItems.map((item) => (
              <li
                key={item.text}
                className="bg-surface border border-line rounded-md px-[22px] py-[26px] shadow-xs transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-md"
              >
                <span className={`w-12 h-12 rounded-[14px] grid place-items-center mb-3.5 ${item.iconBg}`}>
                  {item.icon}
                </span>
                <p className="font-bold text-ink text-[.98rem] leading-[1.4]">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-pad bg-bg-soft">
        <div className="wrap">
          <div className="grid grid-cols-1 nav:grid-cols-2 gap-[22px] max-w-[980px] mx-auto">
            {stepCards.map((s, i) => (
              <div
                key={s.title}
                className="relative overflow-hidden rounded-lg px-6 nav:px-9 py-8 text-white shadow-md"
                style={{ background: s.gradient }}
              >
                <div className="pointer-events-none absolute -right-[30px] -top-[30px] w-[150px] h-[150px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.12),transparent_70%)]" />
                <div className="relative z-[2] flex items-center gap-[14px]">
                  <span className="w-[52px] h-[52px] rounded-[14px] bg-white/16 grid place-items-center shrink-0">
                    {s.icon}
                  </span>
                  <span className="text-[1.4rem] font-black opacity-50 tracking-[-.02em]">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="relative z-[2] text-white text-[clamp(1.15rem,2vw,1.4rem)] mt-4 font-extrabold">
                  {s.title}
                </h3>
                <p className="relative z-[2] mt-2.5 text-white/82 text-[.96rem] font-medium">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="wrap">
          <div className="relative overflow-hidden bg-[linear-gradient(160deg,#1c3d2e,#12281e)] rounded-lg px-6 nav:px-[56px] py-9 nav:py-14 text-[#eef7ef] shadow-lg">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.04)_1px,transparent_1px)] bg-[length:22px_22px] opacity-60" />
            <div className="relative z-[2] grid grid-cols-1 nav:grid-cols-[.9fr_1.1fr] gap-9 items-center">
              <div className="order-2 nav:order-1">
                <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-gold bg-white/8 px-[14px] py-2 rounded-full before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
                  Үр дүн
                </span>
                <h3 className="mt-3.5 text-white text-[clamp(1.3rem,2.4vw,1.7rem)] text-left font-extrabold">
                  Энэ хөтөлбөр нь сурагчийг
                </h3>
              </div>
              <div className="order-1 nav:order-2 flex justify-center">
                <IconDocument className="w-[110px] h-[110px] nav:w-[130px] nav:h-[130px] text-gold opacity-90" />
              </div>
            </div>
            <ul className="relative z-[2] flex flex-col gap-4 mt-6">
              <li className="font-bold text-[1.02rem] text-[#dcf0e0]">
                Сурч мэдсэн зүйлээ <b className="text-gold">бодит олимпиадад ашиглах</b> чадвартай
                болгоно
              </li>
              <li className="font-bold text-[1.02rem] text-[#dcf0e0]">
                Өөр бодлого шийдвэрлэх <b className="text-gold">арга барил, дадал</b> эзэмшүүлнэ
              </li>
              <li className="font-bold text-[1.02rem] text-[#dcf0e0]">
                &ldquo;Чадна&rdquo; гэсэн итгэл <b className="text-gold">өөртөө итгэх итгэлийг</b>{" "}
                нэмэгдүүлнэ
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[linear-gradient(135deg,var(--color-blue),var(--color-navy))] py-[clamp(48px,7vw,80px)]">
        <div className="pointer-events-none absolute right-[-40px] bottom-[-40px] w-[200px] h-[200px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.1),transparent_70%)]" />
        <div className="wrap relative z-[2] flex flex-wrap items-center gap-7 justify-between">
          <div className="bg-surface rounded-md px-7 py-[22px] shadow-md">
            <small className="font-extrabold text-ink-2 text-[.9rem]">Жилийн сургалтын төлбөр</small>
            <b className="block text-[1.9rem] font-extrabold text-navy mt-1.5">{price}</b>
          </div>
          <div className="text-white font-bold max-w-[36ch] text-[1rem]">
            <IconPeopleHero className="w-[26px] h-[26px] text-gold mb-2" />
            Б.Ганбат багшийн удирдлаган дор ажилладаг <b className="text-gold">VIP Хаалттай групп</b>
            -т хамрагдаж, нэг жилийн турш тогтмол хөгжинө.
          </div>
          <RegisterTriggerButton program={program} className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-[oklch(0.32_0.06_70)] shadow-gold px-[34px] py-[19px] text-[1.075rem] transition-transform hover:-translate-y-0.5 hover:bg-gold-strong">
            Сургалтанд бүртгүүлэх <span>→</span>
          </RegisterTriggerButton>
        </div>
      </section>
    </>
  );
}
