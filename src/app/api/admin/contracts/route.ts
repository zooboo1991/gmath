import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { createContractTemplate, listContractTemplates } from "@/lib/contracts/db";
import { isTooLong, MAX_LEN } from "@/lib/validate";

/** Гэрээний загварууд. Зөвхөн эзний эрх — гэрээ бол сургуулийн нэрийн өмнөөс байгуулах баримт. */
export async function GET() {
  if (!(await requireCapability("siteAdmin")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  return NextResponse.json({ ok: true, templates: await listContractTemplates() });
}

export async function POST(request: Request) {
  if (!(await requireCapability("siteAdmin")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) {
    return NextResponse.json({ ok: false, error: "Гэрээний нэрийг бөглөнө үү" }, { status: 400 });
  }
  if (isTooLong(title, MAX_LEN.contractTitle)) {
    return NextResponse.json({ ok: false, error: "Гэрээний нэр хэт урт байна" }, { status: 400 });
  }

  const template = await createContractTemplate(title);
  await logAdminAction(request, { actionType: "contract.create", targetId: template.id, details: { title } });
  return NextResponse.json({ ok: true, template });
}
