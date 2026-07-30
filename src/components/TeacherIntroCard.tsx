import Link from "next/link";
import { IconPerson } from "./icons";

export default function TeacherIntroCard() {
  return (
    <Link
      href="/teacher"
      className="mt-[22px] relative rounded-md bg-[linear-gradient(150deg,var(--color-blue),var(--color-navy))] text-white px-[24px] py-[22px] flex items-center gap-[18px] shadow-blue overflow-hidden transition-transform hover:-translate-y-0.5"
    >
      <span className="w-[54px] h-[54px] rounded-full bg-white/18 grid place-items-center shrink-0 shadow-[inset_0_0_0_2px_rgba(255,255,255,.3)]">
        <IconPerson className="w-[22px] h-[22px]" />
      </span>
      <b className="text-[1.05rem] font-extrabold">Багшийн тухай танилцуулга</b>
    </Link>
  );
}
