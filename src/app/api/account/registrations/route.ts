import { NextResponse } from "next/server";
import { listRegistrationsByUser } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтрээгүй байна" }, { status: 401 });
  }
  const registrations = await listRegistrationsByUser(user.id);
  return NextResponse.json({ ok: true, registrations });
}
