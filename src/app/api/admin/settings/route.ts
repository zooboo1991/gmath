import { NextResponse } from "next/server";
import { getAssessmentFee, getAssessmentSla, getQuizFee, isAssessmentOpen, setSetting } from "@/lib/assessment/db";
import { logAdminAction } from "@/lib/adminLog";
import { isFullAdmin } from "@/lib/session";
import { isTooLong, MAX_LEN } from "@/lib/validate";

/** Only keys listed here can be written, so the endpoint can't set anything. */
const EDITABLE_KEYS = new Set(["assessment_fee", "quiz_fee", "assessment_sla", "assessment_enabled"]);

export async function GET() {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const [assessmentFee, quizFee, sla, open] = await Promise.all([
    getAssessmentFee(),
    getQuizFee(),
    getAssessmentSla(),
    isAssessmentOpen(),
  ]);
  return NextResponse.json({
    ok: true,
    settings: {
      assessment_fee: assessmentFee,
      quiz_fee: quizFee,
      assessment_sla: sla,
      assessment_enabled: open ? "on" : "off",
    },
  });
}

export async function PUT(request: Request) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }

  const data = await request.json();
  const key = typeof data.key === "string" ? data.key : "";
  const value = typeof data.value === "string" ? data.value.trim() : "";

  if (!EDITABLE_KEYS.has(key)) {
    return NextResponse.json({ ok: false, error: "Тохиргоо олдсонгүй" }, { status: 400 });
  }
  if (!value) {
    return NextResponse.json({ ok: false, error: "Утгыг хоослож болохгүй" }, { status: 400 });
  }
  if (isTooLong(value, MAX_LEN.settingValue)) {
    return NextResponse.json({ ok: false, error: "Утга хэт урт байна" }, { status: 400 });
  }

  await setSetting(key, value);

  await logAdminAction(request, { actionType: "setting.update", targetId: key, details: { value } });

  return NextResponse.json({ ok: true, key, value });
}
