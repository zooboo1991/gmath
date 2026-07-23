import Image from "next/image";
import Link from "next/link";
import { IconMail, IconPhone, IconInstagram } from "./icons";

export default function Footer() {
  return (
    <footer className="bg-navy-deep text-[oklch(0.78_0.02_255)] pt-16 pb-8">
      <div className="wrap">
        <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1fr] gap-10">
          <div>
            <Link href="/" className="flex items-center gap-[11px] font-extrabold">
              <Image
                src="/images/symbol.png"
                alt=""
                width={1644}
                height={1680}
                className="w-10 h-10 object-contain"
              />
              <span className="text-[1.12rem] tracking-[-.01em] leading-[1.05] text-white">
                Б.Ганбат багш
                <small className="block text-[.68rem] font-bold text-[oklch(0.62_0.03_255)] tracking-[.08em] uppercase">
                  Математикийн сургалт
                </small>
              </span>
            </Link>
            <p className="text-[.96rem] leading-[1.65] mt-[18px] max-w-[38ch] text-[oklch(0.72_0.02_255)]">
              Математикт сонирхолтой, илүүг суръя гэсэн бүх сурагчдад зориулсан гүнзгийрүүлсэн
              олимпиадын онлайн сургалт.
            </p>
          </div>

          <div>
            <h4 className="text-white text-[.82rem] font-extrabold tracking-[.1em] uppercase mb-4">
              Цэс
            </h4>
            <ul className="flex flex-col gap-[11px]">
              <li>
                <Link href="/#about" className="text-[.96rem] hover:text-white transition-colors">
                  Багшийн тухай
                </Link>
              </li>
              <li>
                <Link href="/courses" className="text-[.96rem] hover:text-white transition-colors">
                  Сургалтууд
                </Link>
              </li>
              <li>
                <Link href="/#why" className="text-[.96rem] hover:text-white transition-colors">
                  Яагаад бид
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="text-[.96rem] hover:text-white transition-colors">
                  Асуулт хариулт
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white text-[.82rem] font-extrabold tracking-[.1em] uppercase mb-4">
              Холбоо барих
            </h4>
            <ul className="flex flex-col gap-[11px]">
              <li className="flex items-center gap-[9px] text-[.96rem]">
                <IconMail className="w-4 h-4 text-[oklch(0.62_0.05_255)]" /> math.ganbat@gmail.com
              </li>
              <li className="flex items-center gap-[9px] text-[.96rem]">
                <IconPhone className="w-4 h-4 text-[oklch(0.62_0.05_255)]" /> 9939 5945
              </li>
              <li className="flex items-center gap-[9px] text-[.96rem]">
                <IconInstagram className="w-4 h-4 text-[oklch(0.62_0.05_255)]" /> Instagram ·
                Facebook
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex justify-between gap-4 flex-wrap text-[.86rem] text-[oklch(0.62_0.02_255)]">
          <span>© 2026 Б.Ганбат багшийн математик. Бүх эрх хуулиар хамгаалагдсан.</span>
          <span>Олимпиадын математикийн онлайн сургалт</span>
        </div>
      </div>
    </footer>
  );
}
