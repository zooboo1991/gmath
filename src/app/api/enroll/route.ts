import { NextResponse } from "next/server";
import { addRegistration, findCourseById } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { staticProgramById } from "@/lib/staticPrograms";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтрээгүй байна" }, { status: 401 });
  }

  const { programId, payMethod } = await request.json();

  if (!programId || typeof programId !== "string") {
    return NextResponse.json({ ok: false, error: "Сургалтын мэдээлэл дутуу байна" }, { status: 400 });
  }
  if (payMethod !== "qpay" && payMethod !== "bank") {
    return NextResponse.json({ ok: false, error: "Төлбөрийн хэлбэрээ сонгоно уу" }, { status: 400 });
  }

  // Price and label are always derived server-side from the courses table
  // (or the fixed yearly-program map) — never trust a client-supplied price,
  // otherwise a request could be hand-crafted to register at any amount.
  let programLabel: string;
  let price: string;

  const staticProgram = staticProgramById[programId];
  if (staticProgram) {
    programLabel = staticProgram.label;
    price = staticProgram.price;
  } else if (UUID_RE.test(programId)) {
    const course = await findCourseById(programId);
    if (!course) {
      return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
    }
    programLabel = `${course.title} (${course.tag})`;
    price = course.price;
  } else {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }

  // QPay is simulated as an instant successful payment (no merchant
  // credentials configured yet — see ProgramRegister.tsx). Bank transfers
  // stay "pending" until an admin confirms receipt in /admin.
  const status = payMethod === "qpay" ? "active" : "pending";

  try {
    const registration = await addRegistration({
      userId: user.id,
      programId,
      programLabel,
      price,
      payMethod,
      status,
    });
    return NextResponse.json({ ok: true, registration });
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "Та энэ сургалтад аль хэдийн бүртгүүлсэн байна" },
        { status: 409 }
      );
    }
    throw err;
  }
}
