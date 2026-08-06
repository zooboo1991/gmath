import { NextResponse } from "next/server";
import { addManualRegistration, findRegistrationByUserAndProgram, findUserByPhone, listAllRegistrations } from "@/lib/db";
import { resolveProgram } from "@/lib/resolveProgram";
import { isAdmin } from "@/lib/session";

const PHONE_RE = /^[0-9]{8}$/;

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const registrations = await listAllRegistrations();
  return NextResponse.json({ ok: true, registrations });
}

/** Admin manually adding someone to a course/program by phone — see addManualRegistration() for why this always lands as "active". */
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json().catch(() => ({}));
  const programId = typeof data.programId === "string" ? data.programId.trim() : "";
  const phone = typeof data.phone === "string" ? data.phone.trim() : "";
  if (!PHONE_RE.test(phone)) {
    return NextResponse.json({ ok: false, error: "8 оронтой утасны дугаар оруулна уу" }, { status: 400 });
  }
  if (!programId) {
    return NextResponse.json({ ok: false, error: "Сургалтын мэдээлэл дутуу байна" }, { status: 400 });
  }

  const program = await resolveProgram(programId);
  if (!program) {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }

  // Re-resolved server-side rather than trusting a client-supplied userId —
  // the admin's phone lookup was just a preview, not proof.
  const user = await findUserByPhone(phone);
  if (user) {
    const existing = await findRegistrationByUserAndProgram(user.id, programId);
    if (existing) {
      return NextResponse.json({ ok: false, error: "Энэ хэрэглэгч аль хэдийн бүртгэлтэй байна" }, { status: 409 });
    }
  }

  try {
    const registration = await addManualRegistration({
      programId,
      programLabel: program.label,
      price: program.price,
      phone,
      userId: user?.id,
    });
    return NextResponse.json({ ok: true, registration });
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "23505") {
      return NextResponse.json({ ok: false, error: "Энэ утасны дугаар аль хэдийн бүртгэлтэй байна" }, { status: 409 });
    }
    throw err;
  }
}
