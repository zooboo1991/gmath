import { NextResponse } from "next/server";
import { listSongonClasses } from "@/lib/db";
import {
  attachBookingInvoice,
  bookPlacement,
  cancelOwnBooking,
  findActiveBooking,
  findBookingById,
  findPaidBooking,
  settleBookingPayment,
  type PlacementBooking,
} from "@/lib/placementBookingDb";
import {
  PLACEMENT_FEE,
  bookableDays,
  buildAssessmentSlots,
  isBookable,
} from "@/lib/placementBooking";
import { getPaymentProvider, stubPaymentsEnabled } from "@/lib/payment";
import { getSessionUser } from "@/lib/session";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * Танхимд ирж түвшин тогтоолгох цаг захиалах — сурагчийн тал.
 *
 * Сонгож болох өдөр, цагийг сервер өөрөө тооцож өгдөг бөгөөд захиалахад
 * дахин шалгадаг: клиентээс ирсэн "би энэ цагийг сонголоо" гэдэгт найдвал
 * хуваарьт огт байхгүй цаг захиалагдаж, багш хүлээхгүй өдөр хүүхэд ирнэ.
 *
 * Цаг нь 20,000₮ төлж байж баталгаажна. Тиймээс POST нь хоёр ажилтай:
 * мөр үүсгэх, нэхэмжлэх үүсгэх. Хоёр дахь удаа дуудахад ШИНЭ нэхэмжлэх
 * үүсгэхгүй — QPay-ийн sender_invoice_no давтагдаж болохгүй.
 */

async function slots() {
  const classes = await listSongonClasses().catch(() => []);
  return buildAssessmentSlots(classes);
}

/** Клиент рүү явуулах хэлбэр — QR болон дүнг дагуулна. */
function publicBooking(booking: PlacementBooking) {
  return {
    id: booking.id,
    bookedDate: booking.bookedDate,
    slot: booking.slot,
    status: booking.status,
    feeAmount: booking.feeAmount,
    paid: Boolean(booking.paidAt),
    qrImage: booking.qpayQrImage,
    shortUrl: booking.qpayShortUrl,
  };
}

