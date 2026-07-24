import { NextResponse } from "next/server";
import { deleteCourse, updateCourse } from "@/lib/db";
import { isAdmin } from "@/lib/session";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const data = await request.json();

  const lessons = Array.isArray(data.lessons)
    ? data.lessons
        .map((l: { topic?: string; schedule?: string }) => ({
          topic: l.topic?.trim() ?? "",
          schedule: l.schedule?.trim() || undefined,
        }))
        .filter((l: { topic: string }) => l.topic)
    : undefined;

  const course = await updateCourse(id, {
    tag: data.tag?.trim(),
    title: data.title?.trim(),
    topics: data.topics?.trim(),
    price: data.price?.trim(),
    period: data.period?.trim(),
    startDate: data.startDate?.trim() || undefined,
    mode: data.mode?.trim() || undefined,
    lessons,
  });

  if (!course) {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, course });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id } = await params;
  const removed = await deleteCourse(id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
