"use client";

import { useState } from "react";
import { IconMedal } from "@/components/icons";
import { teacherTimeline, timelineFilters, type TimelineCategory, type TimelineTone } from "@/lib/teacherTimeline";

const TONE_CLASSES: Record<TimelineTone, string> = {
  gold: "bg-gold-soft text-gold-strong",
  silver: "bg-surface-2 text-ink-2",
  bronze: "bg-[#fbead9] text-[#a8622a]",
  blue: "bg-blue-soft text-blue-strong",
  plain: "bg-surface-2 text-ink-3",
};

const BORDER_CLASSES: Record<TimelineTone, string> = {
  gold: "border-l-gold",
  silver: "border-l-line-2",
  bronze: "border-l-[#e3a262]",
  blue: "border-l-blue",
  plain: "border-l-line",
};

export default function TeacherTimeline() {
  const [filter, setFilter] = useState<"all" | TimelineCategory>("all");

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2 mb-10">
        {timelineFilters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`font-extrabold text-[.9rem] px-[16px] py-[9px] rounded-full border transition-colors ${
              filter === f.value
                ? "bg-navy text-white border-navy"
                : "bg-surface text-ink-2 border-line hover:border-line-2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-10">
        {teacherTimeline.map((group) => {
          const items = group.items.filter((item) => filter === "all" || item.cat === filter);
          if (items.length === 0) return null;
          return (
            <div key={group.year} className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4 sm:gap-8">
              <div className="font-extrabold text-[1.1rem] text-ink sm:pt-1">{group.year}</div>
              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <div
                    key={item.title}
                    className={`card-flat border-l-[3px] px-[18px] py-[16px] ${BORDER_CLASSES[item.tone]}`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <h4 className="font-extrabold text-[.98rem] leading-[1.35]">{item.title}</h4>
                      <span
                        className={`inline-flex items-center gap-1.5 shrink-0 font-extrabold text-[.78rem] px-[10px] py-[5px] rounded-full ${TONE_CLASSES[item.tone]}`}
                      >
                        {item.tone === "gold" && <IconMedal className="w-3.5 h-3.5" />}
                        {item.badge}
                      </span>
                    </div>
                    {item.note && <p className="text-[.88rem] text-ink-2 font-medium mt-1.5">{item.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
