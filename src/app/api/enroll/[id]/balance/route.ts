import { NextResponse } from "next/server";
import {
  findRegistrationById,
  listPaymentsForRegistrations,
  notifyBalanceBankPending,
} from "@/lib/db";
import { getPaymentProvider } from "@/lib/payment";
import {
  attachInvoiceToIntent,
  cancelPaymentIntent,
  createPaymentIntent,
  findOpenQpayIntent,
  senderInvoiceNoForIntent,
  settleInstallmentIntent,
} from "@/lib/paymentIntents";
import { registrationBalance, sumPaymentsFor } from "@/lib/registration";
import { getSessionUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rateLimit";
import { SITE_URL } from "@/lib/siteUrl";

/** Хэт жижиг төлөлт нэхэмжлэх, мэдэгдэл, дэвтрийн мөрийг үржүүлнэ. */
const MIN_AMOUNT = 50_000;

/**
 * Сурагч үлдэгдлээ өөрөө төлж эхлэх.
 *
 * Дүнг сурагч оруулна ч СЕРВЕР өөрөө үлдэгдлээ бодож шалгана — клиентээс
 * ирсэн due/paid/balance-ыг огт хүлээж авахгүй. Илүү төлөхийг зөвшөөрөхгүй:
 * энэ системд буцаах механизм байхгүй.
 *
 * QPay сонговол санаархал бүр ӨӨРИЙН нэхэмжлэхтэй үүснэ. sender_invoice_no нь
 * санаархлын uuid-гаас гардаг тул нэг бүртгэлийг олон удаа нэхэмжилж болно —
 * бүртгэлийн id-гаас гаргавал QPay хоёр дахийг үүрд татгалзана.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const registration = await findRegistrationById(id);
  // Өөр хүний бүртгэлийг "олдсонгүй" гэнэ — ямар id байгааг мэдэгдэхгүй.
  if (!registration || registration.userId !== user.id || registration.status !== "active") {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }
  if (registration.totalDue === undefined) {
    return NextResponse.json(
      { ok: false, error: "Энэ сургалтад үлдэгдлийн төлбөр тохируулаагүй байна. Багштай холбогдоно уу." },
      { status: 409 }
    );
  }

  const payments = await listPaymentsForRegistrations([id]);
  const { balance } = registrationBalance(registration, sumPaymentsFor(id, payments));
  if (balance <= 0) {
    return NextResponse.json({ ok: false, error: "Төлбөр бүрэн төлөгдсөн байна" }, { status: 409 });
  }

  const data = await request.json().catch(() => ({}));
  // Заавал ТОО байх ёстой. Мөр хүлээж авбал "6e5" нь Number()-ээр 600000
  // болж дамжина — мөнгөний оролтод ийм гэнэтийн хөрвүүлэлт байх ёсгүй.
  const amount = typeof data.amount === "number" ? data.amount : NaN;
  const method = data.method === "bank" ? "bank" : data.method === "qpay" ? "qpay" : null;
  if (!method) {
    return NextResponse.json({ ok: false, error: "Төлбөрийн хэлбэрээ сонгоно уу" }, { status: 400 });
  }
  // parsePriceToNumber-ыг оролт дээр хэрэглэхгүй: тэр "-5"-ыг 5 болгодог.
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT) {
    return NextResponse.json(
      { ok: false, error: `Хамгийн багадаа ${MIN_AMOUNT.toLocaleString("en-US")}₮ төлнө` },
      { status: 400 }
    );
  }
  if (amount > balance) {
    return NextResponse.json(
      { ok: false, error: `Үлдэгдлээс их дүн төлөх боломжгүй (үлдэгдэл ${balance.toLocaleString("en-US")}₮)` },
      { status: 400 }
    );
  }

  // Дуудалт бүр QPay-д мөнхөд давтагдахгүй дугаар зарцуулдаг.
  if (!(await checkRateLimit(`balance-pay:${user.id}`, 5, 600)).allowed) {
    return NextResponse.json(
      { ok: false, error: "Хэт олон удаа оролдлоо. Хэсэг хүлээгээд дахин оролдоно уу." },
      { status: 429 }
    );
  }

  if (method === "bank") {
    const intent = await createPaymentIntent({ registrationId: id, amount, method: "bank" });
    await notifyBalanceBankPending(registration, amount);
    return NextResponse.json({ ok: true, method: "bank", intent });
  }

  // Амьд нэхэмжлэх байвал эхлээд төлөгдсөн эсэхийг шалгана, дараа нь
  // дүн ижил бол ТЭР ЛЭ QR-ыг буцаана. Шинийг үүсгэхийн өмнө хуучныг
  // ЗААВАЛ цуцлана — хоёр амьд нэхэмжлэх нь хоёр удаа төлөгдөх эрсдэл.
  const open = await findOpenQpayIntent(id);
  if (open) {
    const settled = await settleInstallmentIntent(open.id).catch(() => ({ paid: false }));
    if (settled.paid) {
      return NextResponse.json({ ok: true, method: "qpay", paid: true });
    }
    if (open.amount === amount && open.qpayInvoiceId) {
      return NextResponse.json({ ok: true, method: "qpay", intent: open });
    }
    if (open.qpayInvoiceId) {
      try {
        await getPaymentProvider().cancelPayment(open.qpayInvoiceId);
      } catch (err) {
        console.error("[balance] нэхэмжлэх цуцлаж чадсангүй", open.id, err);
        return NextResponse.json(
          { ok: false, error: "Өмнөх нэхэмжлэхийг цуцлаж чадсангүй. Дахин оролдоно уу." },
          { status: 502 }
        );
      }
    }
    await cancelPaymentIntent(open.id);
  }

  const intent = await createPaymentIntent({ registrationId: id, amount, method: "qpay" });
  try {
    const started = await getPaymentProvider().createPayment({
      amountMnt: amount,
      description: `${registration.programLabel} — үлдэгдэл`,
      senderInvoiceNo: senderInvoiceNoForIntent(intent.id),
      callbackUrl: `${SITE_URL}/api/qpay/callback?type=installment&ref=${intent.id}`,
    });
    if (started.paid) {
      // Stub провайдер — шууд барагдана.
      await settleInstallmentIntent(intent.id).catch(() => {});
      return NextResponse.json({ ok: true, method: "qpay", paid: true });
    }
    const withInvoice = await attachInvoiceToIntent(intent.id, started);
    return NextResponse.json({ ok: true, method: "qpay", intent: withInvoice ?? intent });
  } catch (err) {
    console.error("[balance] нэхэмжлэх үүсгэж чадсангүй", intent.id, err);
    await cancelPaymentIntent(intent.id).catch(() => {});
    return NextResponse.json(
      { ok: false, error: "Төлбөрийн нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу." },
      { status: 502 }
    );
  }
}
