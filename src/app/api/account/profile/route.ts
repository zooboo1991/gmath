import { NextResponse } from "next/server";
import { toPublicUser, updateUserProfile } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isTooLong, MAX_LEN } from "@/lib/validate";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PUT(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const data = await request.json();
  const errors: Record<string, string> = {};

  if (!data.lastName?.trim()) errors.lastName = "Овог заавал бөглөнө үү";
  else if (isTooLong(data.lastName, MAX_LEN.name)) errors.lastName = "Овог хэт урт байна";
  if (!data.firstName?.trim()) errors.firstName = "Нэр заавал бөглөнө үү";
  else if (isTooLong(data.firstName, MAX_LEN.name)) errors.firstName = "Нэр хэт урт байна";
  if (!data.school?.trim()) errors.school = "Сургуулийн нэрийг бөглөнө үү";
  else if (isTooLong(data.school, MAX_LEN.school)) errors.school = "Сургуулийн нэр хэт урт байна";
  if (sessionUser.role === "student" && !data.grade?.trim()) errors.grade = "Ангийг бөглөнө үү";
  if (isTooLong(data.grade, MAX_LEN.name)) errors.grade = "Анги хэт урт байна";
  if (!EMAIL_RE.test(data.email?.trim() ?? "") || isTooLong(data.email, MAX_LEN.email))
    errors.email = "И-мэйл хаяг буруу байна";
  if (isTooLong(data.facebook, MAX_LEN.social)) errors.facebook = "Facebook нэр хэт урт байна";
  if (isTooLong(data.zoom, MAX_LEN.social)) errors.zoom = "Zoom нэр хэт урт байна";

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
