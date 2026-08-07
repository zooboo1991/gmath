import { NextResponse } from "next/server";
import { deleteRegistrationPayment, findRegistrationById } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isAdmin } from "@/lib/session";

/** Removes a mis-entered payment row — admin correction, not a student-facing cancel. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id, paymentId } = await params;

  const registration = await findRegistrationById(id);
  const deleted = await deleteRegistrationPayment(paymentId);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Төлбөр олдсонгүй" }, { status: 404 });
  }

  await logAdminAction(request, {
    actionType: "registration.delete_payment",
    targetId: paymentId,
    details: { programId: registration?.programId, registrationId: id },
  });

  return NextResponse.json({ ok: true });
}
