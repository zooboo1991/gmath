"use client";

import { useState } from "react";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { apiError, readJson } from "@/lib/fetchJson";
import type { AdminUser } from "@/lib/adminUsers";
import type { AdminRole } from "@/lib/adminSections";

const ROLE_LABEL: Record<AdminRole, string> = {
  full: "Бүрэн эрх",
  teacher: "Багш",
  viewer: "Зөвхөн харах",
};

const ROLE_TEXT: Record<AdminRole, string> = {
  full: "Бүх зүйл — төлбөр, үнэ, бүртгэл, тохиргоо.",
  teacher: "Ирц бүртгэх, үнэлгээ оруулах, хичээлийн бичлэг/тэмдэглэл нэмэх. Төлбөрт хүрэхгүй.",
  viewer: "Зөвхөн харна, юу ч өөрчлөхгүй.",
};

/**
 * Named admin accounts.
 *
 * The environment password is not listed here and cannot be: it lives in
 * Vercel, has no row, and is the way back in if everything on this page is
 * misconfigured. That is the point of it.
 */
export default function StaffPanel({ initialStaff }: { initialStaff: AdminUser[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("teacher");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password, role }),
      });
      const json = await readJson<{ staff: AdminUser }>(res);
      if (!res.ok || !json.staff) {
        setError(apiError(res, json, "Үүсгэхэд алдаа гарлаа"));
        return;
      }
      setStaff((s) => [json.staff!, ...s]);
      setMessage(`${json.staff.name} — нэвтрэх нэр "${json.staff.username}"`);
      setName("");
      setUsername("");
      setPassword("");
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, note?: string) => {
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/admin/staff/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await readJson<{ staff: AdminUser }>(res);
    if (!res.ok || !json.staff) {
      setError(apiError(res, json, "Хадгалахад алдаа гарлаа"));
      return;
    }
    setStaff((s) => s.map((u) => (u.id === id ? json.staff! : u)));
    if (note) setMessage(note);
  };

  const remove = async (user: AdminUser) => {
    if (!confirm(`${user.name}-ийн эрхийг устгах уу?`)) return;
    const res = await fetch(`/api/admin/staff/${user.id}`, { method: "DELETE" });
    const json = await readJson<Record<string, unknown>>(res);
    if (!res.ok) {
      setError(apiError(res, json, "Устгахад алдаа гарлаа"));
      return;
    }
    setStaff((s) => s.filter((u) => u.id !== user.id));
  };

  const resetPassword = async (user: AdminUser) => {
    const next = prompt(`${user.name}-ийн шинэ нууц үг (дор хаяж 8 тэмдэгт):`);
    if (!next) return;
    await patch(user.id, { password: next }, `${user.name}-ийн нууц үг шинэчлэгдлээ`);
  };

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[900px]">
      <h1 className="text-[1.4rem] font-extrabold tracking-[-.02em]">Эрх, аккаунтууд</h1>
      <p className="text-ink-3 font-semibold text-[.88rem] mt-1 mb-6">
        Багш нар өөрийн нэвтрэх нэр, нууц үгээр админ хэсэгт орж ирц бүртгэх, үнэлгээ оруулах
        боломжтой. Хийсэн үйлдэл нь <b className="text-ink-2">Түүх</b> хэсэгт нэрээрээ бүртгэгдэнэ.
      </p>

      {error && (
        <p className="bg-[oklch(0.97_0.03_25)] text-red-soft font-semibold text-[.9rem] rounded-md px-4 py-3 mb-4">
          {error}
        </p>
      )}
      {message && <p className="text-green font-extrabold text-[.9rem] mb-4">✓ {message}</p>}

      <div className="card-flat px-[22px] py-[20px] mb-6">
        <b className="text-[1.02rem] font-extrabold block mb-3">Шинэ аккаунт</b>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Нэр</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Б.Батчимэг"
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Нэвтрэх нэр (латинаар)</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="batchimeg"
              autoComplete="off"
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Нууц үг</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="дор хаяж 8 тэмдэгт"
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[.8rem] font-extrabold text-ink-3">Эрх</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className={INPUT_CLASS}
            >
              <option value="teacher">Багш</option>
              <option value="viewer">Зөвхөн харах</option>
              <option value="full">Бүрэн эрх</option>
            </select>
          </label>
        </div>
        <p className="text-[.82rem] text-ink-3 font-semibold mt-2.5">{ROLE_TEXT[role]}</p>
        <button
          type="button"
          disabled={busy}
          onClick={create}
          className="font-extrabold text-[.9rem] rounded-full bg-blue text-white shadow-blue px-6 py-3 mt-3.5 disabled:opacity-50"
        >
          {busy ? "…" : "Аккаунт үүсгэх"}
        </button>
      </div>

      {staff.length === 0 ? (
        <p className="text-ink-3 font-semibold text-[.9rem] text-center py-10">
          Одоогоор нэмэлт аккаунт алга. Та Vercel дээрх нууц үгээрээ орж байна.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {staff.map((user) => (
            <div
              key={user.id}
              className="bg-surface border border-line rounded-md shadow-xs px-6 py-5 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <b className="font-extrabold text-[1.02rem]">{user.name}</b>
                  <span className="text-[.72rem] font-extrabold text-blue-strong bg-blue-soft px-2.5 py-1 rounded-full">
                    {ROLE_LABEL[user.role]}
                  </span>
                  {!user.active && (
                    <span className="text-[.72rem] font-extrabold text-ink-3 bg-bg-soft px-2.5 py-1 rounded-full">
                      Хаасан
                    </span>
                  )}
                </div>
                <span className="text-ink-3 font-semibold text-[.85rem]">
                  {user.username}
                  {user.lastLoginAt
                    ? ` · сүүлд ${new Date(user.lastLoginAt).toLocaleDateString("mn-MN")}-нд оров`
                    : " · хараахан ороогүй"}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <button
                  type="button"
                  onClick={() => resetPassword(user)}
                  className="text-[.82rem] font-extrabold text-blue-strong bg-blue-soft px-3.5 py-2 rounded-full"
                >
                  Нууц үг сольсон
                </button>
                <button
                  type="button"
                  onClick={() =>
                    patch(
                      user.id,
                      { active: !user.active },
                      user.active ? `${user.name} хаагдлаа` : `${user.name} нээгдлээ`
                    )
                  }
                  className="text-[.82rem] font-extrabold text-ink-2 bg-bg-soft px-3.5 py-2 rounded-full"
                >
                  {user.active ? "Хаах" : "Нээх"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(user)}
                  className="text-[.82rem] font-bold text-ink-3 hover:text-red-soft px-2"
                >
                  Устгах
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
