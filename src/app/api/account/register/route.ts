import { NextResponse } from "next/server";
import { createUser, toPublicUser } from "@/lib/db";
import { setSessionUser } from "@/lib/session";
import { isTooLong, MAX_LEN } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const PHONE_RE = /^[0-9]{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;

export async function POST(request: Request) {
  const rate = await checkRateLimit(`register:${getClientIp(request.headers)}`, 15, 10 * 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Хэт олон удаа оролдлоо. Хэдэн минутын дараа дахин оролдоно уу." },
      { status: 429 }
    );
  }

  const data = await request.json();
  const errors: Record<string, string> = {};

  if (data.role !== "teacher" && data.role !== "student") errors.role = "Төрлөө сонгоно уу";
  if (!data.lastName?.trim()) errors.lastName = "Овог заавал бөглөнө үү";
  else if (isTooLong(data.lastName, MAX_LEN.name)) errors.lastName = "Овог хэт урт байна";
  if (!data.firstName?.trim()) errors.firstName = "Нэр заавал бөглөнө үү";
  else if (isTooLong(data.firstName, MAX_LEN.name)) errors.firstName = "Нэр хэт урт байна";
  if (!data.province?.trim()) errors.province = "Аймаг/Хотоо бөглөнө үү";
  else if (isTooLong(data.province, MAX_LEN.province)) errors.province = "Аймаг/Хот хэт урт байна";
  if (!data.district?.trim()) errors.district = "Сум/Дүүргээ бөглөнө үү";
  else if (isTooLong(data.district, MAX_LEN.district)) errors.district = "Сум/Дүүрэг хэт урт байна";
  if (!data.school?.trim()) errors.school = "Сургуулийн нэрийг бөглөнө үү";
  else if (isTooLong(data.school, MAX_LEN.school)) errors.school = "Сургуулийн нэр хэт урт байна";
  if (data.role === "student" && !data.grade?.trim()) errors.grade = "Ангийг бөглөнө үү";
  if (isTooLong(data.grade, MAX_LEN.name)) errors.grade = "Анги хэт урт байна";
  if (!PHONE_RE.test(data.phone?.trim() ?? "")) errors.phone = "8 оронтой утасны дугаар оруулна уу";
  if (!EMAIL_RE.test(data.email?.trim() ?? "") || isTooLong(data.email, MAX_LEN.email))
    errors.email = "И-мэйл хаяг буруу байна";
  if (isTooLong(data.facebook, MAX_LEN.social)) errors.facebook = "Facebook нэр хэт урт байна";
  if (isTooLong(data.zoom, MAX_LEN.social)) errors.zoom = "Zoom нэр хэт урт байна";
  if (!PASSWORD_RE.test(data.password ?? "") || isTooLong(data.password, MAX_LEN.password))
    errors.password = "Нууц үг том, жижиг үсэг, тоо орсон, дор хаяж 6 тэмдэгт байна";
  if (data.passwordConfirm !== data.password) errors.passwordConfirm = "Нууц үг таарахгүй байна";

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  let user;
  try {
    user = await createUser(
      {
        role: data.role,
        lastName: data.lastName.trim(),
        firstName: data.firstName.trim(),
        province: data.province.trim(),
        district: data.district.trim(),
        school: data.school.trim(),
        grade: data.grade?.trim() || undefined,
        phone: data.phone.trim(),
        email: data.email.trim(),
        facebook: data.facebook?.trim() || undefined,
        zoom: data.zoom?.trim() || undefined,
      },
      data.password
    );
  } catch {
    return NextResponse.json(
      { ok: false, errors: { phone: "Энэ дугаараар бүртгэл үүссэн байна. Нэвтэрнэ үү." } },
      { status: 409 }
    );
  }

  await setSessionUser(user.id);

  return NextResponse.json({ ok: true, user: toPublicUser(user) });
}
