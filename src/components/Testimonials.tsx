import Reveal from "./Reveal";

const testimonials = [
  {
    quote:
      "«Сургалтанд хамрагдаад сум, аймгийн олимпиадад амжилттай оролцож дараагийн түвшиндээ хамрагдж байна.»",
    initial: "О",
    name: "Д.Оюунчимэг",
    meta: "Өвөрхангай · С ангилал",
    avatarBg: "bg-[linear-gradient(145deg,var(--color-blue),var(--color-navy))]",
  },
  {
    quote: "«Онлайн учир хөдөө орон нутгаас сургалтанд хамрагдсан.»",
    initial: "Б",
    name: "Б.Болормаа",
    meta: "Орхон · C ангилал",
    avatarBg: "bg-[linear-gradient(145deg,var(--color-gold-strong),oklch(0.62_0.13_55))]",
  },
  {
    quote:
      "«Хүүхдийн маань сургууль олимпиадад тусгайлан бэлддэггүй учир сургалтанд хамрагдсан. Үр дүнтэй байсан. Баярлалаа.»",
    initial: "Э",
    name: "Г.Энхбаяр",
    meta: "Улаанбаата · D ангилал",
    avatarBg: "bg-[linear-gradient(145deg,var(--color-green),oklch(0.50_0.10_175))]",
  },
];

export default function Testimonials() {
  return (
    <section className="section-pad" id="testimonials">
      <div className="wrap">
        <div className="max-w-[640px] mx-auto text-center">
          <span className="inline-flex items-center justify-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
            Сэтгэгдэл
          </span>
          <h2 className="text-[clamp(1.85rem,3.6vw,2.6rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
            Эцэг эхчүүд юу хэлдэг вэ?
          </h2>
          <p className="text-[1.075rem] text-ink-2 mt-3 font-medium">
            Бодит сурагчдын амжилт, эцэг эхийн үнэлгээ
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] mt-[28px]">
          {testimonials.map((t) => (
            <Reveal
              key={t.name}
              className="flex flex-col gap-[18px] bg-surface border border-line rounded-md px-[24px] py-[26px] shadow-xs"
            >
              <div className="text-gold-strong tracking-[3px]">★★★★★</div>
              <p className="text-[1rem] leading-[1.6] text-ink font-semibold flex-1">{t.quote}</p>
              <div className="flex items-center gap-[12px]">
                <span
                  className={`w-[42px] h-[42px] rounded-full grid place-items-center font-extrabold text-white text-[1.05rem] shrink-0 ${t.avatarBg}`}
                >
                  {t.initial}
                </span>
                <div>
                  <b className="text-[.98rem] font-extrabold block">{t.name}</b>
                  <small className="text-[.82rem] text-ink-3 font-semibold">{t.meta}</small>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
