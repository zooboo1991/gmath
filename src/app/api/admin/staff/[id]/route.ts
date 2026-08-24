import { NextResponse } from "next/server";
import { deleteAdminUser, findAdminUser, updateAdminUser } from "@/lib/adminUsers";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { isTooLong, MAX_LEN } from "@/lib/validate";

const ROLES = new Set(["full", "viewer", "teacher"]);
const MIN_PASSWORD = 8;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("siteAdmin");
  if (!guard.ok) return NextResponse.json(REFUSED, { status: 401 });

  const { id } = await params;
  const existing = await findAdminUser(id);
  if (!existing) return NextResponse.json({ ok: false, error: "Аккаунт олдсонгүй" }, { status: 404 });

  const data = await request.json().catch(() => ({}));
  const patch: Parameters<typeof updateAdminUser>[1] = {};

  if (data.name !== undefined) {
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!name) return NextResponse.json({ ok: false, error: "Нэрээ бичнэ үү" }, { status: 400 });
    if (isTooLong(name, MAX_LEN.name)) {
      return NextResponse.json({ ok: false, error: "Нэр хэт урт байна" }, { status: 400 });
    }
    patch.name = name;
  }
  if (data.role !== undefined) {
    if (!ROLES.has(data.role)) {
      return NextResponse.json({ ok: false, error: "Эрх буруу байна" }, { status: 400 });
    }
    // Own account, own role: demoting yourself mid-session locks the owner out
    // of the very page that could undo it.
    if (guard.actor.id === id && data.role !== existing.role) {
      return NextResponse.json(
        { ok: false, error: "Өөрийн эрхээ өөрчлөх боломжгүй" },
        { status: 409 }
      );
    }
    patch.role = data.role;
  }
  if (data.active !== undefined) {
    if (guard.actor.id === id && data.active === false) {
      return NextResponse.json({ ok: false, error: "Өөрийгөө хаах боломжгүй" }, { status: 409 });
    }
    patch.active = data.active === true;
  }
  if (data.password !== undefined && data.password !== "") {
    if (typeof data.password !== "string" || data.password.length < MIN_PASSWORD) {
      return NextResponse.json(
        { ok: false, error: `Нууц үг дор хаяж ${MIN_PASSWORD} тэмдэгт байна` },
        { status: 400 }
      );
    }
    patch.password = data.password;
  }

  const updated = await updateAdminUser(id, patch);
  await logAdminAction(request, {
    actionType: "staff.update",
    targetId: id,
    details: {
      name: updated?.name,
      role: updated?.role,
      active: updated?.active,
      // Never the password itself, only that it changed.
      passwordChanged: patch.password ? true : undefined,
    },
  });
  return NextResponse.json({ ok: true, staff: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("siteAdmin");
  if (!guard.ok) return NextResponse.json(REFUSED, { status: 401 });

  const { id } = await params;
  const existing = await findAdminUser(id);
  if (!existing) return NextResponse.json({ ok: false, error: "Аккаунт олдсонгүй" }, { status: 404 });
  if (guard.actor.id === id) {
    return NextResponse.json({ ok: false, error: "Өөрийгөө устгах боломжгүй" }, { status: 409 });
  }

  await deleteAdminUser(id);
  await logAdminAction(request, {
    actionType: "staff.delete",
    targetId: id,
    details: { name: existing.name, username: existing.username },
  });
  return NextResponse.json({ ok: true });
}
