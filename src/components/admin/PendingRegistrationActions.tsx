"use client";

import { useState } from "react";
import { IconBank, IconCheck, IconClock, IconQrCode } from "@/components/icons";
import { INPUT_CLASS } from "@/components/admin/panels/shared";
import { apiError, readJson } from "@/lib/fetchJson";
import { splitHalves } from "@/lib/installment";
import { parsePriceToNumber } from "@/lib/price";
import type { Registration, RegistrationPayment } from "@/lib/db";

/**
 * What an admin may do with a registration that hasn't been confirmed yet.
 *
 * The two payment methods need different answers, and the old UI gave them the
 * same one — a single "Баталгаажуулах" button on every pending row:
 *
 *   · **bank** — the admin reads their statement and confirms. The button now
 *     asks how much actually arrived: half-paid students were being confirmed
 *     with no payment record at all, so the books showed them as paid in full.
 *   · **qpay** — QPay is the authority. A row sits here because nobody paid,
 *     and confirming it by hand hands out a paid seat for free. The button is
 *     replaced by "ask QPay", which settles only on QPay's own answer.
 *
 * The exception is real and happens often: a parent picks QPay on screen, then
 * pays from their banking app using the transfer details shown next to it. The
 * money is in the account and QPay has never heard of it. "Дансаар төлсөн"
 * covers exactly that — it asks for the amount and date, records the payment,
 * rewrites the row as a bank payment, and voids the invoice so the parent's
 * leftover QR can't take a second payment later.
 *
 * Used by the registrations list and both object pages, so all three offer the
 * same actions — three hand-copied versions of a money button is how one of
 * them quietly ends up wrong.
 */
export default function PendingRegistrationActions({
  registration,
  onDone,
}: {
  registration: Registration;
  /**
   * Called after an action changed the row, with what changed. Every caller
   * keeps its own copy of the list in state, so it patches that copy — a
   * `router.refresh()` alone would leave the stale row on screen.
   */
  onDone: (patch: Partial<Registration>, payment?: RegistrationPayment) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [reference, setReference] = useState("");

  // "QPay issued an invoice for this row", not "the row says QPay". A row that
  // says bank while holding a live invoice is exactly the case that needs
  // asking QPay — the student switched options and paid the QR.
  const isQpay = registration.payMethod === "qpay" || Boolean(registration.qpayInvoiceId);

  const run = async (url: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const json = await readJson<{ paid?: boolean; payment?: RegistrationPayment }>(res);
      if (!res.ok) {
        setError(apiError(res, json, "Үйлдэл гүйцэтгэхэд алдаа гарлаа"));
        return false;
      }
      return json;
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Монголын өнөөдөр (UTC+8) — банкны хуулга ихэвчлэн тэр өдрийнх. */
  const mongoliaToday = () =>
    new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

  /**
   * Хуваан төлөх төлөвлөгөөтэй мөрөнд хагасыг, бусад дээр бүтэн үнийг санал
   * болгоно. Админ засаж болно — банкны хуулга л эцсийн үг.
   */
  const suggestedAmount = registration.totalDue
    ? splitHalves(registration.totalDue).now
    : parsePriceToNumber(registration.price);

  const openManualForm = () => {
    const next = !manualOpen;
    if (next) {
      if (!amount) setAmount(String(suggestedAmount));
      if (!paidAt) setPaidAt(mongoliaToday());
    }
    setManualOpen(next);
  };

  const askQpay = async () => {
    const json = await run(`/api/admin/registrations/${registration.id}/qpay-check`);
    if (!json) return;
    if (typeof json === "object" && json.paid) onDone({ status: "active" });
    else setNote("QPay дээр төлбөр бүртгэгдээгүй байна. Дансаараа шалгаад, доорхоор баталгаажуулж болно.");
  };

  const settleManually = async () => {
    const digits = amount.replace(/[^\d]/g, "");
    if (!digits) {
      setError("Төлсөн дүнг оруулна уу");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      setError("Төлсөн огноог оруулна уу");
      return;
    }
    const done = await run(`/api/admin/registrations/${registration.id}/settle-manual`, {
      amount: Number(digits),
      paidAt,
      reference,
    });
    // The route rewrites the row as a bank payment, so the caller's copy has to
    // stop calling it a QPay row too — otherwise it keeps showing "QPay". The
    // recorded payment goes up with it, or the roster the admin switches to
    // next would still read "0₮" for money they just entered.
    if (done) {
      setManualOpen(false);
      onDone(
        { status: "active", payMethod: "bank" },
        typeof done === "object" ? done.payment : undefined
      );
    }
  };

  return (
    <div className="flex flex-col items-end gap-2 min-w-0">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {isQpay ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={askQpay}
              className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-white bg-gold-strong px-4 py-2 rounded-full disabled:opacity-50"
            >
              <IconQrCode className="w-3.5 h-3.5" /> {busy ? "…" : "QPay-ээс шалгах"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={openManualForm}
              className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-ink-2 bg-bg-soft px-4 py-2 rounded-full disabled:opacity-50"
            >
              <IconBank className="w-3.5 h-3.5" /> Дансаар төлсөн
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={openManualForm}
            className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-white bg-gold-strong px-4 py-2 rounded-full disabled:opacity-50"
          >
            <IconClock className="w-3.5 h-3.5" /> Баталгаажуулах
          </button>
        )}
      </div>

      {note && <span className="text-[.8rem] font-semibold text-ink-3 text-right max-w-[46ch]">{note}</span>}
      {error && <span className="text-[.8rem] font-semibold text-red-soft text-right max-w-[46ch]">{error}</span>}

      {manualOpen && (
        <div className="w-full max-w-[420px] bg-surface border border-line rounded-md px-4 py-3.5 mt-1">
          <p className="text-[.82rem] font-semibold text-ink-3 leading-[1.5]">
            {isQpay
              ? "Банкны хуулгаа шалгаад, орсон дүн, огноог бичнэ үү. QPay-ийн нэхэмжлэх цуцлагдаж, бүртгэл дансаар төлсөн болж хадгалагдана."
              : "Банкны хуулгаар орсон дүнг бичнэ үү. Хуваан төлж байгаа бол одоо орсон хэсгийг нь бичнэ — үлдэгдэл нь сургалтын хуудсанд харагдана."}
          </p>
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Дүн, ж: 350000"
              inputMode="numeric"
              className={INPUT_CLASS}
            />
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={INPUT_CLASS} />
          </div>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Журнал дугаар (заавал биш)"
            className={`${INPUT_CLASS} mt-2.5`}
          />
          <button
            type="button"
            disabled={busy}
            onClick={settleManually}
            className="inline-flex items-center gap-1.5 text-[.82rem] font-extrabold text-white bg-green px-4 py-2 rounded-full mt-3 disabled:opacity-50"
          >
            <IconCheck className="w-3.5 h-3.5" /> {busy ? "…" : "Баталгаажуулах"}
          </button>
        </div>
      )}
    </div>
  );
}
