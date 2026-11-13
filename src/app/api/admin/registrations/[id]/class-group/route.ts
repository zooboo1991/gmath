import { NextResponse } from "next/server";
import { findRegistrationById, setRegistrationClassGroup } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";
import { cleanClassGroup } from "@/lib/classGroups";

/**
 * Which class a child sits in when the programme's classroom is split.
 *
 * Body: { classGroup: 1 | 2 | null }. null takes the child out of every class:
 * they are then expected at each class's lessons, as before the split. Unlike
 * the weekdays there is no "from" date — a class is a placement, not a
 * timetable, and registers already taken keep their marks either way.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const registration = await findRegistrationById(id);
  if (!registration) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }

  const data = (await request.json().catch(() => ({}))) as { classGroup?: unknown };
  const group = data.classGroup === null ? null : cleanClassGroup(data.classGroup);
  if (group === undefined) {
    return NextResponse.json({ ok: false, error: "Анги буруу байна" }, { status: 400 });
  }

  const updated = await setRegistrationClassGroup(id, group);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }
  await logAdminAction(request, {
    actionType: "registration.set_class_group",
    targetId: id,
    details: { programId: registration.programId, programLabel: registration.programLabel, classGroup: group },
  });
  return NextResponse.json({ ok: true, registration: updated });
}
