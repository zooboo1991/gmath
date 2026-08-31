import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import {
  deleteContractTemplate,
  findContractTemplate,
  setTemplatePrograms,
  updateContractTemplate,
  type ContractTag,
} from "@/lib/contracts/db";
import { readTemplateTags, ContractDocxError } from "@/lib/contracts/docx";
import { findContractField } from "@/lib/contracts/fields";
import {
  CONTRACTS_BUCKET,
  downloadStorageObject,
  isContractTemplatePath,
  removeStorageObject,
} from "@/lib/storage";
import { isTooLong, MAX_LEN } from "@/lib/validate";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("siteAdmin")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const template = await findContractTemplate((await params).id);
  if (!template) {
    return NextResponse.json({ ok: false, error: "Гэрээ олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, template });
}

/**
 * Гарчиг, төлөв, тагийн зураглал, холбогдох сургалтууд, шинэ файл — бүгд энэ
 * нэг PUT-ээр хадгалагдана.
 *
 * Шинэ файл ирвэл сервер өөрөө татаж аваад доторх тагуудыг уншина. Өмнөх
 * зураглалаас хэвээр байгаа тагуудынх нь хадгалагдаж, алга болсон нь хасагдана
 * — эзэн файлаа засаад дахин байршуулахад бүх зураглалаа дахин хийхгүй.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("siteAdmin")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const { id } = await params;
  const existing = await findContractTemplate(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Гэрээ олдсонгүй" }, { status: 404 });
  }

  const data = await request.json().catch(() => ({}));
  const patch: Parameters<typeof updateContractTemplate>[1] = {};

  if (data.title !== undefined) {
    const title = String(data.title).trim();
    if (!title) return NextResponse.json({ ok: false, error: "Гэрээний нэрийг бөглөнө үү" }, { status: 400 });
    if (isTooLong(title, MAX_LEN.contractTitle)) {
      return NextResponse.json({ ok: false, error: "Гэрээний нэр хэт урт байна" }, { status: 400 });
    }
    patch.title = title;
  }

  if (data.status !== undefined) {
    if (data.status !== "draft" && data.status !== "active") {
      return NextResponse.json({ ok: false, error: "Төлөв буруу байна" }, { status: 400 });
    }
    patch.status = data.status;
  }

  // Шинэ файл: замыг нь итгэхгүй, өөрсдийн үүсгэсэн хэлбэрт таарч байгааг шалгана.
  let detected: string[] | null = null;
  if (data.filePath !== undefined) {
    if (!isContractTemplatePath(data.filePath)) {
      return NextResponse.json({ ok: false, error: "Файлын зам буруу байна" }, { status: 400 });
    }
    try {
      detected = readTemplateTags(await downloadStorageObject(CONTRACTS_BUCKET, data.filePath));
    } catch (err) {
      if (err instanceof ContractDocxError) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
      }
      console.error("[contracts] tag read failed", err);
      return NextResponse.json({ ok: false, error: "Файлыг уншихад алдаа гарлаа" }, { status: 500 });
    }
    patch.filePath = data.filePath;
    patch.fileName = typeof data.fileName === "string" ? data.fileName.slice(0, 200) : "";
    patch.fileSize = Number(data.fileSize) || 0;

    const keep = new Map(existing.tags.map((t) => [t.tag, t.field]));
    patch.tags = detected.map((tag) => ({ tag, field: keep.get(tag) }));
  }

  // Тагийн зураглал: зөвхөн файлаас олдсон тагуудыг, зөвхөн танигдсан
  // талбарууд руу. Танихгүй түлхүүр ирвэл хоосон холбоос болно.
  if (Array.isArray(data.tags)) {
    const known = new Set((patch.tags ?? existing.tags).map((t: ContractTag) => t.tag));
    const incoming = new Map<string, string | undefined>();
    for (const entry of data.tags as { tag?: unknown; field?: unknown }[]) {
      const tag = typeof entry?.tag === "string" ? entry.tag : "";
      if (!tag || !known.has(tag) || isTooLong(tag, MAX_LEN.contractTag)) continue;
      const field = typeof entry?.field === "string" && findContractField(entry.field) ? entry.field : undefined;
      incoming.set(tag, field);
    }
    patch.tags = [...known].map((tag) => ({ tag, field: incoming.get(tag) }));
  }

  const template = await updateContractTemplate(id, patch);
  if (!template) {
    return NextResponse.json({ ok: false, error: "Гэрээ олдсонгүй" }, { status: 404 });
  }

  if (Array.isArray(data.programIds)) {
    const ids = (data.programIds as unknown[])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .slice(0, 200);
    await setTemplatePrograms(id, ids);
  }

  // Файл солигдсон бол хуучныг устгана — эс тэгвэл орлуулагдсан загвар бүр
  // bucket дотор эзэнгүй үлдэнэ.
  if (patch.filePath && existing.filePath && existing.filePath !== patch.filePath) {
    await removeStorageObject(CONTRACTS_BUCKET, existing.filePath).catch((err) =>
      console.error("[contracts] old file delete failed", existing.filePath, err)
    );
  }

  await logAdminAction(request, { actionType: "contract.update", targetId: id, details: { title: template.title } });
  return NextResponse.json({ ok: true, template: await findContractTemplate(id) });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireCapability("siteAdmin")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const { id } = await params;
  const existing = await findContractTemplate(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Гэрээ олдсонгүй" }, { status: 404 });
  }

  await deleteContractTemplate(id);
  if (existing.filePath) {
    await removeStorageObject(CONTRACTS_BUCKET, existing.filePath).catch((err) =>
      console.error("[contracts] file delete failed", existing.filePath, err)
    );
  }
  await logAdminAction(request, { actionType: "contract.delete", targetId: id, details: { title: existing.title } });
  return NextResponse.json({ ok: true });
}
