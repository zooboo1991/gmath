import { NextResponse } from "next/server";
import { checkAdminPassword, setAdminSession } from "@/lib/session";

export async function POST(request: Request) {
  const { password } = await request.json();

  if (!checkAdminPassword(password ?? "")) {
    return NextResponse.json({ ok: false, error: "Нууц үг буруу байна" }, { status: 401 });
  }

  await setAdminSession();
  return NextResponse.json({ ok: true });
}
