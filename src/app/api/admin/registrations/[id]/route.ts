import { NextResponse } from "next/server";
import { deleteRegistration, findRegistrationById } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isAdmin } from "@/lib/session";

/**
 * Admin removing a registered student from a course/program — any status,
 * unlike .../cancel (pending only, and settles the QPay side first). A
 * manually-added or already-active row has no in-flight QPay invoice to
 * reconcile, so a plain delete is the whole operation.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  // Fetched before the delete purely so the log entry can say what was
  // removed — a bare id is useless six months later.
  const registration = await findRegistrationById(id);
  const deleted = await deleteRegistration(id);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }

  await logAdminAction(request, {
    actionType: "registration.delete",
    targetId: id,
    details: { programLabel: registration?.programLabel, status: registration?.status, price: registration?.price },
  });

  return NextResponse.json({ ok: true });
}
