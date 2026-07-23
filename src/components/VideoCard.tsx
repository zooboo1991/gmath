"use client";

import { useRef } from "react";
import { IconPlay } from "./icons";

export default function VideoCard() {
  const ref = useRef<HTMLDivElement>(null);

  const onClick = () => {
    ref.current?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(0.97)" }, { transform: "scale(1)" }],
      { duration: 220 }
    );
  };

  return (
    <div
      ref={ref}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className="mt-[22px] relative rounded-md bg-[linear-gradient(150deg,var(--color-blue),var(--color-navy))] text-white px-[24px] py-[22px] flex items-center gap-[18px] shadow-blue overflow-hidden cursor-pointer transition-transform hover:-translate-y-0.5"
    >
      <span className="w-[54px] h-[54px] rounded-full bg-white/18 grid place-items-center shrink-0 shadow-[inset_0_0_0_2px_rgba(255,255,255,.3)]">
        <IconPlay className="w-[18px] h-[18px] ml-[3px]" />
      </span>
      <b className="text-[1.05rem] font-extrabold">Багшийн тухай танилцуулга</b>
    </div>
  );
}
