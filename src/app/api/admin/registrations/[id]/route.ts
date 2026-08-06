import { NextResponse } from "next/server";
import { deleteRegistration } from "@/lib/db";
import { isAdmin } from "@/lib/session";

/**
 * Admin removing a registered student from a course/program — any status,
 * unlike .../cancel (pending only, and settles the QPay side first). A
 * manually-added or already-active row has no in-flight QPay invoice to
 * reconcile, so a plain delete is the whole operation.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const deleted = await deleteRegistration(id);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
