import { NextResponse } from "next/server";
import { deleteRegistration, findRegistrationById, setRegistrationTotalDue } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";

/**
 * Admin removing a registered student from a course/program — any status,
 * unlike .../cancel (pending only, and settles the QPay side first). A
 * manually-added or already-active row has no in-flight QPay invoice to
 * reconcile, so a plain delete is the whole operation.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
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
    details: {
      programId: registration?.programId,
      programLabel: registration?.programLabel,
      status: registration?.status,
      price: registration?.price,
    },
  });

  return NextResponse.json({ ok: true });
}

/** Sets the actual agreed total for a student — yearly-program installment tracking, see the schema comment on registrations.total_due. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json().catch(() => ({}));
  const totalDue = Number(data.totalDue);
  if (!Number.isFinite(totalDue) || totalDue < 0) {
    return NextResponse.json({ ok: false, error: "Төлөх дүн буруу байна" }, { status: 400 });
  }

  const registration = await setRegistrationTotalDue(id, totalDue);
  if (!registration) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }

  await logAdminAction(request, {
    actionType: "registration.set_total_due",
    targetId: id,
    details: { programId: registration.programId, totalDue },
  });

  return NextResponse.json({ ok: true, registration });
}
