"use client";

import { useState } from "react";
import type { PublicUser, Registration } from "@/lib/db";
import { IconCheckCircle, IconClock, IconClose } from "@/components/icons";
import { payMethodLabel } from "@/lib/registration";

type RegistrationWithUser = Registration & { user?: PublicUser };

const PHONE_RE = /^[0-9]{8}$/;

/**
 * The roster for one course/yearly program — the read-only table plus admin
 * controls to add someone by phone (found account or not — see
 * addManualRegistration()/linkPendingRegistrationsToUser() in lib/db.ts for
 * how a phone-only row later attaches itself) and to remove a registration
 * outright. Shared between CourseObjectPage and YearlyProgramObjectPage.
 */
export default function RegistrationRoster({
  programId,
  registrations,
  onChange,
}: {
  programId: string;
  registrations: RegistrationWithUser[];
  onChange: (registrations: RegistrationWithUser[]) => void;
}) {
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<{ status: "loading" | "done" | "error"; user?: PublicUser | null } | null>(
    null
  );
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const search = async () => {
    if (!PHONE_RE.test(phone)) return;
    setAddError(null);
    setLookup({ status: "loading" });
    try {
      const res = await fetch(`/api/admin/users/lookup?phone=${encodeURIComponent(phone)}`);
      const json = await res.json();
      if (!res.ok) {
        setLookup({ status: "error" });
        return;
      }
      setLookup({ status: "done", user: json.user });
    } catch {
      setLookup({ status: "error" });
    }
  };

  const add = async () => {
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/admin/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, phone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAddError(json.error ?? "Нэмэхэд алдаа гарлаа");
        return;
      }
      onChange([{ ...json.registration, user: lookup?.user ?? undefined }, ...registrations]);
      setPhone("");
      setLookup(null);
    } catch {
      setAddError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Энэ бүртгэлийг хасах уу? Энэ үйлдлийг буцаах боломжгүй.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}`, { method: "DELETE" });
      if (res.ok) {
        onChange(registrations.filter((r) => r.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-bg-soft rounded-md p-4">
        <b className="font-extrabold text-[.9rem] block mb-2.5">Утасны дугаараар бүртгэл нэмэх</b>
        <div className="flex gap-2 flex-wrap">
          <input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/\D/g, "").slice(0, 8));
              setLookup(null);
              setAddError(null);
            }}
            placeholder="99XXXXXX"
            className="flex-1 min-w-[160px] px-3.5 py-2.5 rounded-xs border-[1.5px] border-line-2 bg-surface text-ink font-semibold text-[.9rem] focus:outline-none focus:border-blue"
          />
          <button
            type="button"
            disabled={!PHONE_RE.test(phone) || lookup?.status === "loading"}
            onClick={search}
            className="text-[.85rem] font-extrabold text-ink-2 bg-surface-2 px-4 py-2.5 rounded-full disabled:opacity-50"
          >
            {lookup?.status === "loading" ? "…" : "Хайх"}
          </button>
        </div>

        {lookup?.status === "error" && (
          <p className="text-[.82rem] font-semibold text-red-soft mt-2.5">Хайхад алдаа гарлаа. Дахин оролдоно уу.</p>
        )}

        {lookup?.status === "done" && (
          <div className="flex items-center justify-between gap-3 flex-wrap mt-3 bg-surface rounded-sm px-3.5 py-3">
            {lookup.user ? (
              <span className="font-bold text-[.88rem] text-ink">
                {lookup.user.lastName} {lookup.user.firstName} · {lookup.user.school}
              </span>
            ) : (
              <span className="font-bold text-[.88rem] text-ink-3">
                Бүртгэлгүй утас — данс үүсэхэд автоматаар холбогдоно
              </span>
            )}
            <button
              type="button"
              disabled={adding}
              onClick={add}
              className="text-[.82rem] font-extrabold text-white bg-blue rounded-full px-4 py-2 disabled:opacity-50"
            >
              {adding ? "…" : "Нэмэх"}
            </button>
          </div>
        )}
        {addError && <p className="text-[.82rem] font-semibold text-red-soft mt-2.5">{addError}</p>}
      </div>

      {registrations.length === 0 ? (
        <p className="text-ink-3 font-semibold text-[.9rem]">Одоогоор бүртгэл алга байна.</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-left border-collapse min-w-[620px]">
            <thead>
              <tr className="text-ink-3 text-[.76rem] font-extrabold tracking-[.05em] uppercase">
                <th className="px-2 py-2">Сурагч</th>
                <th className="px-2 py-2">Утас</th>
                <th className="px-2 py-2">Огноо</th>
                <th className="px-2 py-2">Төлөв</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {registrations.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-2 py-3 font-extrabold text-[.9rem]">
                    {r.user
                      ? `${r.user.lastName} ${r.user.firstName}`
                      : r.phone
                        ? "Бүртгэл хүлээгдэж буй"
                        : "Хэрэглэгч устсан"}
                  </td>
                  <td className="px-2 py-3 font-semibold text-[.88rem] text-ink-2">
                    {r.user?.phone ?? r.phone ?? "—"}
                  </td>
                  <td className="px-2 py-3 font-semibold text-[.88rem] text-ink-2">
                    {new Date(r.createdAt).toLocaleDateString("mn-MN")}
                    <span className="text-ink-3"> · {payMethodLabel(r.payMethod)}</span>
                  </td>
                  <td className="px-2 py-3">
                    {r.status === "active" ? (
                      <span className="inline-flex items-center gap-1.5 text-[.78rem] font-extrabold text-green bg-green-soft px-2.5 py-1 rounded-full">
                        <IconCheckCircle className="w-3 h-3" /> Идэвхтэй
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[.78rem] font-extrabold text-gold-strong bg-gold-soft px-2.5 py-1 rounded-full">
                        <IconClock className="w-3 h-3" /> Хүлээгдэж буй
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => remove(r.id)}
                      aria-label="Хасах"
                      className="w-7 h-7 rounded-full bg-surface border border-line-2 grid place-items-center disabled:opacity-50"
                    >
                      <IconClose className="w-3 h-3 text-ink-3" />
                    </button>
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
