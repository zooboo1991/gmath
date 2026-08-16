"use client";

import { useState } from "react";
import Reveal from "./Reveal";
import { IconPlus, IconChat, IconPhone } from "./icons";
import { openChatWidget } from "./ChatWidget";
// Shared with the chatbot's system prompt — see src/lib/siteContent.ts.
import { siteFaqs as faqs } from "@/lib/siteContent";

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="section-pad bg-surface" id="faq">
      <div className="wrap">
        <div className="max-w-[640px] mx-auto text-center">
          <span className="inline-flex items-center justify-center gap-2 text-[.76rem] font-extrabold tracking-[.14em] uppercase text-blue-strong before:content-[''] before:w-[22px] before:h-[2px] before:rounded-sm before:bg-gold-strong">
            Асуулт хариулт
          </span>
          <h2 className="text-[clamp(1.85rem,3.6vw,2.6rem)] font-extrabold leading-[1.12] tracking-[-.02em] text-ink mt-4 text-balance">
            Түгээмэл асуултууд
          </h2>
          <p className="text-[1.075rem] text-ink-2 mt-3 font-medium">
            Эцэг эхийн хамгийн их асуудаг асуултууд
          </p>
        </div>

        <div className="grid grid-cols-1 nav:grid-cols-[1.5fr_1fr] gap-[28px] mt-[44px] items-start">
          <Reveal className="flex flex-col gap-[12px]">
            {faqs.map((item, i) => {
              const isOpen = openIndex === i;
              return (
                <div
                  key={item.q}
                  className={`bg-surface border rounded-md shadow-xs overflow-hidden transition-[border-color,box-shadow] ${
                    isOpen ? "border-blue-soft-2 shadow-sm" : "border-line"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-4 px-[24px] py-[20px] text-left font-extrabold text-[1.06rem] text-ink"
                  >
                    {item.q}
                    <span
                      className={`ml-auto shrink-0 w-[30px] h-[30px] rounded-full grid place-items-center transition-[transform,background,color] duration-300 ${
                        isOpen ? "rotate-45 bg-blue text-white" : "bg-blue-soft text-blue-strong"
                      }`}
                    >
                      <IconPlus className="w-4 h-4" />
                    </span>
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows] duration-[350ms] ease-[cubic-bezier(.4,0,.2,1)] ${
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-[24px] pb-[22px] text-ink-2 text-[1rem] leading-[1.65] font-medium">
                        {item.a}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </Reveal>

          <Reveal
            as="aside"
            className="panel-blue text-white rounded-lg px-[30px] py-[32px] shadow-sm nav:sticky nav:top-24"
          >
            <span className="w-[54px] h-[54px] rounded-2xl bg-white/18 grid place-items-center">
              <IconChat className="w-7 h-7" />
            </span>
            <h3 className="text-[1.4rem] font-extrabold mt-[18px]">Асуулт байна уу?</h3>
            <p className="text-[.98rem] text-white/85 mt-1.5">
              Сайт дээрх AI туслахаас хүссэн зүйлээ шууд асууж тодруулаарай.
            </p>
            {/* Opens the site's own chat instead of sending the visitor off to
                Facebook — the answer is right here. */}
            <button
              type="button"
              onClick={openChatWidget}
              className="flex items-center justify-center gap-[10px] w-full mt-[22px] bg-white text-blue-strong font-extrabold px-4 py-4 rounded-full shadow-sm transition-transform hover:-translate-y-0.5"
            >
              <IconChat className="w-5 h-5" /> AI туслахтай чатлах
            </button>
            <div className="flex flex-col gap-2.5 mt-5 pt-5 border-t border-white/20">
              <a href="tel:90777400" className="flex items-center gap-2">
                <IconPhone className="w-4 h-4 shrink-0 text-white/80" />
                <span className="text-[1.05rem] font-bold tracking-[.02em]">9077 7400</span>
              </a>
              <a href="tel:90345577" className="flex items-center gap-2">
                <IconPhone className="w-4 h-4 shrink-0 text-white/80" />
                <span className="text-[1.05rem] font-bold tracking-[.02em]">9034 5577</span>
              </a>
              <small className="block text-[.85rem] text-white/80">10:00–18:00 цагийн хооронд хариулна</small>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
