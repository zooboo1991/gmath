import Image from "next/image";
import Link from "next/link";
import { IconMail, IconPhone, IconLocation, IconFacebook } from "./icons";

export default function Footer() {
  return (
    <footer className="bg-navy-deep text-navy-ink-2 pt-16 pb-8">
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
                <small className="block text-[.68rem] font-bold text-navy-ink-3 tracking-[.08em] uppercase">
                  Математикийн сургалт
                </small>
              </span>
            </Link>
            <p className="text-[.96rem] leading-[1.65] mt-[18px] max-w-[38ch]">
              Математикт сонирхолтой, илүүг суръя гэсэн бүх сурагчдад зориулсан гүнзгийрүүлсэн
              олимпиадын онлайн сургалт.
            </p>
          </div>

          <div>
            <h4 className="text-white text-[.82rem] font-extrabold tracking-[.1em] uppercase mb-4">
              Цэс
            </h4>
            <ul className="flex flex-col gap-[2px] -ml-1">
              <li>
                <Link href="/#about" className="inline-block py-2.5 px-1 text-[.96rem] hover:text-white transition-colors">
                  Багшийн тухай
                </Link>
              </li>
              <li>
                <Link href="/courses" className="inline-block py-2.5 px-1 text-[.96rem] hover:text-white transition-colors">
                  Сургалтууд
                </Link>
              </li>
              <li>
                <Link href="/#why" className="inline-block py-2.5 px-1 text-[.96rem] hover:text-white transition-colors">
                  Яагаад бид
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="inline-block py-2.5 px-1 text-[.96rem] hover:text-white transition-colors">
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
                <IconMail className="w-4 h-4 text-navy-ink-3 shrink-0" /> math.ganbat@gmail.com
              </li>
              <li className="flex items-center gap-[9px] text-[.96rem]">
                <IconPhone className="w-4 h-4 text-navy-ink-3 shrink-0" /> 9077 7400, 9939 5945
              </li>
              <li className="flex items-start gap-[9px] text-[.96rem]">
                <IconLocation className="w-4 h-4 text-navy-ink-3 shrink-0 mt-0.5" />
                {/* The address is the map link — one tap from the footer to
                    directions, which is what a parent looking it up wants. */}
                <a
                  href="https://maps.app.goo.gl/UcgNm7tTaQSbGenF7"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white underline decoration-white/25 hover:decoration-white underline-offset-[3px] transition-colors"
                >
                  Улаанбаатар хот, Сүхбаатар дүүрэг, 1-р хороо, 1-р сургуулийн замын эсрэг талд, Чонон
                  бүрт төв, 403 тоот
                </a>
              </li>
              <li className="flex items-center gap-[9px] text-[.96rem] -ml-1">
                <IconFacebook className="w-4 h-4 text-navy-ink-3 shrink-0 ml-1" />
                <a
                  href="https://www.facebook.com/ganbat.surgalt/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block py-2.5 px-1 hover:text-white transition-colors"
                >
                  Facebook
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex justify-between gap-4 flex-wrap text-[.86rem] text-navy-ink-3">
          <span>© 2026 Б.Ганбат багшийн математик. Бүх эрх хуулиар хамгаалагдсан.</span>
          {/* Policy pages belong in the footer on every page — it's where
              visitors (and Meta's app reviewer) look for them. */}
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Нууцлалын бодлого
            </Link>
            <Link href="/data-deletion" className="hover:text-white transition-colors">
              Мэдээлэл устгах
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
