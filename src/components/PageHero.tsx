export default function PageHero({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <section className="hero-navy relative text-white overflow-hidden pt-14 pb-11">
      <div className="hero-dotgrid pointer-events-none absolute inset-0 opacity-50" />
      <div className="wrap relative z-[2]">
        <span className="inline-flex items-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-gold bg-white/9 px-[14px] py-2 rounded-full before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
          {eyebrow}
        </span>
        <h1 className="mt-4 text-[clamp(1.9rem,3.6vw,2.7rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-balance">
          {title}
        </h1>
      </div>
    </section>
  );
}
