import { NextResponse } from "next/server";
import { findUserById, setUserIsTest, toPublicUser } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";

/**
 * Marks an account as one of the school's own test accounts, or unmarks it.
 *
 * Nothing about the account changes for the person using it — they enrol and
 * pay exactly as before. What changes is the books: their registrations stop
 * counting towards revenue, balances and the new-registration figures.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const user = await findUserById(id);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Хэрэглэгч олдсонгүй" }, { status: 404 });
  }

  const data = await request.json().catch(() => ({}));
  if (typeof data.isTest !== "boolean") {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  const updated = await setUserIsTest(id, data.isTest);
  await logAdminAction(request, {
    actionType: data.isTest ? "user.mark_test" : "user.unmark_test",
    targetId: id,
  });
  return NextResponse.json({ ok: true, user: updated ? toPublicUser(updated) : undefined });
}
