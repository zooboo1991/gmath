import { NextResponse } from "next/server";
import { requireOwnAssessment } from "@/lib/assessment/guard";
import {
  placementState,
  PlacementNotReadyError,
} from "@/lib/assessment/placementEngine";

/**
 * Шаталсан шалгалтын одоогийн байдал: дараагийн бодлого, эсвэл үр дүн.
 * Зөв хариулт энэ хариултад ХЭЗЭЭ Ч орохгүй.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnAssessment(id);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  const assessment = guard.assessment;
  if (assessment.track !== "placement") {
    return NextResponse.json({ ok: false, error: "Шалгалт олдсонгүй" }, { status: 404 });
  }
  if (assessment.status !== "paid" && assessment.status !== "completed") {
    return NextResponse.json({ ok: false, error: "Эхлээд төлбөрөө төлнө үү" }, { status: 409 });
  }

  try {
    return NextResponse.json({ ok: true, view: await placementState(assessment) });
  } catch (err) {
    if (err instanceof PlacementNotReadyError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 503 });
    }
    throw err;
  }
}
