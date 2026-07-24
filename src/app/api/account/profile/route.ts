import { NextResponse } from "next/server";
import { toPublicUser, updateUserProfile } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PUT(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const data = await request.json();
  const errors: Record<string, string> = {};

  if (!data.lastName?.trim()) errors.lastName = "Овог заавал бөглөнө үү";
  if (!data.firstName?.trim()) errors.firstName = "Нэр заавал бөглөнө үү";
  if (!data.school?.trim()) errors.school = "Сургуулийн нэрийг бөглөнө үү";
  if (sessionUser.role === "student" && !data.grade?.trim()) errors.grade = "Ангийг бөглөнө үү";
  if (!EMAIL_RE.test(data.email?.trim() ?? "")) errors.email = "И-мэйл хаяг буруу байна";

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  const user = await updateUserProfile(sessionUser.id, {
    lastName: data.lastName.trim(),
    firstName: data.firstName.trim(),
    school: data.school.trim(),
    grade: data.grade?.trim() || undefined,
    email: data.email.trim(),
    facebook: data.facebook?.trim() || undefined,
    zoom: data.zoom?.trim() || undefined,
  });

  if (!user) {
    return NextResponse.json({ ok: false, error: "Хэрэглэгч олдсонгүй" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, user: toPublicUser(user) });
}
