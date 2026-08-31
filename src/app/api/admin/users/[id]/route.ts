import { NextResponse } from "next/server";
import { findUserById, setUserIsTest, toPublicUser, updateUserProfile } from "@/lib/db";
import { isTooLong, MAX_LEN } from "@/lib/validate";
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

/**
 * Гэрээнд шаардлагатай нэмэлт талбарууд: эцэг эхийн нэр, регистр, хаяг гэх мэт.
 *
 * Зөвхөн эдгээрийг л зөвшөөрнө — овог нэр, утас, имэйл нь хэрэглэгчийн өөрийн
 * мэдээлэл тул профайлаасаа өөрчилнө. Админ энд бөглөх шалтгаан нь эцэг эх
 * утсаар мэдээллээ өгөх нь элбэг байдагт оршино.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await findUserById(id))) {
    return NextResponse.json({ ok: false, error: "Хэрэглэгч олдсонгүй" }, { status: 404 });
  }

  const data = await request.json().catch(() => ({}));
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  const parentName = text(data.parentName);
  const parentPhone = text(data.parentPhone);
  const parentRegister = text(data.parentRegister);
  const studentRegister = text(data.studentRegister);
  const birthDate = text(data.birthDate);
  const address = text(data.address);

  for (const [value, limit] of [
    [parentName, MAX_LEN.name],
    [parentPhone, MAX_LEN.name],
    [parentRegister, MAX_LEN.name],
    [studentRegister, MAX_LEN.name],
    [address, MAX_LEN.school],
  ] as const) {
    if (isTooLong(value, limit)) {
      return NextResponse.json({ ok: false, error: "Талбар хэт урт байна" }, { status: 400 });
    }
  }
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return NextResponse.json({ ok: false, error: "Огноо буруу байна" }, { status: 400 });
  }

  const updated = await updateUserProfile(id, {
    parentName,
    parentPhone,
    parentRegister,
    studentRegister,
    birthDate,
    address,
  });
  await logAdminAction(request, { actionType: "user.contract_fields", targetId: id });
  return NextResponse.json({ ok: true, user: updated ? toPublicUser(updated) : undefined });
}
