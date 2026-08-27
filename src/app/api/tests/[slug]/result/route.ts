import { NextResponse } from "next/server";
import { findTest, isCompleteAnswerSheet } from "@/lib/tests";
import { saveTestResult } from "@/lib/tests/db";
import { getSessionUser } from "@/lib/session";

/**
 * Stores a finished answer sheet on the child's profile.
 *
 * The answers come from the page; the score does not — it is worked out here
 * from the same table the questions are written in.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нэвтэрч байж хадгална" }, { status: 401 });
  }

  const { slug } = await params;
  const test = findTest(slug);
  if (!test) {
    return NextResponse.json({ ok: false, error: "Тест олдсонгүй" }, { status: 404 });
  }

  const data = await request.json().catch(() => ({}));
  if (!isCompleteAnswerSheet(test, data.answers)) {
    return NextResponse.json({ ok: false, error: "Бүх асуултад хариулна уу" }, { status: 400 });
  }

  const saved = await saveTestResult({ userId: user.id, testSlug: slug, answers: data.answers });
  return NextResponse.json({ ok: true, result: saved?.result });
}
