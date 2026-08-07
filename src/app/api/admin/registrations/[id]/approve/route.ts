import { NextResponse } from "next/server";
import { approveRegistration } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isAdmin } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const registration = await approveRegistration(id);
  if (!registration) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }

  await logAdminAction(request, {
    actionType: "registration.approve",
    targetId: id,
    details: { programId: registration.programId, programLabel: registration.programLabel, price: registration.price },
  });

  return NextResponse.json({ ok: true, registration });
}
