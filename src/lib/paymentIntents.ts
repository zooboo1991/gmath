import {
  addRegistrationPayment,
  createNotification,
  findRegistrationById,
  listPaymentsForRegistrations,
  type RegistrationPayment,
} from "./db";
import { fetchAllRows } from "./fetchAll";
import { getPaymentProvider } from "./payment";
import { registrationBalance, sumPaymentsFor } from "./registration";
import { getSupabase } from "./supabase";

/**
 * Сурагчийн эхлүүлсэн үлдэгдлийн төлбөр.
 *
 * Яагаад тусдаа хүснэгт: `registration_payments`-д мөр байна гэдэг нь "мөнгө
 * орсон" гэсэн үг бөгөөд балансын тооцоо, хяналтын самбар, гэрээ бүгд яг
 * тэгж уншдаг. Хүлээгдэж буй төлөлтийг тэнд хийвэл тэдгээр нийлбэр бүрд
 * шүүлт нэмэх үүрэг үүсч, нэгийг нь мартвал данс худал болно.
 *
 * Санаархал бүр өөрийн uuid-тай тул түүнээс гарах sender_invoice_no хэзээ ч
 * давтагдахгүй — нэг бүртгэлийг олон удаа нэхэмжлэх боломжийн үндэс нь энэ.
 */

export type PaymentIntentMethod = "qpay" | "bank";
export type PaymentIntentStatus = "pending" | "paid" | "cancelled";

export type RegistrationPaymentIntent = {
  id: string;
  registrationId: string;
  amount: number;
  method: PaymentIntentMethod;
  status: PaymentIntentStatus;
  qpayInvoiceId?: string;
  qpayPaymentId?: string;
  qpayQrImage?: string;
  qpayShortUrl?: string;
  createdAt: string;
  paidAt?: string;
};

type Row = {
  id: string;
  registration_id: string;
  amount: number;
  method: PaymentIntentMethod;
  status: PaymentIntentStatus;
  qpay_invoice_id: string | null;
  qpay_payment_id: string | null;
  qpay_qr_image: string | null;
  qpay_short_url: string | null;
  created_at: string;
  paid_at: string | null;
};

function fromRow(row: Row): RegistrationPaymentIntent {
  return {
    id: row.id,
    registrationId: row.registration_id,
    amount: row.amount,
    method: row.method,
    status: row.status,
    qpayInvoiceId: row.qpay_invoice_id ?? undefined,
    qpayPaymentId: row.qpay_payment_id ?? undefined,
    qpayQrImage: row.qpay_qr_image ?? undefined,
    qpayShortUrl: row.qpay_short_url ?? undefined,
    createdAt: row.created_at,
    paidAt: row.paid_at ?? undefined,
  };
}

/** Нэг санаархлын sender_invoice_no. Бүртгэлийн id-гаас ХЭЗЭЭ Ч гаргахгүй. */
export function senderInvoiceNoForIntent(intentId: string): string {
  return `gm-i-${intentId.replace(/-/g, "")}`;
}

export async function createPaymentIntent(input: {
  registrationId: string;
  amount: number;
  method: PaymentIntentMethod;
}): Promise<RegistrationPaymentIntent> {
  const { data, error } = await getSupabase()
    .from("registration_payment_intents")
    .insert({
      registration_id: input.registrationId,
      amount: input.amount,
      method: input.method,
    })
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as Row);
}

