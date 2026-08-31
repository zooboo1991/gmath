import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/adminLog";
import { findContractTemplate } from "@/lib/contracts/db";
import { ContractDocxError, renderContract } from "@/lib/contracts/docx";
import { resolveTagValues, type ContractContext } from "@/lib/contracts/fields";
import {
  findCourseById,
  findRegistrationById,
  findUserById,
  findYearlyProgramById,
  listPaymentsForRegistrations,
  toPublicUser,
} from "@/lib/db";
import { registrationBalance } from "@/lib/registration";
import { CONTRACTS_BUCKET, downloadStorageObject } from "@/lib/storage";

/**
 * Нэг сурагчийн гэрээний драфтыг бөглөж, Word файл болгон буцаана.
 *
 * Драфт нь хаана ч хадгалагдахгүй — эзэн татаж аваад Word дээрээ эцэслэнэ.
 * Тиймээс энд бичих үйлдэл байхгүй, зөвхөн уншина.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("siteAdmin")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }

  const { id } = await params;
  const template = await findContractTemplate(id);
  if (!template || !template.filePath) {
    return NextResponse.json({ ok: false, error: "Гэрээний загвар олдсонгүй" }, { status: 404 });
  }

  const data = await request.json().catch(() => ({}));
  const registrationId = typeof data.registrationId === "string" ? data.registrationId : "";
  if (!registrationId) {
    return NextResponse.json({ ok: false, error: "Сурагчийг сонгоно уу" }, { status: 400 });
  }

  const registration = await findRegistrationById(registrationId);
  if (!registration) {
    return NextResponse.json({ ok: false, error: "Бүртгэл олдсонгүй" }, { status: 404 });
  }
  if (!registration.userId) {
    return NextResponse.json(
      { ok: false, error: "Энэ бүртгэл аккаунттай холбогдоогүй тул гэрээ үүсгэх боломжгүй" },
      { status: 400 }
    );
  }

  const user = await findUserById(registration.userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Хэрэглэгч олдсонгүй" }, { status: 404 });
  }

  const owner =
    (await findYearlyProgramById(registration.programId)) ??
    (await findCourseById(registration.programId));
  const payments = await listPaymentsForRegistrations([registration.id]);
  const paidRecorded = payments.reduce((sum, p) => sum + p.amount, 0);

  const context: ContractContext = {
    user: toPublicUser(user),
    registration,
    program: owner
      ? {
          title: "label" in owner ? owner.label || owner.title : owner.title,
          tag: owner.tag,
          period: owner.period,
          startDate: "startDate" in owner ? owner.startDate : undefined,
          lessonCount: owner.lessons?.length ?? 0,
          weeklySchedule: "weeklySchedule" in owner ? owner.weeklySchedule : undefined,
        }
      : undefined,
    money: registrationBalance(registration, paidRecorded),
    now: new Date(),
  };

  let filled: Buffer;
  try {
    const source = await downloadStorageObject(CONTRACTS_BUCKET, template.filePath);
    filled = renderContract(source, resolveTagValues(template.tags, context));
  } catch (err) {
    if (err instanceof ContractDocxError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[contracts] render failed", id, err);
    return NextResponse.json({ ok: false, error: "Гэрээ үүсгэхэд алдаа гарлаа" }, { status: 500 });
  }

  await logAdminAction(request, {
    actionType: "contract.generate",
    targetId: id,
    details: { registrationId, title: template.title },
  });

  // Кирилл нэртэй файлыг бүх браузер зөв татаж авахын тулд RFC 5987 хэлбэр.
  const name = `${template.title} - ${user.lastName} ${user.firstName}.docx`;
  return new NextResponse(new Uint8Array(filled), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="contract.docx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
