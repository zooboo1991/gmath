import Image from "next/image";
import Link from "next/link";
import { IconTrophy, IconCheck, IconPeopleHero } from "./icons";

export default function Hero() {
  return (
    <section className="relative text-white overflow-hidden bg-[radial-gradient(120%_120%_at_85%_0%,oklch(0.40_0.10_256_/_.9),transparent_55%),radial-gradient(90%_90%_at_0%_100%,oklch(0.34_0.085_270_/_.8),transparent_60%),linear-gradient(158deg,var(--color-navy),var(--color-navy-deep))]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.05)_1px,transparent_1px)] bg-[length:26px_26px] opacity-50 [mask-image:linear-gradient(180deg,#000,transparent_70%)]" />

      <div className="wrap relative z-[2] grid grid-cols-1 nav:grid-cols-[1.05fr_.95fr] gap-[30px] nav:gap-[48px] items-center py-[clamp(48px,7vw,92px)]">
        <div>
          <h1 className="text-[36px] font-extrabold leading-[1.06] tracking-[-.025em] text-balance">
            Хүүхдийнхээ математикийн мэдлэгт хөрөнгө оруулна гэдэг ирээдүйд нь
            <br />
            <span className="text-gold">хөрөнгө оруулж</span> байна гэсэн үг
          </h1>
          <p className="text-[1.02rem] text-[oklch(0.82_0.025_250)] mt-[14px] max-w-[407px] font-medium">
            Б.Ганбат багшийн 10 жилийн туршлагад суурилсан системтэй хөтөлбөр.
          </p>
          <div className="flex flex-wrap gap-[14px] mt-[30px]">
            <Link
              href="/courses"
              className="group inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-[oklch(0.32_0.06_70)] shadow-gold px-[34px] py-[19px] text-[1.075rem] transition-transform hover:bg-gold-strong hover:-translate-y-0.5"
            >
              Сургалтанд бүртгүүлэх{" "}
              <span className="transition-transform group-hover:translate-x-[3px]">→</span>
            </Link>
          </div>
        </div>

        <div className="relative order-first nav:order-none min-h-[320px] nav:min-h-[380px] flex items-center justify-center px-[6px] nav:px-0 overflow-hidden nav:overflow-visible">
          <div className="relative w-[min(300px,68%)] aspect-[1350/1552] grid place-items-center">
            <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_50%_40%,oklch(0.55_0.12_256_/_.55),oklch(0.30_0.08_262_/_0)_70%)] blur-[2px]" />
            <Image
              src="/images/mascot-single.png"
              alt="Ганбат багшийн шар шувуу дүр"
              fill
              sizes="300px"
              className="relative object-contain drop-shadow-[0_24px_40px_rgba(0,0,0,.35)] animate-float"
              priority
            />
          </div>

          <FloatCard
            className="left-0 top-[2%] nav:left-[-4%] nav:top-[4%] [animation-delay:.4s]"
            iconBg="bg-gold-soft text-gold-strong"
            icon={<IconTrophy withBase className="w-5 h-5" />}
            value="2024"
            label="МО-ийн аварга"
          />
          <FloatCard
            className="right-0 top-[26%] nav:right-[-8%] nav:top-[30%] [animation-delay:1.2s]"
            iconBg="bg-green-soft text-green"
            icon={<IconCheck className="w-5 h-5" />}
            value="200+"
            label="Багш"
          />
          <FloatCard
            className="left-0 bottom-[4%] nav:left-[2%] nav:bottom-[6%] [animation-delay:.8s]"
            iconBg="bg-blue-soft text-blue-strong"
            icon={<IconPeopleHero className="w-5 h-5" />}
            value="600+"
            label="Сурагч"
          />
        </div>
      </div>
    </section>
  );
}

function FloatCard({
  className,
  iconBg,
  icon,
  value,
  label,
}: {
  className: string;
  iconBg: string;
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div
      className={`absolute z-[3] flex items-center gap-[11px] bg-surface text-ink rounded-sm px-[16px] py-[13px] shadow-lg animate-float ${className}`}
    >
      <span className={`w-[38px] h-[38px] rounded-[11px] grid place-items-center shrink-0 ${iconBg}`}>
        {icon}
      </span>
      <div>
        <b className="text-[1.15rem] font-extrabold leading-none block">{value}</b>
        <small className="text-[.75rem] text-ink-3 font-bold">{label}</small>
      </div>
    </div>
  );
}
