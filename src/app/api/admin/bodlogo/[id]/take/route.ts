/**
 * Хүлээлгийн сангийн нэг бодлогыг бодлогын банк руу татна.
 *
 * Энэ бол хүн шийддэг алхам: bodlogo нэг загвараас 20 хувилбар үүсгэдэг тул
 * бүгдийг нь банкинд хийх нь утгагүй, мөн гаднаас ирсэн бодлого хүүхдэд
 * хүрэхийн өмнө нэг хүн харах ёстой.
 */

import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { takeBodlogoProblemIntoBank } from "@/lib/bodlogo/db";
import { isProblemCategory } from "@/lib/assessment/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("assessmentSetup")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const category = (body as { category?: unknown } | null)?.category;
  if (!isProblemCategory(category)) {
    return NextResponse.json(
      { ok: false, error: "Ангилал сонгоно уу (C — 5-6 анги, D — 7-8 анги)" },
      { status: 400 }
    );
  }
  // Идэвхтэй эсэхийг заавал дамжуулна: "нооргоор аваад дараа асаая" гэдэг нь
  // жинхэнэ хэрэг тул анхдагчаар идэвхжүүлэхгүй.
  const active = (body as { active?: unknown } | null)?.active !== false;

  const result = await takeBodlogoProblemIntoBank(id, { category, active });
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error:
          result.reason === "already_taken"
            ? "Энэ бодлогыг аль хэдийн банкандаа авсан байна"
            : "Бодлого олдсонгүй",
      },
      { status: result.reason === "already_taken" ? 409 : 404 }
    );
  }

  await logAdminAction(request, {
    actionType: "bodlogo.take",
    targetId: result.problem.id,
    details: { category, active, topic: result.problem.topic },
  }).catch(() => {});

  return NextResponse.json({ ok: true, problem: result.problem });
}
