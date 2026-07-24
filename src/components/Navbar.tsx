"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useScrolled from "@/hooks/useScrolled";
import { useProgramRegister } from "@/components/program/ProgramRegister";
import { IconPerson } from "@/components/icons";

const links = [
  { href: "/#about", label: "Нүүр" },
  { href: "/courses", label: "Сургалтууд", match: "/courses" },
  { href: "/articles", label: "Нийтлэл", match: "/articles" },
];

export default function Navbar() {
  const scrolled = useScrolled(12);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { sessionUser, openLogin, openRegister } = useProgramRegister();

  const closeMenu = () => setOpen(false);

  return (
    <header
      className={`sticky top-0 z-[60] bg-bg/82 backdrop-blur-[14px] backdrop-saturate-[1.4] border-b transition-[border-color,box-shadow] duration-300 ${
        scrolled ? "border-line shadow-xs" : "border-transparent"
      }`}
    >
      <div className="wrap flex items-center gap-[28px] h-[76px]">
        <Link
          href="/"
          aria-label="Ганбат багш"
          className="flex items-center gap-[11px] font-extrabold shrink-0 min-w-0"
        >
          <Image
            src="/images/logo-header.png"
            alt="Б.Ганбат багшийн математикийн сургалт"
            width={1087}
            height={200}
            className="w-auto h-9 nav:h-[34px] object-contain"
            priority
          />
        </Link>

        <nav className="hidden nav:flex gap-1 ml-auto">
          {links.map((l) => {
            const active = l.match && pathname === l.match;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`font-bold text-[.97rem] px-[14px] py-[11px] rounded-full transition-colors ${
                  active ? "text-ink bg-blue-soft" : "text-ink-2 hover:text-ink hover:bg-blue-soft"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden nav:flex items-center gap-[10px] ml-2">
          {sessionUser ? (
            <Link
              href="/profile"
              className="flex items-center gap-[10px] font-extrabold text-ink px-[8px] py-[6px] rounded-full hover:bg-blue-soft transition-colors"
            >
              <span className="w-9 h-9 rounded-full bg-blue-soft text-blue-strong grid place-items-center shrink-0">
                <IconPerson className="w-[18px] h-[18px]" />
              </span>
              {sessionUser.firstName}
            </Link>
          ) : (
            <>
              <button
                type="button"
                onClick={openLogin}
                className="inline-flex items-center justify-center gap-[10px] font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[22px] py-[12px] transition-transform hover:bg-gold-strong hover:-translate-y-0.5"
              >
                Нэвтрэх
              </button>
              <button type="button" onClick={openRegister} className="font-extrabold text-ink px-[6px] py-[12px]">
                Бүртгүүлэх
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label="Цэс"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="nav:hidden ml-auto w-12 h-12 shrink-0 rounded-[12px] border border-line-2 bg-surface relative z-[61] grid place-items-center"
        >
          <span className="sr-only">Цэс</span>
          <div className="flex flex-col gap-[3px] items-center">
            <span
              className={`block w-[18px] h-[2px] bg-ink rounded-sm transition-transform duration-200 ease-out ${
                open ? "translate-y-[5px] rotate-45" : ""
              }`}
            />
            <span
              className={`block w-[18px] h-[2px] bg-ink rounded-sm transition-opacity duration-200 ${
                open ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block w-[18px] h-[2px] bg-ink rounded-sm transition-transform duration-200 ease-out ${
                open ? "-translate-y-[5px] -rotate-45" : ""
              }`}
            />
          </div>
        </button>
      </div>

      <div
        className={`nav:hidden flex flex-col gap-1 px-[clamp(20px,5vw,48px)] border-t bg-surface overflow-hidden transition-[max-height,padding] duration-300 ease-in-out ${
          open ? "pt-[10px] pb-[22px] border-line" : "pt-0 pb-0 border-transparent"
        }`}
        style={{ maxHeight: open ? 420 : 0 }}
      >
        {links.map((l) => {
          const active = l.match && pathname === l.match;
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={closeMenu}
              className={`font-bold text-[1.02rem] px-[6px] py-[12px] rounded-xs ${
                active ? "text-ink bg-blue-soft" : "text-ink-2 hover:text-ink hover:bg-blue-soft"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
        {sessionUser ? (
          <Link
            href="/profile"
            onClick={closeMenu}
            className="flex items-center gap-[10px] font-extrabold text-ink px-[6px] py-[12px] mt-[10px] rounded-xs hover:bg-blue-soft"
          >
            <span className="w-8 h-8 rounded-full bg-blue-soft text-blue-strong grid place-items-center shrink-0">
              <IconPerson className="w-4 h-4" />
            </span>
            {sessionUser.firstName}
          </Link>
        ) : (
          <div className="flex gap-[10px] mt-[10px]">
            <button
              type="button"
              onClick={() => {
                closeMenu();
                openLogin();
              }}
              className="flex-1 text-center font-extrabold rounded-full bg-gold text-gold-ink shadow-gold px-[18px] py-[13px]"
            >
              Нэвтрэх
            </button>
            <button
              type="button"
              onClick={() => {
                closeMenu();
                openRegister();
              }}
              className="btn-ring flex-1 text-center font-extrabold rounded-full text-ink px-[18px] py-[13px]"
            >
              Бүртгүүлэх
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
