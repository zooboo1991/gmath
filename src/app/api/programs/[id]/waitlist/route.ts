import { NextResponse } from "next/server";
import { findRegistrationByUserAndProgram, findYearlyProgramById } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  findProgramWaitlistEntry,
  joinProgramWaitlist,
  leaveProgramWaitlist,
  positionInProgramWaitlist,
} from "@/lib/programWaitlist";

/**
 * Хөтөлбөрийн хүлээлгийн жагсаалт.
 *
 * Нэвтэрсэн хүн л орно: жагсаалтын утга нь сул орон гармагц залгах явдал
 * тул хэн болохыг нь мэдэхгүй хүсэлт хагас ажил.
 */

async function ownPlace(userId: string, programId: string) {
  const entry = await findProgramWaitlistEntry(userId, programId);
  if (!entry) return { joined: false as const };
  return { joined: true as const, position: await positionInProgramWaitlist(entry), status: entry.status };
}

/** Өөрийн байр — хуудас ачаалахад товчийг зөв төлөвтэй харуулахад хэрэгтэй. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: true, joined: false });
  return NextResponse.json({ ok: true, ...(await ownPlace(user.id, id)) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрч байж бүртгүүлнэ" }, { status: 401 });
  }

  const rate = await checkRateLimit(`waitlist-join:${getClientIp(request.headers)}`, 10, 60);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Түр хүлээгээд дахин оролдоно уу" },
      { status: 429 }
    );
  }

  const program = await findYearlyProgramById(id);
  if (!program) {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }
  // Бүртгэлтэй хүн өөрийнхөө сургалтын дарааллаар зогсох ёсгүй. Товч талдаа
  // мөн нуугдсан ч сервер эцсийн хаалт нь байна — хуучин таб, шууд дуудалт.
  const existing = await findRegistrationByUserAndProgram(user.id, id).catch(() => undefined);
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "Та энэ сургалтад аль хэдийн бүртгэлтэй байна" },
      { status: 409 }
    );
  }
  // Нээлттэй хөтөлбөрт дараалал утгагүй — шууд бүртгүүлнэ.
  if (!program.enrollmentClosed) {
    return NextResponse.json(
      { ok: false, error: "Энэ сургалтын бүртгэл нээлттэй байна — шууд бүртгүүлнэ үү" },
      { status: 409 }
    );
  }

  const entry = await joinProgramWaitlist({
    userId: user.id,
    programId: id,
    programLabel: program.label,
  });
  return NextResponse.json({
    ok: true,
    joined: true,
    position: await positionInProgramWaitlist(entry),
    status: entry.status,
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }
  await leaveProgramWaitlist(user.id, id);
  return NextResponse.json({ ok: true, joined: false });
}
