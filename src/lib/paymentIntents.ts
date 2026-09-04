import { addRegistrationPayment, createNotification, findRegistrationById } from "./db";
import { getPaymentProvider } from "./payment";
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
