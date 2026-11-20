"use client";

import { useState } from "react";
import { IconBank, IconCheck, IconClock, IconClose, IconQrCode } from "@/components/icons";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { ubDay } from "@/lib/dateFormat";
import { apiError, readJson } from "@/lib/fetchJson";
import type { RegistrationPayment } from "@/lib/db";
import type { RegistrationPaymentIntent } from "@/lib/paymentIntents";

type Reply = {
  paid?: boolean;
  intent?: RegistrationPaymentIntent;
  payments?: RegistrationPayment[];
};

/**
 * What an admin may do with a balance payment a family started from their
 * profile («Үлдэгдэл төлөх»). The same answers PendingRegistrationActions
 * gives a pending registration, because the admin's job is the same one:
 *
 *   · **bank** — the family only said they transferred. «Баталгаажуулах» books
 *     the amount and date the admin reads off the statement, never the
 *     family's own word.
 *   · **qpay** — QPay is the authority, so «QPay шалгах» books it only on
 *     QPay's answer. «Дансаар төлсөн» is the family who ignored the QR and
 *     transferred instead; the server voids the invoice before booking, so
 *     the QR left in their history cannot take the money a second time.
 *   · «Цуцлах» — the family never paid. A QPay one is checked with QPay
 *     first, so money that did arrive is booked instead of dropped.
 */
export default function PendingIntentActions({
  intent,
  onDone,
}: {
  intent: RegistrationPaymentIntent;
  /**
   * Called after the payment changed, with what changed and — when money was
   * booked — the registration's payments, so the list redraws «paid / due».
   */
  onDone: (patch: Partial<RegistrationPaymentIntent>, payments?: RegistrationPayment[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");

  // A QPay row whose invoice was never created has nothing to ask QPay about;
  // it is confirmed like a bank one.
  const isQpay = intent.method === "qpay" && Boolean(intent.qpayInvoiceId);

  const run = async (url: string, body?: unknown): Promise<{ ok: boolean; json: Partial<Reply> } | null> => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const json = await readJson<Reply>(res);
      if (!res.ok && json.paid) {
        // QPay had collected after all, and the server booked it on the way.
        // The card turns «Төлөгдсөн», so say why before it does.
        alert(apiError(res, json));
        onDone({ status: "paid" }, json.payments);
        return null;
      }
      if (!res.ok) {
        setError(apiError(res, json, "Үйлдэл гүйцэтгэхэд алдаа гарлаа"));
        return null;
      }
      return { ok: true, json };
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const openForm = () => {
    const next = !formOpen;
    if (next) {
      // The family's figure and the day they announced it — usually the day
      // they transferred. Only a starting point: the statement has the last word.
      if (!amount) setAmount(String(intent.amount));
      if (!paidAt) setPaidAt(ubDay(intent.createdAt));
    }
    setFormOpen(next);
  };

  const askQpay = async () => {
    const done = await run(`/api/admin/payment-intents/${intent.id}/qpay-check`);
    if (!done) return;
    if (done.json.paid) onDone(done.json.intent ?? { status: "paid" }, done.json.payments);
    else setNote("QPay дээр төлбөр бүртгэгдээгүй байна. Дансаар шилжүүлсэн бол «Дансаар төлсөн»-өөр баталгаажуулна уу.");
  };

  const confirm = async () => {
    const digits = amount.replace(/[^\d]/g, "");
    if (!digits || Number(digits) <= 0) {
      setError("Орсон дүнг оруулна уу");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      setError("Орсон огноог оруулна уу");
      return;
    }
    const done = await run(`/api/admin/payment-intents/${intent.id}/confirm`, {
      amount: Number(digits),
      paidAt,
    });
    if (!done) return;
    setFormOpen(false);
    onDone(done.json.intent ?? { status: "paid", method: "bank" }, done.json.payments);
  };

  const cancel = async () => {
    const question = isQpay
      ? "Энэ төлөлтийг цуцлах уу? QPay-ийн нэхэмжлэх хүчингүй болж, төлөлт «Цуцалсан» болно."
      : "Энэ төлөлтийг цуцлах уу? Төлбөр бүртгэгдэхгүй бөгөөд төлөлт «Цуцалсан» болно.";
    if (!window.confirm(question)) return;
    const done = await run(`/api/admin/payment-intents/${intent.id}/cancel`);
    if (done) onDone(done.json.intent ?? { status: "cancelled" });
  };

  const secondary =
    "inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-ink-2 bg-bg-soft px-4 py-2 rounded-full disabled:opacity-50";
  const primary =
    "inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-white bg-gold-strong px-4 py-2 rounded-full disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-2 min-w-0">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button type="button" disabled={busy} onClick={cancel} className={secondary}>
          <IconClose className="w-3.5 h-3.5" /> Цуцлах
        </button>
        {isQpay ? (
          <>
            <button type="button" disabled={busy} onClick={askQpay} className={primary}>
              <IconQrCode className="w-3.5 h-3.5" /> {busy ? "…" : "QPay шалгах"}
            </button>
            <button type="button" disabled={busy} onClick={openForm} className={secondary}>
              <IconBank className="w-3.5 h-3.5" /> Дансаар төлсөн
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={openForm} className={primary}>
            <IconClock className="w-3.5 h-3.5" /> Баталгаажуулах
          </button>
        )}
      </div>

      {note && <span className="text-[.8rem] font-semibold text-ink-3 text-right max-w-[46ch]">{note}</span>}
      {error && <span className="text-[.8rem] font-semibold text-red-soft text-right max-w-[46ch]">{error}</span>}

      {formOpen && (
        <div className="w-full max-w-[420px] bg-surface border border-line rounded-md px-4 py-3.5 mt-1">
          <p className="text-[.82rem] font-semibold text-ink-3 leading-[1.5]">
            {isQpay
              ? "Банкны хуулгаа шалгаад, орсон дүн, огноог бичнэ үү. QPay-ийн нэхэмжлэх цуцлагдаж, төлөлт дансаар орсон гэж бүртгэгдэнэ."
              : "Банкны хуулгаас орсон дүн, огноог шалгаад бичнэ үү. Гэр бүлийн мэдэгдсэн дүн, өдрийг урьдчилан бөглөсөн."}
          </p>
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Дүн, ж: 600000"
              inputMode="numeric"
              className={INPUT_CLASS}
            />
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={INPUT_CLASS} />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={confirm}
            className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-white bg-green px-4 py-2 rounded-full mt-3 disabled:opacity-50"
          >
            <IconCheck className="w-3.5 h-3.5" /> {busy ? "…" : "Баталгаажуулах"}
          </button>
        </div>
      )}
    </div>
  );
}
