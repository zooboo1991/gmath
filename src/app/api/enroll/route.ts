import { NextResponse } from "next/server";
import { addRegistration } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтрээгүй байна" }, { status: 401 });
  }

  const { programId, programLabel, price, payMethod } = await request.json();

  if (!programId || !programLabel || !price) {
    return NextResponse.json({ ok: false, error: "Сургалтын мэдээлэл дутуу байна" }, { status: 400 });
  }
  if (payMethod !== "qpay" && payMethod !== "bank") {
    return NextResponse.json({ ok: false, error: "Төлбөрийн хэлбэрээ сонгоно уу" }, { status: 400 });
  }

  // QPay is simulated as an instant successful payment (no merchant
  // credentials configured yet — see ProgramRegister.tsx). Bank transfers
  // stay "pending" until an admin confirms receipt in /admin.
  const status = payMethod === "qpay" ? "active" : "pending";

  const registration = await addRegistration({
    userId: user.id,
    programId,
    programLabel,
    price,
    payMethod,
    status,
  });

  return NextResponse.json({ ok: true, registration });
}
