import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { findOlympiad, listResults, notifyIfPublished, setPublished } from "@/lib/miniOlympiad/db";

/**
 * «Нийтлэх» / hide. Publishing shows each family their own child's result, and
 * every family not yet told gets a site notification (no SMS) — once per
 * child, however often the admin hides and publishes again.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("grading")).ok) return NextResponse.json(REFUSED, { status: 401 });
  const olympiad = await findOlympiad((await params).id);
  if (!olympiad) return NextResponse.json({ ok: false, error: "Олимпиад олдсонгүй" }, { status: 404 });
  const data = (await request.json().catch(() => ({}))) as { publish?: unknown };
  if (typeof data.publish !== "boolean") {
    return NextResponse.json({ ok: false, error: "Нийтлэх эсэхээ заана уу" }, { status: 400 });
  }

  const results = await listResults(olympiad);
  if (data.publish && results.length === 0) {
    return NextResponse.json({ ok: false, error: "Дүн оруулаагүй байна" }, { status: 400 });
  }
  const updated = await setPublished(olympiad.id, data.publish);
  if (!updated) return NextResponse.json({ ok: false, error: "Олимпиад олдсонгүй" }, { status: 404 });
  const told = await notifyIfPublished(updated);

  await logAdminAction(request, {
    actionType: data.publish ? "olympiad.publish" : "olympiad.unpublish",
    targetId: olympiad.id,
    details: { title: olympiad.title, participants: results.length, ...told },
  });
  return NextResponse.json({ ok: true, olympiad: updated, ...told });
}
