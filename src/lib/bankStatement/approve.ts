import {
  addRegistrationPayment,
  findRegistrationById,
  listPaymentsForRegistrations,
  settleRegistrationOutsideQpay,
  type Registration,
  type RegistrationPayment,
} from "../db";
import { closeBankIntents } from "../paymentIntents";
import { getPaymentProvider } from "../payment";
import { registrationBalance, sumPaymentsFor } from "../registration";
import { linkedPaymentIds, updateTransaction, type BankTransaction } from "./db";
import { findTwin } from "./match";

export type ApproveOutcome =
  | {
      id: string;
      ok: true;
      registrationId: string;
      programId: string;
      paymentId: string;
      amount: number;
      paidAt: string;
      /** A pending (bank-transfer) registration was activated — the family got the usual SMS. */
      activated: boolean;
    }
  | { id: string; ok: false; error: string };

const fmt = (n: number) => `${Math.round(n).toLocaleString("en-US")}₮`;

/** Gives a claimed row back to the admin with the reason it was not recorded. */
async function release(tx: BankTransaction, reason: string): Promise<ApproveOutcome> {
  await updateTransaction(tx.id, { status: "review", approved_at: null, approved_by: null, reason }, ["approved"]).catch(
    (err) => console.error("[bank-statement] releasing a claim failed", tx.id, err)
  );
  return { id: tx.id, ok: false, error: reason };
}

/**
 * Re-checks a registration right before recording: the snapshot the row was
 * matched against may be days old. A payment entered by hand since the row was
 * stored, or one recorded from another transfer meanwhile, must not be doubled;
 * nor may the transfer exceed what is still owed. Payments that already existed
 * when the row was matched were weighed then (and, if flagged, by the admin who
 * accepted the row), so they do not block it again here.
 */
async function blockerFor(registration: Registration, tx: BankTransaction, amount: number): Promise<string | null> {
  const payments = await listPaymentsForRegistrations([registration.id]);
  const linked = await linkedPaymentIds(payments.map((p) => p.id));
  const since = payments.filter((p) => p.createdAt > tx.createdAt);
  const twin = findTwin(
    since.map((p) => ({ id: p.id, amount: p.amount, paidAt: p.paidAt, linked: linked.has(p.id) })),
    amount,
    tx.date
  );
  if (twin) return `Ижил дүн ${twin.payment.paidAt}-нд гараар бүртгэгдсэн — давхар бүртгэсэнгүй, шалгана уу`;
  const { balance } = registrationBalance(registration, sumPaymentsFor(registration.id, payments));
  if (amount > balance + 1) return `Дүн үлдэгдлээс (${fmt(balance)}) их — бүртгэсэнгүй, шалгана уу`;
  return null;
}

/**
 * Records one "ready" transfer as a payment on its registration.
 *
 * The row is claimed first (ready → approved, guarded on its status and its
 * registration), so two admins pressing «Батлах» together — or one relinking
 * the row meanwhile — cannot record it twice or on the wrong child. A pending
 * registration goes through the same path as the «Баталгаажуулах» button: any
 * live QPay invoice is voided first (otherwise the QR stays payable and could
 * take the fee a second time), then it is activated, the payment recorded and
 * the family notified. Anything that stops the payment hands the row back.
 */
export async function approveTransaction(tx: BankTransaction, actor?: string): Promise<ApproveOutcome> {
  if (tx.status !== "ready" || !tx.registrationId) {
    return { id: tx.id, ok: false, error: "Батлахад бэлэн биш байна" };
  }
  const claimed = await updateTransaction(
    tx.id,
    { status: "approved", approved_at: new Date().toISOString(), approved_by: actor ?? null },
    ["ready"],
    tx.registrationId
  );
  if (!claimed) return { id: tx.id, ok: false, error: "Гүйлгээ өөрчлөгдсөн эсвэл аль хэдийн батлагдсан байна" };

  const registration = await findRegistrationById(tx.registrationId);
  if (!registration || registration.status === "cancelled") {
    return release(tx, "Холбосон бүртгэл цуцлагдсан эсвэл устсан байна");
  }

  const amount = Math.round(tx.amount);
  const paidAt = tx.date;
  let payment: RegistrationPayment | undefined;
  let activated = false;
  try {
    let current: Registration = registration;
    if (registration.status === "pending") {
      const blocker = await blockerFor(registration, tx, amount);
      if (blocker) return release(tx, blocker);
      if (registration.qpayInvoiceId) {
        try {
          await getPaymentProvider().cancelPayment(registration.qpayInvoiceId);
        } catch (err) {
          console.error("[bank-statement] voiding the invoice failed", registration.id, err);
          return release(tx, "QPay нэхэмжлэхийг цуцалж чадсангүй — дахин төлөгдөх эрсдэлтэй тул бүртгэсэнгүй. Дахин оролдоно уу.");
        }
      }
      const settled = await settleRegistrationOutsideQpay(registration.id, { amount, paidAt });
      payment = settled?.payment;
      activated = Boolean(payment);
      if (!payment) {
        // Someone else settled or cancelled it a moment ago.
        if (settled?.registration.status !== "active") return release(tx, "Бүртгэлийн төлөв өөрчлөгдсөн байна — шалгана уу");
        current = settled.registration;
      }
    }
    if (!payment) {
      const blocker = await blockerFor(current, tx, amount);
      if (blocker) return release(tx, blocker);
      payment = await addRegistrationPayment({ registrationId: current.id, amount, paidAt });
    }
  } catch (err) {
    console.error("[bank-statement] approve failed", tx.id, err);
    return release(tx, "Төлбөр бүртгэхэд алдаа гарлаа — дахин оролдоно уу");
  }

  // A student's "I transferred" flag must not hang around once the money is in.
  await closeBankIntents(registration.id).catch((err) =>
    console.error("[bank-statement] closing bank intents failed", registration.id, err)
  );
  await updateTransaction(tx.id, { payment_id: payment.id }, ["approved"]).catch((err) =>
    console.error("[bank-statement] linking the payment failed", tx.id, err)
  );
  return {
    id: tx.id,
    ok: true,
    registrationId: registration.id,
    programId: registration.programId,
    paymentId: payment.id,
    amount,
    paidAt,
    activated,
  };
}
