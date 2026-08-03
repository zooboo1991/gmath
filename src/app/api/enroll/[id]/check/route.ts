import { NextResponse } from "next/server";
import { findRegistrationById, settleRegistrationPayment } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

/**
 * Manual/polled confirmation for a pending QPay registration — mirrors
 * /api/assessment/[id]/pay/check. See that route for why polling from the
 * client (not a server cron) is the right call here.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const registration = await findRegistrationById(id);
  // Someone else's registration is reported missing rather than forbidden,
  // so the response can't be used to probe which ids exist.
  if (!registration || registration.userId !== user.id) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }

  if (registration.status === "active") {
    return NextResponse.json({ ok: true, registration, paid: true });
  }

  try {
    const settled = await settleRegistrationPayment(id);
    const current = settled ?? registration;
    return NextResponse.json({ ok: true, registration: current, paid: current.status === "active" });
  } catch (err) {
    console.error("enroll payment check failed", id, err);
    return NextResponse.json(
      { ok: false, error: "Төлбөр шалгахад алдаа гарлаа. Дахин оролдоно уу." },
      { status: 502 }
    );
  }
}
