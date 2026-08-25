"use client";

import Link from "next/link";
import { formatDate } from "@/lib/dateFormat";
import { Fragment, useState } from "react";
import type { PublicUser, Registration, RegistrationPayment } from "@/lib/db";
import { IconCheckCircle, IconClock, IconClose } from "@/components/icons";
import { formatMnt } from "@/lib/price";
import { payMethodLabel } from "@/lib/registration";

type RegistrationWithUser = Registration & { user?: PublicUser };

const PHONE_RE = /^[0-9]{8}$/;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}


/**
 * The roster for one course/yearly program — the read-only table plus admin
 * controls to add someone by phone (found account or not — see
 * addManualRegistration()/linkPendingRegistrationsToUser() in lib/db.ts for
 * how a phone-only row later attaches itself) and to remove a registration
 * outright. Shared between CourseObjectPage and YearlyProgramObjectPage.
 *
 * trackPayments/payments/onPaymentsChange are only passed by
 * YearlyProgramObjectPage — installment payment tracking (agreed total vs.
 * price, since discounts vary by signup month) is a yearly-program-only
 * feature, so CourseObjectPage's call site leaves these unset and the extra
 * column simply doesn't render.
 */
export default function RegistrationRoster({
  programId,
  registrations,
  onChange,
  trackPayments,
  payments,
  onPaymentsChange,
  canEdit = true,
}: {
  programId: string;
  registrations: RegistrationWithUser[];
  onChange: (registrations: RegistrationWithUser[]) => void;
  trackPayments?: boolean;
  payments?: RegistrationPayment[];
  onPaymentsChange?: (payments: RegistrationPayment[]) => void;
  /**
   * False for the read-only admin: the roster, the balances and the payment
   * history all stay visible — only the controls that write go away. The
   * expand toggle deliberately keeps working, since collapsing the payment
   * history would hide data the account is allowed to see.
   */
  canEdit?: boolean;
}) {
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<{ status: "loading" | "done" | "error"; user?: PublicUser | null } | null>(
    null
  );
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [totalDueDraft, setTotalDueDraft] = useState<Record<string, string>>({});
  const [savingTotalDueId, setSavingTotalDueId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<Record<string, { date: string; amount: string }>>({});
  const [addingPaymentId, setAddingPaymentId] = useState<string | null>(null);
  const [removingPaymentId, setRemovingPaymentId] = useState<string | null>(null);

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

  const toggleExpand = (r: RegistrationWithUser) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(r.id)) {
        next.delete(r.id);
      } else {
        next.add(r.id);
        setTotalDueDraft((d) => ({ ...d, [r.id]: d[r.id] ?? String(r.totalDue ?? "") }));
        setPaymentForm((f) => ({ ...f, [r.id]: f[r.id] ?? { date: todayIso(), amount: "" } }));
      }
      return next;
    });
  };

  const saveTotalDue = async (id: string) => {
    const value = Number(totalDueDraft[id]);
    if (!Number.isFinite(value) || value < 0) return;
    setSavingTotalDueId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalDue: value }),
      });
      const json = await res.json();
      if (res.ok) {
        onChange(registrations.map((r) => (r.id === id ? { ...r, totalDue: value } : r)));
      }
      void json;
    } finally {
      setSavingTotalDueId(null);
    }
  };

  const addPayment = async (id: string) => {
    const form = paymentForm[id];
    const amount = Number(form?.amount);
    if (!form?.date || !Number.isFinite(amount) || amount <= 0) return;
    setAddingPaymentId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, paidAt: form.date }),
      });
      const json = await res.json();
      if (res.ok && onPaymentsChange && payments) {
        onPaymentsChange([...payments, json.payment]);
        setPaymentForm((f) => ({ ...f, [id]: { date: todayIso(), amount: "" } }));
      }
    } finally {
      setAddingPaymentId(null);
    }
  };

  const removePayment = async (registrationId: string, paymentId: string) => {
    setRemovingPaymentId(paymentId);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/payments/${paymentId}`, {
        method: "DELETE",
      });
      if (res.ok && onPaymentsChange && payments) {
        onPaymentsChange(payments.filter((p) => p.id !== paymentId));
      }
    } finally {
      setRemovingPaymentId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
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
      )}

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
                {trackPayments && <th className="px-2 py-2">Төлбөр</th>}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {registrations.map((r) => {
                const regPayments = trackPayments
                  ? (payments ?? [])
                      .filter((p) => p.registrationId === r.id)
                      .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
                  : [];
                const paidSum = regPayments.reduce((sum, p) => sum + p.amount, 0);
                const balance = (r.totalDue ?? 0) - paidSum;
                const expanded = expandedIds.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t border-line">
                      <td className="px-2 py-3 font-extrabold text-[.9rem]">
                        {r.user ? (
                          <Link href={`/admin/users/${r.user.id}`} className="hover:text-blue-strong hover:underline">
                            {r.user.lastName} {r.user.firstName}
                          </Link>
                        ) : r.phone ? (
                          "Бүртгэл хүлээгдэж буй"
                        ) : (
                          "Хэрэглэгч устсан"
                        )}
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
                        ) : r.status === "cancelled" ? (
                          <span className="inline-flex items-center gap-1.5 text-[.78rem] font-extrabold text-ink-3 bg-bg-soft px-2.5 py-1 rounded-full">
                            Цуцалсан
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[.78rem] font-extrabold text-gold-strong bg-gold-soft px-2.5 py-1 rounded-full">
                            <IconClock className="w-3 h-3" /> Хүлээгдэж буй
                          </span>
                        )}
                      </td>
                      {trackPayments && (
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            onClick={() => toggleExpand(r)}
                            className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold"
                          >
                            {r.totalDue != null ? (
                              <span className={balance <= 0 ? "text-green" : "text-gold-strong"}>
                                Үлдэгдэл {formatMnt(balance)}
                                {/* The date the family promised the rest for —
                                    the reason most balances here exist. */}
                                {balance > 0 && r.installmentDueDate
                                  ? ` · ${r.installmentDueDate.replaceAll("-", ".")}`
                                  : ""}
                              </span>
                            ) : (
                              <span className="text-ink-3 font-semibold">Дүн тохируулаагүй</span>
                            )}
                            <span className="text-ink-3 text-[.7rem]">{expanded ? "▲" : "▼"}</span>
                          </button>
                        </td>
                      )}
                      <td className="px-2 py-3 text-right">
                        {canEdit && (
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => remove(r.id)}
                            aria-label="Хасах"
                            className="w-7 h-7 rounded-full bg-surface border border-line-2 grid place-items-center disabled:opacity-50"
                          >
                            <IconClose className="w-3 h-3 text-ink-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {trackPayments && expanded && (
                      <tr className="border-t border-line">
                        <td colSpan={6} className="px-2 py-4 bg-bg-soft">
                          {canEdit && (
                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 items-end max-w-[420px]">
                            <label className="flex flex-col gap-1.5">
                              <span className="text-[.78rem] font-extrabold text-ink-3">Төлөх дүн</span>
                              <input
                                type="number"
                                min={0}
                                value={totalDueDraft[r.id] ?? ""}
                                onChange={(e) => setTotalDueDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                                placeholder="2,240,000"
                                className="px-3 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface text-ink font-semibold text-[.88rem] focus:outline-none focus:border-blue"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={savingTotalDueId === r.id}
                              onClick={() => saveTotalDue(r.id)}
                              className="text-[.82rem] font-extrabold text-white bg-blue rounded-full px-4 py-2 disabled:opacity-50 h-fit"
                            >
                              {savingTotalDueId === r.id ? "…" : "Хадгалах"}
                            </button>
                          </div>
                          )}

                          {regPayments.length > 0 && (
                            <div className="grid grid-cols-[1fr_1fr_auto] gap-x-4 gap-y-1.5 max-w-[420px] mt-4">
                              <span className="text-[.76rem] font-extrabold text-ink-3 uppercase tracking-[.05em]">Огноо</span>
                              <span className="text-[.76rem] font-extrabold text-ink-3 uppercase tracking-[.05em]">Дүн</span>
                              <span />
                              {regPayments.map((p) => (
                                <Fragment key={p.id}>
                                  <span className="text-[.88rem] font-semibold">{formatDate(p.paidAt)}</span>
                                  <span className="text-[.88rem] font-extrabold">{formatMnt(p.amount)}</span>
                                  {canEdit ? (
                                    <button
                                      type="button"
                                      disabled={removingPaymentId === p.id}
                                      onClick={() => removePayment(r.id, p.id)}
                                      aria-label="Төлбөр хасах"
                                      className="w-5 h-5 rounded-full bg-surface border border-line-2 grid place-items-center disabled:opacity-50 justify-self-start"
                                    >
                                      <IconClose className="w-2.5 h-2.5 text-ink-3" />
                                    </button>
                                  ) : (
                                    <span />
                                  )}
                                </Fragment>
                              ))}
                            </div>
                          )}

                          {canEdit && (
                          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2.5 items-end max-w-[520px] mt-4">
                            <label className="flex flex-col gap-1.5">
                              <span className="text-[.78rem] font-extrabold text-ink-3">Төлсөн огноо</span>
                              <input
                                type="date"
                                value={paymentForm[r.id]?.date ?? todayIso()}
                                onChange={(e) =>
                                  setPaymentForm((f) => ({ ...f, [r.id]: { date: e.target.value, amount: f[r.id]?.amount ?? "" } }))
                                }
                                className="px-3 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface text-ink font-semibold text-[.88rem] focus:outline-none focus:border-blue"
                              />
                            </label>
                            <label className="flex flex-col gap-1.5">
                              <span className="text-[.78rem] font-extrabold text-ink-3">Төлсөн дүн</span>
                              <input
                                type="number"
                                min={0}
                                value={paymentForm[r.id]?.amount ?? ""}
                                onChange={(e) =>
                                  setPaymentForm((f) => ({ ...f, [r.id]: { date: f[r.id]?.date ?? todayIso(), amount: e.target.value } }))
                                }
                                placeholder="500,000"
                                className="px-3 py-2 rounded-xs border-[1.5px] border-line-2 bg-surface text-ink font-semibold text-[.88rem] focus:outline-none focus:border-blue"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={addingPaymentId === r.id}
                              onClick={() => addPayment(r.id)}
                              className="text-[.82rem] font-extrabold text-white bg-blue rounded-full px-4 py-2 disabled:opacity-50 h-fit"
                            >
                              {addingPaymentId === r.id ? "…" : "Төлбөр нэмэх"}
                            </button>
                          </div>
                          )}

                          <p className="text-[.85rem] font-bold text-ink-2 mt-4">
                            Нийт төлсөн {formatMnt(paidSum)}
                            {r.totalDue != null && (
                              <>
                                {" "}
                                · Үлдэгдэл{" "}
                                <span className={balance <= 0 ? "text-green" : "text-gold-strong"}>{formatMnt(balance)}</span>
                              </>
                            )}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
