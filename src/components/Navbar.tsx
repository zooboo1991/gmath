"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useScrolled from "@/hooks/useScrolled";
import { useProgramRegister } from "@/components/program/ProgramRegister";
import { IconPerson } from "@/components/icons";
import NotificationBell from "@/components/NotificationBell";

type NavLink = { href: string; label: string; match?: string; children?: { href: string; label: string }[] };

// "Манай баг" sits right after the courses: a parent who has just seen what is
// taught asks who teaches it next, and the answer (two gold medallists) is one
// of the strongest things this site has to say.
const links: NavLink[] = [
  { href: "/#about", label: "Нүүр" },
  { href: "/courses", label: "Сургалтууд", match: "/courses" },
  { href: "/team", label: "Манай баг", match: "/team" },
  { href: "/articles", label: "Нийтлэл", match: "/articles" },
  { href: "/certificate", label: "Сертификат", match: "/certificate" },
];

export default function Navbar() {
  const scrolled = useScrolled(12);
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { sessionUser, sessionLoaded, openLogin, openRegister, logout } = useProgramRegister();

  const closeMenu = () => setOpen(false);

  // The menu only closed when a link inside it was tapped, so it stayed open
  // over the page after a back/forward navigation. Adjusted during render
  // rather than in an effect, which would cause a cascading re-render.
  const [menuPathname, setMenuPathname] = useState(pathname);
  if (pathname !== menuPathname) {
    setMenuPathname(pathname);
    setOpen(false);
    setProfileMenuOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileMenuOpen]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    setProfileMenuOpen(false);
    router.push("/");
    router.refresh();
  };

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
            className="w-auto h-9 min-[66.25rem]:h-[34px] object-contain"
            priority
          />
        </Link>

        <nav className="hidden min-[66.25rem]:flex gap-1 ml-auto">
          {links.map((l) => {
            const active = l.match && pathname.startsWith(l.match);
            const linkClass = `font-bold text-[.97rem] px-[14px] py-[11px] rounded-full transition-colors ${
              active ? "text-ink bg-blue-soft" : "text-ink-2 hover:text-ink hover:bg-blue-soft"
            }`;
            if (!l.children) {
              return (
                <Link key={l.href} href={l.href} className={linkClass}>
                  {l.label}
                </Link>
              );
            }
            return (
              <div key={l.href} className="relative group">
                <Link href={l.href} className={`inline-block ${linkClass}`}>
                  {l.label}
                </Link>
                <div className="absolute left-0 top-full pt-1 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-150 z-[70]">
                  <div className="w-[220px] bg-surface border border-line rounded-md shadow-md py-2">
                    {l.children.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        className="block font-bold text-[.92rem] text-ink px-4 py-2.5 hover:bg-blue-soft"
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="hidden min-[66.25rem]:flex items-center gap-[10px] ml-2">
          {!sessionLoaded ? (
            // Placeholder of the same footprint: showing "Нэвтрэх" here first
            // and swapping to the profile link a moment later told signed-in
            // visitors they were signed out.
            <div aria-hidden className="w-[180px] h-[46px] rounded-full bg-surface-2 animate-pulse" />
          ) : sessionUser ? (
            <div className="flex items-center gap-1">
              <NotificationBell />
              <div ref={profileMenuRef} className="relative">
                <button
                  type="button"
                  aria-expanded={profileMenuOpen}
                  onClick={() => setProfileMenuOpen((o) => !o)}
                  className="flex items-center gap-[10px] font-extrabold text-ink px-[8px] py-[6px] rounded-full hover:bg-blue-soft transition-colors"
                >
                  <span className="w-9 h-9 rounded-full bg-blue-soft text-blue-strong grid place-items-center shrink-0">
                    <IconPerson className="w-[18px] h-[18px]" />
                  </span>
                  {sessionUser.firstName}
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] w-[200px] bg-surface border border-line rounded-md shadow-md py-2 z-[70]">
                    <Link
                      href="/profile"
                      onClick={() => setProfileMenuOpen(false)}
                      className="block font-bold text-[.92rem] text-ink px-4 py-2.5 hover:bg-blue-soft"
                    >
                      Профайл
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={loggingOut}
                      className="block w-full text-left font-bold text-[.92rem] text-red-soft px-4 py-2.5 hover:bg-blue-soft disabled:opacity-50"
                    >
                      {loggingOut ? "…" : "Гарах"}
                    </button>
                  </div>
                )}
              </div>
            </div>
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

        <div className="min-[66.25rem]:hidden ml-auto">
          <NotificationBell />
        </div>

        <button
          type="button"
          aria-label="Цэс"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="min-[66.25rem]:hidden w-12 h-12 shrink-0 rounded-[12px] border border-line-2 bg-surface relative z-[61] grid place-items-center"
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
        className={`min-[66.25rem]:hidden flex flex-col gap-1 px-[clamp(20px,5vw,48px)] border-t bg-surface overflow-hidden transition-[max-height,padding] duration-300 ease-in-out ${
          open ? "pt-[10px] pb-[22px] border-line" : "pt-0 pb-0 border-transparent"
        }`}
        style={{ maxHeight: open ? 420 : 0 }}
      >
        {links.map((l) => {
          const active = l.match && pathname.startsWith(l.match);
          return (
            <div key={l.href}>
              <Link
                href={l.href}
                onClick={closeMenu}
                className={`font-bold text-[1.02rem] px-[6px] py-[12px] rounded-xs ${
                  active ? "text-ink bg-blue-soft" : "text-ink-2 hover:text-ink hover:bg-blue-soft"
                }`}
              >
                {l.label}
              </Link>
              {l.children && (
                <div className="flex flex-col pl-4">
                  {l.children.map((c) => (
                    <Link
                      key={c.href}
                      href={c.href}
                      onClick={closeMenu}
                      className="font-bold text-[.92rem] text-ink-3 px-[6px] py-[9px] rounded-xs hover:text-ink hover:bg-blue-soft"
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!sessionLoaded ? (
          <div aria-hidden className="h-[50px] mt-[10px] rounded-full bg-surface-2 animate-pulse" />
        ) : sessionUser ? (
          <>
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
            <button
              type="button"
              onClick={() => {
                closeMenu();
                handleLogout();
              }}
              disabled={loggingOut}
              className="text-left font-extrabold text-red-soft px-[6px] py-[12px] rounded-xs hover:bg-blue-soft disabled:opacity-50"
            >
              {loggingOut ? "…" : "Гарах"}
            </button>
          </>
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
