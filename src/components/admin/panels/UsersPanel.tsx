"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { PublicUser, Registration } from "@/lib/db";
import { FILTER_INPUT_CLASS } from "@/components/admin/panels/shared";

type RegistrationWithUser = Registration & { user?: PublicUser };


export default function UsersPanel({
  initialUsers,
  registrations,
}: {
  initialUsers: PublicUser[];
  registrations: RegistrationWithUser[];
}) {
  const router = useRouter();
  // Owned here now that the tab is a standalone route — the old dashboard
  // parent used to hold this state and pass the setter down.
  const [users, setUsers] = useState(initialUsers);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [school, setSchool] = useState("");
  const [role, setRole] = useState<"" | "teacher" | "student">("");

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
    () => [...new Set(users.map((u) => u.school).filter(Boolean))].sort((a, b) => a.localeCompare(b, "mn")),
    [users]
  );

  const regCountByUser = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of registrations) {
      if (!r.user) continue;
      counts.set(r.user.id, (counts.get(r.user.id) ?? 0) + 1);
    }
    return counts;
  }, [registrations]);

  const filtered = useMemo(() => {
    const nameQuery = name.trim().toLowerCase();
    const phoneQuery = phone.trim().toLowerCase();
    const emailQuery = email.trim().toLowerCase();
    return users.filter((u) => {
      if (nameQuery && !`${u.lastName} ${u.firstName}`.toLowerCase().includes(nameQuery)) return false;
      if (phoneQuery && !u.phone.toLowerCase().includes(phoneQuery)) return false;
      if (emailQuery && !u.email.toLowerCase().includes(emailQuery)) return false;
      if (school && u.school !== school) return false;
      if (role && u.role !== role) return false;
      return true;
    });
  }, [users, name, phone, email, school, role]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-[1.15rem] font-extrabold">
          Хэрэглэгчид ({filtered.length}
          {filtered.length !== users.length && ` / ${users.length}`})
        </h2>
        {!addOpen && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="text-[.85rem] font-extrabold text-blue-strong bg-blue-soft px-4 py-2 rounded-full"
          >
            + Хэрэглэгч нэмэх
          </button>
        )}
      </div>

      {addOpen && (
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
                className={FILTER_INPUT_CLASS}
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
                className={FILTER_INPUT_CLASS}
              />
              {addErrors.password && (
                <span className="text-[.78rem] font-semibold text-red-soft">{addErrors.password}</span>
              )}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[.8rem] font-extrabold text-ink-3">Төрөл</span>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as "student" | "teacher")} className={FILTER_INPUT_CLASS}>
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

      <div className="bg-surface border border-line rounded-md shadow-xs px-5 py-4 mb-4 grid grid-cols-1 nav:grid-cols-5 gap-3">
        <input
          type="text"
          placeholder="Нэрээр хайх"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FILTER_INPUT_CLASS}
        />
        <input
          type="text"
          placeholder="Утасны дугаараар хайх"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={FILTER_INPUT_CLASS}
        />
        <input
          type="text"
          placeholder="Имэйлээр хайх"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FILTER_INPUT_CLASS}
        />
        <select value={school} onChange={(e) => setSchool(e.target.value)} className={FILTER_INPUT_CLASS}>
          <option value="">Бүх сургууль</option>
          {schools.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "" | "teacher" | "student")}
          className={FILTER_INPUT_CLASS}
        >
          <option value="">Бүх төрөл</option>
          <option value="student">Сурагч</option>
          <option value="teacher">Багш</option>
        </select>
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
                <th className="px-4 py-3">Имэйл</th>
                <th className="px-4 py-3">Байршил</th>
                <th className="px-4 py-3">Сургууль</th>
                <th className="px-4 py-3">Анги</th>
                <th className="px-4 py-3">Бүртгэл</th>
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
                  </td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{u.phone}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{u.email}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">
                    {u.province || u.district ? [u.province, u.district].filter(Boolean).join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{u.school || "—"}</td>
                  <td className="px-4 py-3 font-semibold text-[.88rem] text-ink-2">{u.grade || "—"}</td>
                  <td className="px-4 py-3 font-extrabold text-[.88rem]">{regCountByUser.get(u.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
