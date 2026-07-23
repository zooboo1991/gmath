import { NextResponse } from "next/server";
import { addCourse, listCourses } from "@/lib/db";
import { isAdmin } from "@/lib/session";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, courses: await listCourses() });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const data = await request.json();

  if (data.kind !== "upcoming" && data.kind !== "vod") {
    return NextResponse.json({ ok: false, error: "Төрлийг сонгоно уу" }, { status: 400 });
  }
  if (!data.tag?.trim() || !data.title?.trim() || !data.price?.trim() || !data.period?.trim()) {
    return NextResponse.json({ ok: false, error: "Заавал бөглөх талбарууд дутуу байна" }, { status: 400 });
  }

  const course = await addCourse({
    kind: data.kind,
    tag: data.tag.trim(),
    title: data.title.trim(),
    topics: data.topics?.trim() ?? "",
    price: data.price.trim(),
    period: data.period.trim(),
    startDate: data.startDate?.trim() || undefined,
    mode: data.mode?.trim() || undefined,
  });

  return NextResponse.json({ ok: true, course });
}
