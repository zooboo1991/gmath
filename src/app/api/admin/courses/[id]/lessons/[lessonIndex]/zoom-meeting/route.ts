import { NextResponse } from "next/server";
import { findCourseById, findYearlyProgramById, updateCourse, updateYearlyProgram, type Lesson } from "@/lib/db";
import { logAdminAction } from "@/lib/adminLog";
import { parseScheduleString } from "@/lib/lessonSchedule";
import { isFullAdmin } from "@/lib/session";
import { createMeeting, updateMeeting } from "@/lib/zoom/client";
import {
  createLessonMeeting,
  deleteRegistrantsForLessonMeeting,
  findLessonMeeting,
  updateLessonMeeting,
} from "@/lib/zoom/db";

const DEFAULT_DURATION_MINUTES = 60;

/** Zoom's start_time, paired with a separate timezone field, wants a plain local datetime with no offset/Z. */
function zoomSchedule(scheduleString: string | undefined): { startTime: string; durationMinutes: number } | undefined {
  if (!scheduleString) return undefined;
  const { date, startTime, endTime } = parseScheduleString(scheduleString);
  if (!date || !startTime) return undefined;

  let durationMinutes = DEFAULT_DURATION_MINUTES;
  if (endTime) {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const diff = eh * 60 + em - (sh * 60 + sm);
    if (diff > 0) durationMinutes = diff;
  }

  return { startTime: `${date}T${startTime}:00`, durationMinutes };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; lessonIndex: string }> }
) {
  if (!(await isFullAdmin())) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }
  const { id: courseId, lessonIndex: lessonIndexRaw } = await params;
  const lessonIndex = Number(lessonIndexRaw);
  if (!Number.isInteger(lessonIndex) || lessonIndex < 0) {
    return NextResponse.json({ ok: false, error: "Буруу хичээлийн дугаар" }, { status: 400 });
  }

  // The owner can be a real course or a yearly program (both keep their
  // lessons/title under this same opaque text id — see the schema comment on
  // yearly_programs) — try the yearly table first since its ids are the ones
  // that never look like a UUID.
  const yearlyProgram = await findYearlyProgramById(courseId);
  const course = yearlyProgram ? undefined : await findCourseById(courseId);
  const owner = yearlyProgram ?? course;
  const lesson = owner?.lessons?.[lessonIndex];

  // The editor sends the schedule of the row the teacher pressed the button
  // on. Read before the "not found" check below, because a row that exists on
  // screen but not in the database is not a missing lesson — it is an unsaved
  // one, and "Хичээл олдсонгүй" leaves the teacher with nothing to act on.
  const body = (await request.json().catch(() => ({}))) as { force?: boolean; schedule?: string };

  if (owner && !lesson && typeof body?.schedule === "string") {
    return NextResponse.json(
      {
        ok: false,
        error: "Энэ хичээл хараахан хадгалагдаагүй байна. Эхлээд «Хадгалах» дарна уу.",
        unsaved: true,
      },
      { status: 409 }
    );
  }
  if (!owner || !lesson) {
    return NextResponse.json({ ok: false, error: "Хичээл олдсонгүй" }, { status: 404 });
  }
  if (lesson.mode === "inperson") {
    return NextResponse.json(
      { ok: false, error: "Танхимын хичээлд Zoom meeting үүсгэх боломжгүй" },
      { status: 400 }
    );
  }

  // force=true is the admin's "meeting-ээ дахин үүсгэх" escape hatch — for
  // when the tracked meeting was deleted directly on Zoom's side (e.g. via
  // zoom.us), which this app has no way to detect on its own.
  const force = body?.force === true;

  // The editor sends the schedule it is currently showing. Everything below
  // reads the *saved* lesson, so an unsaved time change would quietly produce
  // a meeting at the old hour — the admin's screen says 14:00 and Zoom says
  // 17:30. Refusing is the only honest answer; the fix is one click away.
  if (typeof body?.schedule === "string" && body.schedule.trim() !== (lesson.schedule ?? "").trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Хичээлийн цаг хадгалагдаагүй байна. Эхлээд «Хадгалах» дараад дахин оролдоно уу.",
        unsaved: true,
      },
      { status: 409 }
    );
  }

  const existingRow = await findLessonMeeting(courseId, lessonIndex);

  // A meeting already exists and the admin did not ask for a new one: they
  // pressed this because something about the lesson changed — almost always
  // its time. Move the existing meeting instead of silently handing back the
  // old one, which is what this used to do while reporting success.
  if (existingRow && !force) {
    const schedule = zoomSchedule(lesson.schedule);
    try {
      await updateMeeting(existingRow.zoomMeetingId, {
        topic: `${owner.title} — ${lesson.topic}`,
        schedule,
      });
    } catch (err) {
      console.error("zoom meeting update failed", courseId, lessonIndex, err);
      return NextResponse.json(
        {
          ok: false,
          error:
            "Zoom дээрх цагийг шинэчилж чадсангүй. Meeting нь Zoom дээр устсан бол «Дахин үүсгэх» дарна уу.",
        },
        { status: 502 }
      );
    }

    await logAdminAction(request, {
      actionType: "lesson.zoom_meeting_update",
      targetId: `${courseId}#${lessonIndex}`,
      details: { title: owner.title, topic: lesson.topic, schedule: lesson.schedule },
    });

    return NextResponse.json({ ok: true, meeting: existingRow, action: "updated" });
  }

  let meeting = force ? undefined : existingRow;
  if (!meeting) {
    try {
      const zoomMeeting = await createMeeting(`${owner.title} — ${lesson.topic}`, zoomSchedule(lesson.schedule));
      if (force && existingRow) {
        // Update in place (same row id) rather than delete+insert, so
        // lesson_attendance history — which references this id — survives.
        meeting = await updateLessonMeeting(existingRow.id, {
          zoomMeetingId: zoomMeeting.id,
          joinUrl: zoomMeeting.joinUrl,
          startUrl: zoomMeeting.startUrl,
        });
        // Old registrant links point at a meeting that no longer exists —
        // clear them so each student gets silently re-registered on the new
        // meeting the next time they click "Хичээлд орох".
        await deleteRegistrantsForLessonMeeting(existingRow.id);
      } else {
        meeting = await createLessonMeeting({
          courseId,
          lessonIndex,
          zoomMeetingId: zoomMeeting.id,
          joinUrl: zoomMeeting.joinUrl,
          startUrl: zoomMeeting.startUrl,
        });
      }
    } catch (err) {
      console.error("zoom meeting creation failed", courseId, lessonIndex, err);
      return NextResponse.json(
        { ok: false, error: "Zoom meeting үүсгэхэд алдаа гарлаа. Дахин оролдоно уу." },
        { status: 502 }
      );
    }
  }

  // The student-facing join button is gated on lessons[i].zoomLink (see
  // ProfileClient's LessonAction) — persist it onto the owner row itself so
  // the button appears right away, instead of depending on the admin also
  // clicking "Хадгалах" afterward to save the client-side form state.
  if (owner.lessons[lessonIndex].zoomLink !== meeting.joinUrl) {
    const lessons: Lesson[] = owner.lessons.map((l, i) =>
      i === lessonIndex ? { ...l, zoomLink: meeting!.joinUrl } : l
    );
    if (yearlyProgram) {
      await updateYearlyProgram(courseId, { lessons });
    } else {
      await updateCourse(courseId, { lessons });
    }
  }

  await logAdminAction(request, {
    actionType: "lesson.zoom_meeting_create",
    targetId: `${courseId}#${lessonIndex}`,
    details: { title: owner.title, topic: lesson.topic, force },
  });

  return NextResponse.json({ ok: true, meeting, action: force ? "recreated" : "created" });
}
