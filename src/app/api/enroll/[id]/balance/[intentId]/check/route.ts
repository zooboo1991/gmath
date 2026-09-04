import { NextResponse } from "next/server";
import { findRegistrationById, listPaymentsForRegistrations } from "@/lib/db";
import { findPaymentIntent, settleInstallmentIntent } from "@/lib/paymentIntents";
import { registrationBalance, sumPaymentsFor } from "@/lib/registration";
import { getSessionUser } from "@/lib/session";

/**
 * Үлдэгдлийн төлбөр төлөгдсөн эсэхийг шалгах — сурагчийн QR цонх энэ рүү
 * тодорхой давтамжтай хандана.
 *
 * Cron ашиглахгүй: QPay нь payment/check-ийг таймераар дуудахыг хориглодог,
 * бүртгэлийн урсгал ч ижилхэн клиентээс polling хийдэг.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; intentId: string }> }
) {
  const { id, intentId } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const registration = await findRegistrationById(id);
  if (!registration || registration.userId !== user.id) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }

  const intent = await findPaymentIntent(intentId);
  // Санаархал нь ЭНЭ бүртгэлийнх мөн эсэхийг заавал шалгана — эс бөгөөс
  // хэрэглэгч өөрийн бүртгэлийн id-гаар өөр хүний төлбөрийг барагдуулж чадна.
  if (!intent || intent.registrationId !== id) {
    return NextResponse.json({ ok: false, error: "Төлбөр олдсонгүй" }, { status: 404 });
  }

  try {
    const { paid } = await settleInstallmentIntent(intentId);
    const payments = await listPaymentsForRegistrations([id]);
    const { balance } = registrationBalance(registration, sumPaymentsFor(id, payments));
    return NextResponse.json({ ok: true, paid, balance });
  } catch (err) {
    console.error("[balance] төлбөр шалгахад алдаа", intentId, err);
    return NextResponse.json(
      { ok: false, error: "Төлбөр шалгахад алдаа гарлаа. Дахин оролдоно уу." },
      { status: 502 }
    );
  }
}
