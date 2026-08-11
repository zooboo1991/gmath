"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
    <aside className="w-[64px] lg:w-[200px] shrink-0 bg-navy text-white flex flex-col sticky top-0 h-screen overflow-y-auto">
      <Link href="/admin" className="flex items-center gap-2.5 px-4 h-[64px] shrink-0 border-b border-white/10">
        <span className="w-8 h-8 rounded-md bg-gold text-gold-ink grid place-items-center font-extrabold text-[.95rem] shrink-0">
          G
        </span>
        <b className="font-extrabold text-[.95rem] hidden lg:block">Админ хэсэг</b>
      </Link>

      <nav className="flex-1 py-3 flex flex-col gap-0.5">
        {MENU.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={label}
            className={`flex items-center gap-3 mx-2 px-2.5 lg:px-3 py-2.5 rounded-md font-bold text-[.85rem] transition-colors ${
              isActive(href) ? "bg-white/12 text-white" : "text-white/65 hover:text-white hover:bg-white/6"
            }`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className="hidden lg:block truncate">{label}</span>
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={logout}
        title="Гарах"
        className="flex items-center gap-3 mx-2 mb-3 px-2.5 lg:px-3 py-2.5 rounded-md font-bold text-[.85rem] text-white/65 hover:text-white hover:bg-white/6 transition-colors shrink-0"
      >
        <IconLogout className="w-5 h-5 shrink-0" />
        <span className="hidden lg:block">Гарах</span>
      </button>
    </aside>
  );
}
