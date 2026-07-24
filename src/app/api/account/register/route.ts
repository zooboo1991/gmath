import { NextResponse } from "next/server";
import { createUser, toPublicUser } from "@/lib/db";
import { setSessionUser } from "@/lib/session";

const PHONE_RE = /^[0-9]{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;

export async function POST(request: Request) {
  const data = await request.json();
  const errors: Record<string, string> = {};

  if (data.role !== "teacher" && data.role !== "student") errors.role = "Төрлөө сонгоно уу";
  if (!data.lastName?.trim()) errors.lastName = "Овог заавал бөглөнө үү";
  if (!data.firstName?.trim()) errors.firstName = "Нэр заавал бөглөнө үү";
  if (!data.school?.trim()) errors.school = "Сургуулийн нэрийг бөглөнө үү";
  if (data.role === "student" && !data.grade?.trim()) errors.grade = "Ангийг бөглөнө үү";
  if (!PHONE_RE.test(data.phone?.trim() ?? "")) errors.phone = "8 оронтой утасны дугаар оруулна уу";
  if (!EMAIL_RE.test(data.email?.trim() ?? "")) errors.email = "И-мэйл хаяг буруу байна";
  if (!PASSWORD_RE.test(data.password ?? ""))
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
