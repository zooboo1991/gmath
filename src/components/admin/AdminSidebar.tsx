"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  IconBell,
  IconBook,
  IconChat,
  IconCheckCircle,
  IconClock,
  IconDocument,
  IconGrid,
  IconLogout,
  IconMedal,
  IconMonitor,
  IconPerson,
  IconTarget,
} from "@/components/icons";

const MENU = [
  { href: "/admin", label: "Хяналтын самбар", icon: IconGrid },
  { href: "/admin/registrations", label: "Бүртгэлүүд", icon: IconCheckCircle },
  { href: "/admin/courses", label: "Сургалтууд", icon: IconBook },
  { href: "/admin/articles", label: "Нийтлэл", icon: IconDocument },
  { href: "/admin/users", label: "Хэрэглэгчид", icon: IconPerson },
  { href: "/admin/analytics", label: "Аналитик", icon: IconMonitor },
  { href: "/admin/certificates", label: "Сертификат", icon: IconMedal },
  { href: "/admin/assessment", label: "Үнэлгээ", icon: IconTarget },
  { href: "/admin/notifications", label: "Мэдэгдэл", icon: IconBell },
  { href: "/admin/chat", label: "Чат", icon: IconChat },
  { href: "/admin/logs", label: "Түүх", icon: IconClock },
];

const STORAGE_KEY = "gmath_admin_sidebar_collapsed";

/**
 * Collapsed state lives in localStorage and is read through
 * useSyncExternalStore — the same pattern PushSettings.tsx uses. The server
 * snapshot is always "expanded", so the first paint matches the HTML and the
 * stored preference is applied right after hydration; a plain
 * useState+useEffect read would either mismatch or trip the
 * set-state-in-effect lint rule.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "1";
}

function setCollapsed(value: boolean) {
  localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  // Same-tab updates don't fire `storage`, so nudge our own subscribers.
  listeners.forEach((fn) => fn());
}

/**
 * The persistent left rail every admin page (except login) sits beside. Each
 * entry is a real link to its own route, so a refresh stays put and every
 * section is bookmarkable — the property the old ?tab= state machine lacked.
 *
 * Object pages keep their section lit via startsWith: /admin/courses/[id],
 * /admin/yearly/[id] and /admin/courses/new all belong to "Сургалтууд", and
 * the assessment sub-pages (grading/levels/problems) to "Үнэлгээ".
 */
export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    if (href === "/admin/courses") {
      return pathname.startsWith("/admin/courses") || pathname.startsWith("/admin/yearly");
    }
    if (href === "/admin/assessment") {
      return (
        pathname.startsWith("/admin/assessment") ||
        pathname.startsWith("/admin/grading") ||
        pathname.startsWith("/admin/levels") ||
        pathname.startsWith("/admin/problems")
      );
    }
    return pathname.startsWith(href);
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <aside
      className={`${
        collapsed ? "w-[64px]" : "w-[64px] lg:w-[220px]"
      } shrink-0 bg-navy text-white flex flex-col sticky top-0 h-screen overflow-y-auto transition-[width] duration-200`}
    >
      <div className="flex items-center gap-2 px-3 h-[64px] shrink-0 border-b border-white/10">
        <Link href="/admin" title="Хяналтын самбар" className="flex items-center gap-2.5 min-w-0">
          <Image
            src="/images/logo-mark.png"
            alt="gmath.mn"
            width={261}
            height={256}
            className="w-8 h-8 object-contain shrink-0"
          />
          {!collapsed && <b className="font-extrabold text-[.92rem] hidden lg:block truncate">Админ хэсэг</b>}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Цэсийг хаах"
            aria-label="Цэсийг хаах"
            className="ml-auto hidden lg:grid place-items-center w-7 h-7 rounded-md text-white/55 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <Chevron direction="left" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Цэсийг нээх"
          aria-label="Цэсийг нээх"
          className="hidden lg:grid place-items-center mx-auto mt-2 w-8 h-8 rounded-md text-white/55 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <Chevron direction="right" />
        </button>
      )}

      <nav className="flex-1 py-3 flex flex-col gap-0.5">
        {MENU.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={label}
            className={`flex items-center gap-3 mx-2 px-2.5 lg:px-3 py-2.5 rounded-md font-bold text-[.85rem] transition-colors ${
              collapsed ? "justify-center" : ""
            } ${isActive(href) ? "bg-white/12 text-white" : "text-white/65 hover:text-white hover:bg-white/6"}`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="hidden lg:block truncate">{label}</span>}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={logout}
        title="Гарах"
        className={`flex items-center gap-3 mx-2 mb-3 px-2.5 lg:px-3 py-2.5 rounded-md font-bold text-[.85rem] text-white/65 hover:text-white hover:bg-white/6 transition-colors shrink-0 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <IconLogout className="w-5 h-5 shrink-0" />
        {!collapsed && <span className="hidden lg:block">Гарах</span>}
      </button>
    </aside>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="w-4 h-4">
      <path
        d={direction === "left" ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
