import { NextResponse } from "next/server";
import {
  addRegistration,
  findCourseById,
  findRegistrationByUserAndProgram,
  settleRegistrationPayment,
  updateRegistration,
} from "@/lib/db";
import { extractCourseCategories, getCourseAudience } from "@/lib/courseTag";
import { getPaymentProvider, stubPaymentsEnabled } from "@/lib/payment";
import { parsePriceToNumber } from "@/lib/price";
import { getSessionUser } from "@/lib/session";
import { SITE_URL } from "@/lib/siteUrl";
import { staticProgramById } from "@/lib/staticPrograms";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтрээгүй байна" }, { status: 401 });
  }

  const { programId, payMethod } = await request.json();

  if (!programId || typeof programId !== "string") {
    return NextResponse.json({ ok: false, error: "Сургалтын мэдээлэл дутуу байна" }, { status: 400 });
  }
  if (payMethod !== "qpay" && payMethod !== "bank") {
    return NextResponse.json({ ok: false, error: "Төлбөрийн хэлбэрээ сонгоно уу" }, { status: 400 });
  }

  // Price and label are always derived server-side from the courses table
  // (or the fixed yearly-program map) — never trust a client-supplied price,
  // otherwise a request could be hand-crafted to register at any amount.
  let programLabel: string;
  let price: string;
  let facebookGroup: string | undefined;
  // Category/audience for the QPay description below — real courses carry a
  // proper tag; the static yearly programs' label already reads "(C
  // ангилал)" etc., which extractCourseCategories can parse just as well.
  let courseTag: string;

  const staticProgram = staticProgramById[programId];
  if (staticProgram) {
    programLabel = staticProgram.label;
    price = staticProgram.price;
    courseTag = staticProgram.label;
  } else if (UUID_RE.test(programId)) {
    const course = await findCourseById(programId);
    if (!course) {
      return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
    }
    programLabel = `${course.title} (${course.tag})`;
    price = course.price;
    facebookGroup = course.facebookGroup;
    courseTag = course.tag;
  } else {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }

  if (payMethod === "bank") {
    // Stays pending until an admin confirms receipt in /admin — unchanged.
    try {
      const registration = await addRegistration({
        userId: user.id,
        programId,
        programLabel,
        price,
        payMethod: "bank",
        status: "pending",
      });
      return NextResponse.json({ ok: true, registration, paid: false, facebookGroup: undefined });
    } catch (err) {
      if ((err as { code?: string } | null)?.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "Та энэ сургалтад аль хэдийн бүртгүүлсэн байна" },
          { status: 409 }
        );
      }
      throw err;
    }
  }

  // qpay: create a real invoice and only activate once QPay confirms it —
  // the old behaviour marked the registration active on the spot with no
  // money changing hands.
  const provider = getPaymentProvider();
  if (provider.name === "stub" && !stubPaymentsEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Төлбөрийн систем хараахан идэвхжээгүй байна. Та бидэнтэй холбогдоно уу." },
      { status: 503 }
    );
  }

  let registration = await findRegistrationByUserAndProgram(user.id, programId);
  if (registration?.status === "active") {
    return NextResponse.json({ ok: false, error: "Та энэ сургалтад аль хэдийн бүртгүүлсэн байна" }, { status: 409 });
  }

  if (!registration) {
    try {
      registration = await addRegistration({
        userId: user.id,
        programId,
        programLabel,
        price,
        payMethod: "qpay",
        status: "pending",
      });
    } catch (err) {
      if ((err as { code?: string } | null)?.code !== "23505") throw err;
      // Two tabs raced to create the same registration — resume whichever won.
      registration = await findRegistrationByUserAndProgram(user.id, programId);
      if (!registration) throw err;
      if (registration.status === "active") {
        return NextResponse.json(
          { ok: false, error: "Та энэ сургалтад аль хэдийн бүртгүүлсэн байна" },
          { status: 409 }
        );
      }
    }
  }

  try {
    // Resume: an invoice already exists for this attempt. Recheck it first
    // — the student may have already paid and just reopened the modal — and
    // otherwise hand back the same QR rather than creating a second
    // invoice, since QPay's sender_invoice_no can never be reused.
    if (registration.qpayInvoiceId) {
      const settled = await settleRegistrationPayment(registration.id);
      const current = settled ?? registration;
      if (current.status === "active") {
        return NextResponse.json({ ok: true, registration: current, paid: true, facebookGroup });
      }
      return NextResponse.json({
        ok: true,
        registration: current,
        paid: false,
        qrImage: current.qpayQrImage,
        shortUrl: current.qpayShortUrl,
      });
    }

    // Phone first so a payment can be matched back to a student later just
    // by reading the description on the QPay/bank side — name alone isn't
    // reliably unique.
    const categories = extractCourseCategories(courseTag);
    const categoryLabel = categories.length > 0 ? categories.join(",") : "-";
    const audienceLabel = getCourseAudience(courseTag) === "teacher" ? "Багш" : "Сурагч";
    const description = `${user.phone} ${categoryLabel} ${audienceLabel}`;

    const start = await provider.createPayment({
      amountMnt: parsePriceToNumber(price),
      description,
      // QPay caps sender_invoice_no at 45 chars — see the matching comment in
      // assessment/[id]/pay/route.ts.
      senderInvoiceNo: `gm-c-${registration.id.replace(/-/g, "")}`,
      callbackUrl: `${SITE_URL}/api/qpay/callback?type=registration&ref=${registration.id}`,
    });

    if (start.paid) {
      // Only ever reachable via the stub provider — QPayPaymentProvider never
      // resolves paid on creation. qpay_payment_id is reserved for a real
      // QPay transaction id, so a stub reference isn't written there.
      const updated = await updateRegistration(registration.id, { status: "active" });
      return NextResponse.json({ ok: true, registration: updated, paid: true, facebookGroup });
    }

    const updated = await updateRegistration(registration.id, {
      qpay_invoice_id: start.invoiceId,
      qpay_qr_image: start.qrImage,
      qpay_short_url: start.shortUrl,
    });
    return NextResponse.json({
      ok: true,
      registration: updated,
      paid: false,
      qrImage: start.qrImage,
      shortUrl: start.shortUrl,
    });
  } catch (err) {
    console.error("enroll payment failed", registration.id, err);
    return NextResponse.json(
      { ok: false, error: "Төлбөрийн систем рүү холбогдоход алдаа гарлаа. Дахин оролдоно уу." },
      { status: 502 }
    );
  }
}
