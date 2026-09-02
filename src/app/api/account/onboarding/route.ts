import { NextResponse } from "next/server";
import { listRegistrationsByUser } from "@/lib/db";
import { isOnboardingStep, markOnboardingStep } from "@/lib/onboarding";
import { getSessionUser } from "@/lib/session";

/**
 * Эхлэлийн чеклистийн нэг алхмыг тэмдэглэх, эсвэл буцаах.
 *
 * userId нь зөвхөн сессиэс ирнэ — биетээс хэзээ ч биш. Сурагч зөвхөн ӨӨРИЙН,
 * төлбөр нь баталгаажсан сургалт дээр тэмдэглэж чадна: /api/lessons/* -тэй
 * ижил шалгуур, ижил 404 (403 нь тухайн сургалт байгааг мэдэгдчихнэ).
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }

  const data = await request.json().catch(() => ({}));
  const programId = typeof data.programId === "string" ? data.programId : "";
  if (!programId || !isOnboardingStep(data.step) || typeof data.done !== "boolean") {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }

  const registrations = await listRegistrationsByUser(user.id);
  const owned = registrations.some((r) => r.programId === programId && r.status === "active");
  if (!owned) {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }

  await markOnboardingStep({ userId: user.id, programId, step: data.step, done: data.done });
  return NextResponse.json({ ok: true });
}
