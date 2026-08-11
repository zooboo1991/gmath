import { NextResponse } from "next/server";
import { buildGradingDetail } from "@/lib/assessment/gradingDetail";
import { isFullAdmin } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const detail = await buildGradingDetail(id);
  if (!detail) {
    return NextResponse.json({ ok: false, error: "Үнэлгээ олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail });
}
