import { NextResponse } from "next/server";
import { findRegistrationById, setRegistrationAttendDays } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { resolveProgram } from "@/lib/resolveProgram";
import { isFullAdmin } from "@/lib/session";
import { changeAttendDays, cleanDays, weekdayOf } from "@/lib/attendDays";

/**
 * Which of the class's weekdays a child attends, from a date on.
 *
 * Body: { weekdays: number[] | null, from: "YYYY-MM-DD" | null }. null weekdays
 * (or every class day) means the whole timetable; null `from` means since the
 * start of the course, replacing the earlier history. Registers taken before
 * `from` keep the days that were in force then.
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
  const program = await resolveProgram(registration.programId);
  if (!program) {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }

  const data = (await request.json().catch(() => ({}))) as { weekdays?: unknown; from?: unknown };
  // null = every class day — always allowed, so a restriction can be cleared even
  // after the class's timetable changed. Otherwise some of the class's own weekdays.
  const days = data.weekdays === null ? null : cleanDays(data.weekdays);
  if (data.weekdays !== null && program.weekdays.length < 2) {
    return NextResponse.json({ ok: false, error: "Энэ сургалтад гараг сонгох боломжгүй" }, { status: 400 });
  }
  if (data.weekdays !== null && (!days || days.length === 0 || days.some((d) => !program.weekdays.includes(d)))) {
    return NextResponse.json({ ok: false, error: "Суух гарагаа ангийн хичээллэдэг өдрүүдээс сонгоно уу" }, { status: 400 });
  }
  const from = data.from === null ? null : typeof data.from === "string" && weekdayOf(data.from) !== null ? data.from : undefined;
  if (from === undefined) {
    return NextResponse.json({ ok: false, error: "Хэзээнээс гэдэг огноо буруу байна" }, { status: 400 });
  }

  const entries = changeAttendDays(registration.attendDays, days, from, program.weekdays);
  const updated = await setRegistrationAttendDays(id, entries);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }
  await logAdminAction(request, {
    actionType: "registration.set_weekdays",
    targetId: id,
    details: { programId: registration.programId, programLabel: registration.programLabel, weekdays: days, from },
  });
  return NextResponse.json({ ok: true, registration: updated });
}