export async function findPaymentIntent(id: string): Promise<RegistrationPaymentIntent | undefined> {
  const { data, error } = await getSupabase()
    .from("registration_payment_intents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : undefined;
}

/** Тухайн бүртгэлийн амьд QPay нэхэмжлэх — хоёр дахийг үүсгэхийн өмнө шалгана. */
export async function findOpenQpayIntent(
  registrationId: string
): Promise<RegistrationPaymentIntent | undefined> {
  const { data, error } = await getSupabase()
    .from("registration_payment_intents")
    .select("*")
    .eq("registration_id", registrationId)
    .eq("method", "qpay")
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : undefined;
}

/** Админд харуулах, сурагчид "шалгагдаж байна" гэж хэлэхэд хэрэгтэй мөрүүд. */
export async function listIntentsForRegistration(
  registrationId: string
): Promise<RegistrationPaymentIntent[]> {
  const { data, error } = await getSupabase()
    .from("registration_payment_intents")
    .select("*")
    .eq("registration_id", registrationId)
    .order("created_at", { ascending: false })
    .order("id");
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

/**
 * Every balance payment a family started, newest first — the admin
 * registrations list shows them beside the registrations. Without the QR
 * image: the list never draws it, and each one is kilobytes of base64.
 */
export async function listAllPaymentIntents(): Promise<RegistrationPaymentIntent[]> {
  const rows = await fetchAllRows<Omit<Row, "qpay_qr_image" | "qpay_short_url">>(() =>
    getSupabase()
      .from("registration_payment_intents")
      .select("id, registration_id, amount, method, status, qpay_invoice_id, qpay_payment_id, created_at, paid_at")
      .order("created_at", { ascending: false })
      .order("id")
  );
  return rows.map((row) => fromRow({ ...row, qpay_qr_image: null, qpay_short_url: null }));
}

export async function attachInvoiceToIntent(
  id: string,
  invoice: { invoiceId: string; qrImage: string; shortUrl: string }
): Promise<RegistrationPaymentIntent | undefined> {
  const { data, error } = await getSupabase()
    .from("registration_payment_intents")
    .update({
      qpay_invoice_id: invoice.invoiceId,
      qpay_qr_image: invoice.qrImage,
      qpay_short_url: invoice.shortUrl,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : undefined;
}

export async function cancelPaymentIntent(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("registration_payment_intents")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw error;
}

/** Дансаар мэдэгдсэн хүлээгдэж буй санаархлуудыг хаана — админ төлбөрөө бүртгэсэн үед. */
export async function closeBankIntents(registrationId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("registration_payment_intents")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("registration_id", registrationId)
    .eq("method", "bank")
    .eq("status", "pending");
  if (error) throw error;
}

/**
 * QPay-ээс төлөгдсөнийг батлаад төлбөрийн дэвтэрт бичнэ.
 *
 * Callback, сурагчийн poll хоёулаа дуудна. Idempotency нь нөхцөлт UPDATE дээр
 * тогтоно: `status='pending'` мөрийг л 'paid' болгоно, хоосон буцвал өөр
 * дуудалт хожсон гэсэн үг тул юу ч бичихгүй. Дэвтрийн мөр ЗӨВХӨН хожсон
 * дуудалтад нэмэгддэг — эс бөгөөс давхар callback хоёр төлбөр үүсгэнэ.
 */
export async function settleInstallmentIntent(intentId: string): Promise<{ paid: boolean }> {
  const intent = await findPaymentIntent(intentId);
  if (!intent) return { paid: false };
  if (intent.status === "paid") return { paid: true };
  if (intent.status !== "pending" || intent.method !== "qpay" || !intent.qpayInvoiceId) {
    return { paid: false };
  }

  const result = await getPaymentProvider().checkPayment(intent.qpayInvoiceId);
  if (!result.paid) return { paid: false };

  const { data, error } = await getSupabase()
    .from("registration_payment_intents")
    .update({
      status: "paid",
      qpay_payment_id: result.reference,
      paid_at: result.paidAt,
    })
    .eq("id", intentId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  // Өөр дуудалт хожсон — тэр нь дэвтрийн мөрөө аль хэдийн бичсэн.
  if (!data) return { paid: true };

  const settled = fromRow(data as Row);
  // QPay-ийн бүртгэсэн бодит дүнг давуу үзнэ; зөрвөл ул мөр үлдээнэ.
  const amount = result.amount && result.amount > 0 ? result.amount : settled.amount;
  if (amount !== settled.amount) {
    console.error("[intent] QPay-ийн дүн нэхэмжилсэнтэй зөрлөө", settled.id, settled.amount, amount);
  }

  await addRegistrationPayment({
    registrationId: settled.registrationId,
    amount,
    paidAt: result.paidAt.slice(0, 10),
  });

  await notifyInstallmentPaid(settled.registrationId, amount);
  return { paid: true };
}

/** Төлбөр орсныг сурагчид хэлнэ. Мэдэгдлийн алдаа төлбөрийг унагаах ёсгүй. */
async function notifyInstallmentPaid(registrationId: string, amount: number): Promise<void> {
  try {
    const registration = await findRegistrationById(registrationId);
    if (!registration?.userId) return;
    await createNotification({
      title: "Төлбөр хүлээн авлаа",
      body: `"${registration.programLabel}" сургалтын ${amount.toLocaleString("en-US")}₮ төлбөр амжилттай төлөгдлөө.`,
      targetType: "users",
      userIds: [registration.userId],
      channel: "site",
      link: `/profile/course/${encodeURIComponent(registration.programId)}?tab=payment`,
    });
  } catch (err) {
    console.error("[intent] notification failed", registrationId, err);
  }
}

// ---------------------------------------------------------------------------
// The admin side: balance payments listed in «Бүртгэл» beside registrations,
// confirmed, checked or cancelled the way a pending registration is.
// ---------------------------------------------------------------------------

export type IntentActionResult =
  | { ok: true; intent: RegistrationPaymentIntent; payment?: RegistrationPayment; paid?: boolean }
  | { ok: false; status: number; error: string; paid?: boolean };

const ALREADY_PAID_BY_QPAY = "QPay дээр аль хэдийн төлөгдсөн байна — төлбөр нь бүртгэгдлээ.";

/**
 * Before an admin books or drops a QPay balance payment by hand: asks QPay
 * first (a family that did pay gets booked, not cancelled), then voids the
 * invoice so the QR still in their history cannot take the money a second
 * time. Null when there is nothing left to stop the admin's action.
 */
async function retireQpayInvoice(intent: RegistrationPaymentIntent): Promise<IntentActionResult | null> {
  if (intent.method !== "qpay" || !intent.qpayInvoiceId) return null;
  if ((await settleInstallmentIntent(intent.id)).paid) {
    return { ok: false, status: 409, paid: true, error: ALREADY_PAID_BY_QPAY };
  }
  try {
    await getPaymentProvider().cancelPayment(intent.qpayInvoiceId);
    return null;
  } catch (err) {
    if (err instanceof Error && err.message.includes("INVOICE_PAID")) {
      const { paid } = await settleInstallmentIntent(intent.id);
      return {
        ok: false,
        status: 409,
        paid,
        error: paid ? ALREADY_PAID_BY_QPAY : "QPay энэ нэхэмжлэхийг төлөгдсөн гэж байна — «QPay шалгах» дарж дахин оролдоно уу.",
      };
    }
    console.error("[intent] voiding the invoice failed", intent.id, err);
    return {
      ok: false,
      status: 502,
      error: "QPay нэхэмжлэхийг цуцалж чадсангүй. Дахин төлөгдөх эрсдэлтэй тул юу ч өөрчлөөгүй — дахин оролдоно уу.",
    };
  }
}

/**
 * «Баталгаажуулах» on a balance payment that arrived outside QPay: a bank
 * transfer the family announced, or a QR they ignored and paid by transfer.
 * The admin reads the amount and date off the statement — the family's own
 * word never books money. The row is claimed (pending → paid) before the
 * payment is written, so a double click or two admins cannot book it twice.
 */
export async function confirmIntentManually(
  intentId: string,
  input: { amount: number; paidAt: string }
): Promise<IntentActionResult> {
  const intent = await findPaymentIntent(intentId);
  if (!intent) return { ok: false, status: 404, error: "Төлөлт олдсонгүй" };
  if (intent.status === "paid") return { ok: false, status: 409, paid: true, error: "Энэ төлөлт аль хэдийн бүртгэгдсэн байна" };
  if (intent.status !== "pending") return { ok: false, status: 409, error: "Энэ төлөлт цуцлагдсан байна" };

  const registration = await findRegistrationById(intent.registrationId);
  if (!registration || registration.status !== "active") {
    return { ok: false, status: 409, error: "Бүртгэл идэвхтэй биш байна" };
  }
  const payments = await listPaymentsForRegistrations([registration.id]);
  const { balance } = registrationBalance(registration, sumPaymentsFor(registration.id, payments));
  if (input.amount > balance + 1) {
    return { ok: false, status: 400, error: `Үлдэгдлээс их дүн байна (үлдэгдэл ${balance.toLocaleString("en-US")}₮)` };
  }

  const blocked = await retireQpayInvoice(intent);
  if (blocked) return blocked;

  const { data, error } = await getSupabase()
    .from("registration_payment_intents")
    // Booked as the transfer that really happened, on the day the admin read off the statement.
    .update({ status: "paid", method: "bank", paid_at: `${input.paidAt}T12:00:00+08:00` })
    .eq("id", intentId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, status: 409, error: "Төлөлтийн төлөв өөрчлөгдсөн байна — хуудсаа шинэчилнэ үү" };

  const payment = await addRegistrationPayment({ registrationId: registration.id, amount: input.amount, paidAt: input.paidAt });
  await notifyInstallmentPaid(registration.id, input.amount);
  return { ok: true, intent: fromRow(data as Row), payment };
}

/** «QPay шалгах»: QPay is the authority; a paid invoice is booked exactly as the callback would. */
export async function checkIntentWithQpay(intentId: string): Promise<IntentActionResult> {
  const intent = await findPaymentIntent(intentId);
  if (!intent) return { ok: false, status: 404, error: "Төлөлт олдсонгүй" };
  if (intent.method !== "qpay" || !intent.qpayInvoiceId) {
    return { ok: false, status: 400, error: "Энэ төлөлт QPay-ийн нэхэмжлэхгүй байна" };
  }
  const { paid } = await settleInstallmentIntent(intentId);
  return { ok: true, intent: (await findPaymentIntent(intentId)) ?? intent, paid };
}

/**
 * «Цуцлах»: the family never paid this one. A paid row is final. A QPay one is
 * checked with QPay and its invoice voided first, so a payment that did come
 * through is booked instead of cancelled.
 */
export async function cancelIntentByAdmin(intentId: string): Promise<IntentActionResult> {
  const intent = await findPaymentIntent(intentId);
  if (!intent) return { ok: false, status: 404, error: "Төлөлт олдсонгүй" };
  if (intent.status === "cancelled") return { ok: true, intent };
  if (intent.status === "paid") return { ok: false, status: 409, paid: true, error: "Энэ төлөлт аль хэдийн бүртгэгдсэн байна" };

  const blocked = await retireQpayInvoice(intent);
  if (blocked) return blocked;

  await cancelPaymentIntent(intentId);
  const after = await findPaymentIntent(intentId);
  if (after?.status !== "cancelled") {
    return { ok: false, status: 409, paid: after?.status === "paid", error: "Төлөлтийн төлөв өөрчлөгдсөн байна — хуудсаа шинэчилнэ үү" };
  }
  return { ok: true, intent: after };
}

/** The registration's payments after an action on one of its balance payments — the list redraws «paid / due» from them. */
export async function paymentsAfterIntent(intentId: string): Promise<RegistrationPayment[] | undefined> {
  const intent = await findPaymentIntent(intentId);
  return intent ? listPaymentsForRegistrations([intent.registrationId]) : undefined;
}
