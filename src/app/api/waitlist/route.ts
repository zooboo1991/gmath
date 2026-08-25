import { NextResponse } from "next/server";
import { joinWaitlist, leaveWaitlist, listWaitlistByUser } from "@/lib/waitlist";
import { isTooLong, MAX_LEN } from "@/lib/validate";
import { getSessionUser } from "@/lib/session";

/** The signed-in visitor's own place in the queue. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }
  const requests = await listWaitlistByUser(user.id).catch(() => []);
  return NextResponse.json({ ok: true, requests });
}

/**
 * Joins the waiting list.
 *
 * Signed-in only, on purpose: the point of the list is to be able to ring
 * these families when their class opens, and an anonymous form collects
 * wishes from people nobody can reach.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрч байж бүртгүүлнэ" }, { status: 401 });
  }

  const data = await request.json().catch(() => ({}));
  const note = typeof data.note === "string" ? data.note.trim() : "";
  // The grade comes from the profile; the form only asks for one when the
  // profile has none (a parent's account, say).
  const grade = (typeof data.grade === "string" ? data.grade.trim() : "") || (user.grade ?? "").trim();

  if (!grade) {
    return NextResponse.json({ ok: false, error: "Хүүхдийн ангиа бичнэ үү" }, { status: 400 });
  }
  // The list exists to answer "which class, at what time" — a request with no
  // time on it answers half the question.
  if (!note) {
    return NextResponse.json(
      { ok: false, error: "Тохирох цагаа сонгоно уу" },
      { status: 400 }
    );
  }
  if (isTooLong(grade, MAX_LEN.waitlistGrade)) {
    return NextResponse.json({ ok: false, error: "Анги хэт урт байна" }, { status: 400 });
  }
  if (isTooLong(note, MAX_LEN.waitlistNote)) {
    return NextResponse.json({ ok: false, error: "Тайлбар хэт урт байна" }, { status: 400 });
  }

  const created = await joinWaitlist({ userId: user.id, grade, note });
  return NextResponse.json({ ok: true, request: created });
}

/** Leaves the queue. Only ever the asker's own row. */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрнэ үү" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "Буруу хүсэлт" }, { status: 400 });
  }
  const removed = await leaveWaitlist(id, user.id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Хүсэлт олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
