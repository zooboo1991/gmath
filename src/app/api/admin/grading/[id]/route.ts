import { NextResponse } from "next/server";
import { buildGradingDetail } from "@/lib/assessment/gradingDetail";
import { REFUSED, requireCapability } from "@/lib/adminAccess";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("grading")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const { id } = await params;
  const detail = await buildGradingDetail(id);
  if (!detail) {
    return NextResponse.json({ ok: false, error: "Үнэлгээ олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail });
}
