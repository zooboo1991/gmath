import { NextResponse } from "next/server";
import { updateLevel } from "@/lib/assessment/db";
import { findCourseById } from "@/lib/db";
import { isAdmin } from "@/lib/session";
import { isTooLong, MAX_LEN } from "@/lib/validate";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }

  const { id } = await params;
  const levelId = Number(id);
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > 10) {
    return NextResponse.json({ ok: false, error: "Түвшин олдсонгүй" }, { status: 404 });
  }

  const data = await request.json();
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const name = str(data.name);
  if (!name) return NextResponse.json({ ok: false, error: "Түвшний нэрийг бөглөнө үү" }, { status: 400 });
  if (isTooLong(name, MAX_LEN.levelName)) {
    return NextResponse.json({ ok: false, error: "Түвшний нэр хэт урт байна" }, { status: 400 });
  }
  for (const [field, label] of [
    ["description", "Тайлбар"],
    ["scope", "Хамрах хүрээ"],
    ["howToAdvance", "Дараагийн түвшинд гарах"],
  ] as const) {
    if (isTooLong(str(data[field]), MAX_LEN.levelText)) {
      return NextResponse.json({ ok: false, error: `${label} хэт урт байна` }, { status: 400 });
    }
  }

  // Reject an unknown course id here rather than letting the FK throw a 500.
  const recommendedCourseId = str(data.recommendedCourseId);
  if (recommendedCourseId && !(await findCourseById(recommendedCourseId))) {
    return NextResponse.json({ ok: false, error: "Санал болгох сургалт олдсонгүй" }, { status: 400 });
  }

  const level = await updateLevel(levelId, {
    name,
    description: str(data.description),
    scope: str(data.scope),
    howToAdvance: str(data.howToAdvance),
    recommendedCourseId,
  });
  if (!level) {
    return NextResponse.json({ ok: false, error: "Түвшин олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, level });
}
