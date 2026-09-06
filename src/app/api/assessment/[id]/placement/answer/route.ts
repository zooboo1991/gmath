import { NextResponse } from "next/server";
import { requireOwnAssessment } from "@/lib/assessment/guard";
import {
  placementAnswer,
  PlacementNotReadyError,
} from "@/lib/assessment/placementEngine";

/**
 * Нэг бодлогын хариулт. Хариуд нь зөв/бурууг хэлэхгүй — дараагийн бодлого
 * эсвэл үр дүнг л буцаана. Давхар илгээлт хоёр дахь удаа юу ч бичихгүй
 * (placement_steps-ийн нөхцөлт UPDATE).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  const assessment = guard.assessment;
  if (assessment.track !== "placement") {
    return NextResponse.json({ ok: false, error: "Шалгалт олдсонгүй" }, { status: 404 });
  }
  if (assessment.status === "completed") {
    return NextResponse.json({ ok: true, view: await placementAnswer(assessment, "") });
  }
  if (assessment.status !== "paid") {
    return NextResponse.json({ ok: false, error: "Эхлээд төлбөрөө төлнө үү" }, { status: 409 });
  }

  const data = await request.json().catch(() => ({}));
  // Нүдэн хариулт массиваар, чөлөөт бичвэр нэг мөрөөр ирнэ. Аль нь ирснийг
  // бодлогын төрөл шийднэ — сервер өөрөө шалгана.
  const boxes = Array.isArray(data.boxes)
    ? data.boxes.slice(0, 6).map((b: unknown) => (typeof b === "string" ? b : ""))
    : null;
  const answer = typeof data.answer === "string" ? data.answer : "";

  if (boxes) {
    if (boxes.length === 0 || boxes.some((b: string) => !b.trim())) {
      return NextResponse.json({ ok: false, error: "Нүд бүрийг бөглөнө үү" }, { status: 400 });
    }
  } else if (!answer.trim()) {
    return NextResponse.json({ ok: false, error: "Хариултаа бичнэ үү" }, { status: 400 });
  }

  try {
    return NextResponse.json({
      ok: true,
      view: await placementAnswer(assessment, boxes ?? answer),
    });
  } catch (err) {
    if (err instanceof PlacementNotReadyError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 503 });
    }
    throw err;
  }
}
