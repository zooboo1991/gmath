import { NextResponse } from "next/server";
import { findCourseById } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { isAdmin, isFullAdmin } from "@/lib/session";
import { generateCourseTasks, listCourseTasks } from "@/lib/courseTasks";

const REFUSED = { ok: false, error: "Зөвшөөрөлгүй" };

/** The course's homework and test papers, in the order they open. Any admin may look. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json(REFUSED, { status: 401 });
  const course = await findCourseById((await params).id);
  if (!course) return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  return NextResponse.json({ ok: true, tasks: await listCourseTasks(course.id) });
}

/**
 * Creates the papers the course's timetable promises (one per «Даалгавар» and
 * «Сорил» line of the weekly rhythm, every week of lessons) that it does not
 * have yet, as drafts with no problems.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFullAdmin())) return NextResponse.json(REFUSED, { status: 401 });
  const course = await findCourseById((await params).id);
  if (!course) return NextResponse.json({ ok: false, error: "Сургалт олдсонгүй" }, { status: 404 });
  const result = await generateCourseTasks(course.id, course);
  if (result.created === 0 && result.existing === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Хуваариас даалгавар олдсонгүй — «7 хоногийн хуваарь»-д «Мягмар 09:00–21:00 · Даалгавар …» гэх мэт мөр, хичээлүүдэд огноо байх ёстой.",
      },
      { status: 400 }
    );
  }
  await logAdminAction(request, {
    actionType: "course.tasks_generate",
    targetId: course.id,
    details: { title: course.title, created: result.created, existing: result.existing },
  });
  return NextResponse.json({ ok: true, ...result, tasks: await listCourseTasks(course.id) });
}
