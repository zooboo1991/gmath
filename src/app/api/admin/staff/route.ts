import { NextResponse } from "next/server";
import { createAdminUser, listAdminUsers } from "@/lib/adminUsers";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { logAdminAction } from "@/lib/adminLog";
import { isTooLong, MAX_LEN } from "@/lib/validate";

const ROLES = new Set(["full", "viewer", "teacher"]);
/** Short enough to type on a phone, long enough not to be guessed in a day. */
const MIN_PASSWORD = 8;

export async function GET() {
  if (!(await requireCapability("siteAdmin")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  return NextResponse.json({ ok: true, staff: await listAdminUsers() });
}

export async function POST(request: Request) {
  if (!(await requireCapability("siteAdmin")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const username = typeof data.username === "string" ? data.username.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";
  const role = typeof data.role === "string" ? data.role : "";

  if (!name) return NextResponse.json({ ok: false, error: "Нэрээ бичнэ үү" }, { status: 400 });
  if (isTooLong(name, MAX_LEN.name)) {
    return NextResponse.json({ ok: false, error: "Нэр хэт урт байна" }, { status: 400 });
  }
  // Latin letters, digits, dot, dash, underscore: it is typed at a login form,
  // often on a phone keyboard, and a Cyrillic username there is a trap.
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return NextResponse.json(
      { ok: false, error: "Нэвтрэх нэр 3-32 латин үсэг, тоо, . _ - байна" },
      { status: 400 }
    );
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { ok: false, error: `Нууц үг дор хаяж ${MIN_PASSWORD} тэмдэгт байна` },
      { status: 400 }
    );
  }
  if (!ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: "Эрхийг сонгоно уу" }, { status: 400 });
  }

  try {
    const created = await createAdminUser({ name, username, password, role: role as "full" | "viewer" | "teacher" });
    await logAdminAction(request, {
      actionType: "staff.create",
      targetId: created.id,
      details: { name: created.name, username: created.username, role: created.role },
    });
    return NextResponse.json({ ok: true, staff: created });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return NextResponse.json({ ok: false, error: "Энэ нэвтрэх нэр аль хэдийн байна" }, { status: 409 });
    }
    throw err;
  }
}
