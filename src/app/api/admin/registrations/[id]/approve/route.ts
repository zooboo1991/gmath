import { NextResponse } from "next/server";
import { approveRegistration } from "@/lib/db";
import { isAdmin } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const registration = await approveRegistration(id);
  if (!registration) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, registration });
}
