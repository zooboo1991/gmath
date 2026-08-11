import Reveal from "./Reveal";
import { IconTrophy, IconBook, IconTarget, IconPlayBox } from "./icons";
import { siteFeatures } from "@/lib/siteContent";

// Wording lives in src/lib/siteContent.ts so the chatbot answers from the same
// copy; only the visuals stay here. Order must match siteFeatures.
const visuals = [
  { icon: <IconTrophy withBase className="w-[26px] h-[26px]" />, iconBg: "bg-gold-soft text-gold-strong" },
  { icon: <IconBook className="w-[26px] h-[26px]" />, iconBg: "bg-blue-soft text-blue-strong" },
  { icon: <IconTarget className="w-[26px] h-[26px]" />, iconBg: "bg-green-soft text-green" },
  { icon: <IconPlayBox className="w-[26px] h-[26px]" />, iconBg: "bg-purple-soft text-purple" },
];

const features = siteFeatures.map((f, i) => ({ ...f, ...visuals[i] }));

export default function WhyUs() {
  return (
    <section className="section-pad bg-bg-soft" id="why">
      <div className="wrap">
        <div className="max-w-[640px] mx-auto text-center">
          <span className="inline-flex items-center justify-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
            Яагаад бид
          </span>
          <h2 className="text-[clamp(1.85rem,3.6vw,2.6rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
            Яагаад манай сургалтыг сонгох вэ?
          </h2>
          <p className="text-[1.075rem] text-ink-2 mt-3 font-medium">
            Энгийн сургалтаас юугаараа ялгаатай вэ
          </p>
        </div>

        <div className="grid grid-cols-1 xs:grid-cols-2 nav:grid-cols-4 gap-[18px] mt-[44px]">
          {features.map((f) => (
            <Reveal
              key={f.title}
              className="card-flat px-[22px] py-[26px] hover:border-blue-soft-2"
            >
              <span className={`w-[52px] h-[52px] rounded-[15px] grid place-items-center mb-4 ${f.iconBg}`}>
                {f.icon}
              </span>
              <h3 className="text-[1.16rem] font-extrabold tracking-[-.01em]">{f.title}</h3>
              <p className="text-[.95rem] text-ink-2 mt-[7px] font-medium">{f.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