export async function GET() {
  const user = await getSessionUser();
  const days = bookableDays(await slots());
  if (!user) {
    return NextResponse.json({
      ok: true,
      signedIn: false,
      days,
      booking: null,
      fee: PLACEMENT_FEE,
      credit: 0,
    });
  }

  let booking = await findActiveBooking(user.id).catch(() => undefined);
  // Төлбөрийн цонх нээлттэй байхад хуудас өөрөө асууж байдаг — webhook
  // ирээгүй байсан ч эцэг эх төлмөгц "баталгаажлаа" гэж харах ёстой.
  if (booking?.status === "awaiting_payment" && booking.qpayInvoiceId) {
    booking = (await settleBookingPayment(booking.id).catch(() => booking)) ?? booking;
  }
  // Бүртгэлийн цонх "580,000₮" гэж зөв харуулахын тулд хараахан
  // ашиглагдаагүй хөнгөлөлт байгаа эсэхийг мэдэх хэрэгтэй. Болисон, ирээгүй
  // захиалгын мөнгө ч хүчинтэй тул идэвхтэй захиалгаас тусад нь хайна.
  const paid = await findPaidBooking(user.id).catch(() => undefined);
  const credit = paid && !paid.creditedRegistrationId ? paid.feeAmount : 0;

  return NextResponse.json({
    ok: true,
    signedIn: true,
    days,
    booking: booking ? publicBooking(booking) : null,
    fee: PLACEMENT_FEE,
    credit,
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const date = typeof (body as { date?: unknown }).date === "string" ? (body as { date: string }).date : "";
  const slot = typeof (body as { slot?: unknown }).slot === "string" ? (body as { slot: string }).slot : "";

  if (!isBookable(await slots(), date, slot)) {
    return NextResponse.json(
      { ok: false, error: "Энэ өдөр, цаг сонгох боломжгүй байна. Жагсаалтаас сонгоно уу." },
      { status: 400 }
    );
  }

  const provider = getPaymentProvider();
  if (provider.name === "stub" && !stubPaymentsEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Төлбөрийн систем хараахан идэвхжээгүй байна. Та бидэнтэй холбогдоно уу." },
      { status: 503 }
    );
  }

  let existing = await findActiveBooking(user.id).catch(() => undefined);
  if (existing?.status === "awaiting_payment" && existing.qpayInvoiceId) {
    // Мөнгө нь аль хэдийн орчихсон байж магадгүй — шинэ мөр үүсгэхийн өмнө
    // шалгана, эс бөгөөс төлсөн хүн "аль хэдийн захиалсан байна" гэсэн
    // алдаа авалгүй хоёр дахь удаа төлөх эрсдэлтэй.
    existing = (await settleBookingPayment(existing.id).catch(() => existing)) ?? existing;
  }

  if (existing?.status === "booked") {
    return NextResponse.json(
      { ok: false, error: "Та аль хэдийн цаг захиалсан байна. Хуучин цагаа болиод шинээр захиална уу." },
      { status: 409 }
    );
  }

  if (existing?.status === "awaiting_payment") {
    // Ижил цагийг дахин сонгосон бол хуучин QR-аа өгнө.
    if (existing.bookedDate === date && existing.slot === slot && existing.qpayInvoiceId) {
      return NextResponse.json({ ok: true, booking: publicBooking(existing) });
    }
    // Өөр цаг сонгосон бол хуучин нэхэмжлэхийг хүчингүй болгоно — QPay дээр
    // төлөгдөөгүй нэхэмжлэх хуримтлуулах хэрэггүй.
    if (existing.qpayInvoiceId) {
      await provider.cancelPayment(existing.qpayInvoiceId).catch(() => {});
    }
    await cancelOwnBooking(existing.id, user.id).catch(() => {});
  }

  const created = await bookPlacement({
    userId: user.id,
    bookedDate: date,
    slot,
    feeAmount: PLACEMENT_FEE,
  });
  if (!created.ok) {
    return NextResponse.json(
      { ok: false, error: "Та аль хэдийн цаг захиалсан байна. Хуучин цагаа болиод шинээр захиална уу." },
      { status: 409 }
    );
  }

  try {
    // Утас эхэнд нь: QPay-ийн тайланг уншаад аль сурагчийнх болохыг
    // нэрээр нь биш дугаараар нь олно.
    const start = await provider.createPayment({
      amountMnt: PLACEMENT_FEE,
      description: `${user.phone} Түвшин тогтоолгох`,
      // QPay-ийн sender_invoice_no 45 тэмдэгтээр хязгаарлагдана.
      senderInvoiceNo: `gm-p-${created.booking.id.replace(/-/g, "")}`,
      callbackUrl: `${SITE_URL}/api/qpay/callback?type=placement&ref=${created.booking.id}`,
    });

    if (start.paid) {
      // Зөвхөн stub провайдераар л энд хүрнэ — жинхэнэ QPay үүсгэх үедээ
      // хэзээ ч "төлөгдсөн" гэж буцаадаггүй.
      const settled = await settleBookingPayment(created.booking.id);
      return NextResponse.json({ ok: true, booking: publicBooking(settled ?? created.booking) });
    }

    const withInvoice = await attachBookingInvoice(created.booking.id, {
      invoiceId: start.invoiceId,
      qrImage: start.qrImage,
      shortUrl: start.shortUrl,
    });
    return NextResponse.json({ ok: true, booking: publicBooking(withInvoice ?? created.booking) });
  } catch (err) {
    console.error("placement booking payment failed", created.booking.id, err);
    // Нэхэмжлэхгүй мөр үлдээвэл дараагийн оролдлого "аль хэдийн захиалсан"
    // гэж унана — тиймээс цэвэрлэнэ.
    await cancelOwnBooking(created.booking.id, user.id).catch(() => {});
    return NextResponse.json(
      { ok: false, error: "Төлбөрийн систем рүү холбогдоход алдаа гарлаа. Дахин оролдоно уу." },
      { status: 502 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const id = typeof (body as { id?: unknown }).id === "string" ? (body as { id: string }).id : "";

  // Төлөгдөөгүй нэхэмжлэхийг хүчингүй болгоно. Төлөгдсөнийг хүрэхгүй —
  // мөнгө буцаахгүй, хөнгөлөлт нь хэвээрээ үлдэнэ.
  const booking = await findBookingById(id).catch(() => undefined);
  if (booking?.userId === user.id && booking.status === "awaiting_payment" && booking.qpayInvoiceId) {
    await getPaymentProvider().cancelPayment(booking.qpayInvoiceId).catch(() => {});
  }

  // Эзэмшигчээр нь хязгаарлана: id таасан ч өөр хүний цагийг болиулж болохгүй.
  const cancelled = await cancelOwnBooking(id, user.id);
  if (!cancelled) {
    return NextResponse.json({ ok: false, error: "Захиалга олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
