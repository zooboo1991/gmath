"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { PublicUser, Registration, RegistrationPayment } from "@/lib/db";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { compareMn } from "@/lib/sortMn";
import { registrationBalance } from "@/lib/registration";
import { formatMnt } from "@/lib/price";
import { formatDate } from "@/lib/dateFormat";

type RegistrationWithUser = Registration & { user?: PublicUser };


export default function UsersPanel({
  initialUsers,
  registrations,
  payments,
  lastLogin,
  canEdit,
}: {
  initialUsers: PublicUser[];
  registrations: RegistrationWithUser[];
  /** Instalments, so the list can show who still owes. */
  payments: RegistrationPayment[];
  /** userId → when they last signed in. */
  lastLogin: Record<string, string>;
  // The read-only admin gets the list and the filters, not the add form.
  // Cosmetic only — POST /api/admin/users checks the role itself.
  canEdit: boolean;
}) {
  const router = useRouter();
  // Owned here now that the tab is a standalone route — the old dashboard
  // parent used to hold this state and pass the setter down.
  const [users, setUsers] = useState(initialUsers);
  // One box searches name, phone and email at once — three separate boxes
  // meant knowing in advance which one the answer was in.
  const [query, setQuery] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [role, setRole] = useState<"" | "teacher" | "student">("");
  const [enrolment, setEnrolment] = useState<"" | "active" | "none" | "owing">("");
  const [sort, setSort] = useState<"newest" | "name" | "owing" | "seen">("newest");

  const [addOpen, setAddOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"student" | "teacher">("student");
  const [adding, setAdding] = useState(false);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});

  const addUser = async () => {
    setAdding(true);
    setAddErrors({});
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone, password: newPassword, role: newRole }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAddErrors(json.errors ?? { phone: json.error ?? "Нэмэхэд алдаа гарлаа" });
        return;
      }
      setUsers((us) => [json.user, ...us]);
      setNewPhone("");
      setNewPassword("");
      setNewRole("student");
      setAddOpen(false);
    } catch {
      setAddErrors({ phone: "Сүлжээний алдаа гарлаа. Дахин оролдоно уу." });
    } finally {
      setAdding(false);
    }
  };

  const schools = useMemo(
    // compareMn, not localeCompare: this list is rendered on both sides and
    // the two collators disagree (see lib/sortMn.ts).
    () => [...new Set(users.map((u) => u.school).filter(Boolean))].sort(compareMn),
    [users]
  );

  const grades = useMemo(
    () => [...new Set(users.map((u) => u.grade).filter((g): g is string => Boolean(g)))].sort(compareMn),
    [users]
  );

  /** Per user: how many courses they are on, and what they still owe. */
  const stats = useMemo(() => {
    const paidByRegistration = new Map<string, number>();
    for (const payment of payments) {
      paidByRegistration.set(
        payment.registrationId,
        (paidByRegistration.get(payment.registrationId) ?? 0) + payment.amount
      );
    }

    const byUser = new Map<string, { active: number; total: number; balance: number }>();
    for (const registration of registrations) {
      if (!registration.user) continue;
      const entry = byUser.get(registration.user.id) ?? { active: 0, total: 0, balance: 0 };
      // Cancelled registrations count towards nothing — not a seat, not a debt.
      if (registration.status !== "cancelled") {
        entry.total += 1;
        if (registration.status === "active") entry.active += 1;
        entry.balance += registrationBalance(
          registration,
          paidByRegistration.get(registration.id) ?? 0
        ).balance;
      }
      byUser.set(registration.user.id, entry);
    }
    return byUser;
  }, [registrations, payments]);

  const statsFor = (userId: string) => stats.get(userId) ?? { active: 0, total: 0, balance: 0 };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = users.filter((u) => {
      if (needle) {
        const haystack = `${u.lastName} ${u.firstName} ${u.phone} ${u.email}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (school && u.school !== school) return false;
      if (grade && u.grade !== grade) return false;
      if (role && u.role !== role) return false;

      const { active, balance } = statsFor(u.id);
      if (enrolment === "active" && active === 0) return false;
      if (enrolment === "none" && active > 0) return false;
      if (enrolment === "owing" && balance <= 0) return false;
      return true;
    });

    const seen = (id: string) => new Date(lastLogin[id] ?? 0).getTime();
    return [...matched].sort((a, b) => {
      if (sort === "name") return compareMn(`${a.lastName} ${a.firstName}`, `${b.lastName} ${b.firstName}`);
      if (sort === "owing") return statsFor(b.id).balance - statsFor(a.id).balance;
      if (sort === "seen") return seen(b.id) - seen(a.id);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, query, school, grade, role, enrolment, sort, stats, lastLogin]);

  const owingCount = useMemo(
    // Test accounts owe nothing the school will ever collect.
    () => filtered.filter((u) => !u.isTest && statsFor(u.id).balance > 0).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, stats]
  );

  /** The filtered list as a spreadsheet — what the admin would otherwise retype. */
  const downloadCsv = () => {
    const header = ["Овог", "Нэр", "Төрөл", "Утас", "Имэйл", "Аймаг/Хот", "Сум/Дүүрэг", "Сургууль", "Анги", "Идэвхтэй сургалт", "Үлдэгдэл", "Бүртгүүлсэн", "Сүүлд нэвтэрсэн"];
    const rows = filtered.map((u) => {
      const { active, balance } = statsFor(u.id);
      return [
        u.lastName, u.firstName, u.role === "teacher" ? "Багш" : "Сурагч", u.phone, u.email,
        u.province, u.district, u.school, u.grade, String(active), String(balance),
        u.createdAt.slice(0, 10), (lastLogin[u.id] ?? "").slice(0, 10),
      ];
    });
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    // BOM so Excel opens Cyrillic correctly rather than as mojibake.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `khereglegch-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[1.15rem] font-extrabold">
            Хэрэглэгч ({filtered.length}
            {filtered.length !== users.length && ` / ${users.length}`})
          </h2>
          {owingCount > 0 && (
            <span className="text-[.85rem] font-bold text-gold-strong">
              {owingCount} хүн төлбөрийн үлдэгдэлтэй
            </span>
          )}
        </div>
        {canEdit && !addOpen && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2 rounded-full"
          >
            + Хэрэглэгч нэмэх
          </button>
        )}
      </div>

      {canEdit && addOpen && (
        <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 mb-4">
          <h3 className="font-extrabold text-[.95rem] mb-1">Хэрэглэгч гараар нэмэх</h3>
          <p className="text-ink-3 font-semibold text-[.85rem] mb-3">
            OTP баталгаажуулалтгүйгээр шууд бүртгэнэ. Хэрэглэгч эдгээр дугаар, нууц үгээр нэвтэрч орж,
            Профайл хэсгээсээ дутуу мэдээллээ (нэр, имэйл, сургууль гэх мэт) засах шаардлагатай.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Утасны дугаар</span>
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="99XXXXXX"
                className={INPUT_CLASS}
              />
              {addErrors.phone && <span className="text-[.78rem] font-semibold text-red-soft">{addErrors.phone}</span>}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Нууц үг</span>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Том, жижиг үсэг, тоо, 6+ тэмдэгт"
                className={INPUT_CLASS}
              />
              {addErrors.password && (
                <span className="text-[.78rem] font-semibold text-red-soft">{addErrors.password}</span>
              )}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Төрөл</span>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as "student" | "teacher")} className={INPUT_CLASS}>
                <option value="student">Сурагч</option>
                <option value="teacher">Багш</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2.5 mt-3.5">
            <button
              type="button"
              disabled={adding}
              onClick={addUser}
              className="text-[.85rem] font-extrabold text-white bg-blue px-5 py-2.5 rounded-full disabled:opacity-50"
            >
              {adding ? "Нэмж байна…" : "Нэмэх"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setAddErrors({});
              }}
              className="text-[.85rem] font-extrabold text-ink-2 bg-surface-2 px-5 py-2.5 rounded-full"
            >
              Цуцлах
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 mb-4">
        <div className="grid grid-cols-1 nav:grid-cols-6 gap-3">
          <input
            type="text"
            placeholder="Нэр, утас, имэйлээр хайх"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${INPUT_CLASS} nav:col-span-2`}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "" | "teacher" | "student")}
            className={INPUT_CLASS}
          >
            <option value="">Бүх төрөл</option>
            <option value="student">Сурагч</option>
            <option value="teacher">Багш</option>
          </select>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className={INPUT_CLASS}>
            <option value="">Бүх анги</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select value={school} onChange={(e) => setSchool(e.target.value)} className={INPUT_CLASS}>
            <option value="">Бүх сургууль</option>
            {schools.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={enrolment}
            onChange={(e) => setEnrolment(e.target.value as "" | "active" | "none" | "owing")}
            className={INPUT_CLASS}
          >
            <option value="">Бүгд</option>
            <option value="active">Сургалттай</option>
            <option value="none">Сургалтгүй</option>
            <option value="owing">Үлдэгдэлтэй</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[.8rem] font-extrabold text-ink-3">Эрэмбэ:</span>
            {(
              [
                ["newest", "Шинэ нь эхэндээ"],
                ["name", "Нэрээр"],
                ["owing", "Үлдэгдэл ихээр"],
                ["seen", "Сүүлд нэвтэрсэн"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSort(value)}
                className={`text-[.82rem] font-extrabold px-3.5 py-1.5 rounded-full transition-colors ${
                  sort === value ? "bg-blue text-white" : "bg-bg-soft text-ink-2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {(query || school || grade || role || enrolment) && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSchool("");
                  setGrade("");
                  setRole("");
                  setEnrolment("");
                }}
                className="text-[.82rem] font-extrabold text-ink-3"
              >
                Шүүлтүүр цэвэрлэх
              </button>
            )}
            <button
              type="button"
              onClick={downloadCsv}
              className="text-[.82rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-1.5 rounded-full"
            >
              Excel-д татах
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-ink-3 font-semibold text-[.9rem] text-center py-10">Тохирох хэрэглэгч алга байна.</p>
      ) : (
        <div className="bg-surface border border-line rounded-md shadow-xs overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[860px]">
            <thead>
              <tr className="text-ink-3 text-[.76rem] font-extrabold tracking-[.05em] uppercase">
                <th className="px-4 py-3">Нэр</th>
                <th className="px-4 py-3">Төрөл</th>
                <th className="px-4 py-3">Утас</th>
                <th className="px-4 py-3">Анги</th>
                <th className="px-4 py-3">Сургууль</th>
                <th className="px-4 py-3">Сургалт</th>
                <th className="px-4 py-3">Үлдэгдэл</th>
                <th className="px-4 py-3">Сүүлд нэвтэрсэн</th>
                <th className="px-4 py-3">Бүртгүүлсэн</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => router.push(`/admin/users/${u.id}`)}
                  className="border-t border-line cursor-pointer hover:bg-bg-soft transition-colors"
                >
                  <td className="px-4 py-3 font-extrabold text-[.9rem]">
                    {u.lastName || u.firstName ? `${u.lastName} ${u.firstName}` : (
                      <span className="text-ink-3 font-semibold">Мэдээлэл дутуу</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[.7rem] font-extrabold px-2 py-0.5 rounded-full ${
                        u.role === "teacher" ? "text-gold-strong bg-gold-soft" : "text-blue-strong bg-blue-soft"
                      }`}
                    >
                      {u.role === "teacher" ? "Багш" : "Сурагч"}
                    </span>
                    {u.isTest && (
                      <span className="ml-1.5 text-[.7rem] font-extrabold px-2 py-0.5 rounded-full text-gold-strong bg-gold-soft">
                        Тест
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{u.phone}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{u.grade || "—"}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{u.school || "—"}</td>
                  <td className="px-4 py-3 font-extrabold text-[.88rem] tabular-nums">
                    {(() => {
                      const { active, total } = statsFor(u.id);
                      if (total === 0) return <span className="text-ink-3 font-semibold">—</span>;
                      return (
                        <span className={active > 0 ? "text-green" : "text-gold-strong"}>
                          {active}
                          {total !== active && <span className="text-ink-3"> / {total}</span>}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 font-extrabold text-[.88rem] tabular-nums">
                    {(() => {
                      const { balance, total } = statsFor(u.id);
                      if (total === 0) return <span className="text-ink-3 font-semibold">—</span>;
                      return balance > 0 ? (
                        <span className="text-gold-strong">{formatMnt(balance)}</span>
                      ) : (
                        <span className="text-green">Төлсөн</span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2 whitespace-nowrap">
                    {lastLogin[u.id] ? formatDate(lastLogin[u.id]) : <span className="text-ink-3">Ороогүй</span>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-3 whitespace-nowrap">
                    {formatDate(u.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
