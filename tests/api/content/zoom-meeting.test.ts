/**
 * POST /api/admin/courses/[id]/lessons/[i]/zoom-meeting — the button a teacher
 * presses when a lesson needs a Zoom room.
 *
 * Written after a real Saturday morning: a lesson moved from 17:30 to 14:00,
 * and the button reported "✓ Үүслээ" three times while doing nothing at all.
 * Two separate traps were behind that, and both are pinned here.
 *
 *   1. A meeting already existed, so the route handed the old one back and
 *      called it success. Now it moves the existing meeting to the lesson's
 *      time — same join link, same registrants, same attendance history.
 *   2. The route reads the *saved* lesson, so an unsaved time change would
 *      have produced a meeting at the old hour with nothing to show for it.
 *      Now that is a 409 telling the admin to save first.
 */

import { afterAll, describe, expect, it } from "vitest";
import { adminClient } from "../../support/client";
import { cleanupTracked, testDb } from "../../support/db";
import { createTestCourse } from "../../support/factories";
import { findMockZoomMeeting } from "../../support/mockControl";

afterAll(async () => {
  await cleanupTracked();
});

const AT_1730 = "2026.08.22 Бямба гараг · 17:30–19:00";
const AT_1400 = "2026.08.22 Бямба гараг · 14:00–15:30";

type MeetingResponse = {
  ok: boolean;
  error?: string;
  action?: string;
  meeting?: { id: string; zoomMeetingId: string; joinUrl: string };
};

async function courseWithLesson(schedule: string) {
  const course = await createTestCourse({
    lessons: [{ topic: "Жинлэлтийн бодлогууд", mode: "online", schedule }],
  });
  // lesson_meetings rows are keyed by course id and cascade with nothing, so
  // they are registered for cleanup by hand.
  return course;
}

async function setSchedule(courseId: string, schedule: string) {
  const { data } = await testDb().from("courses").select("lessons").eq("id", courseId).single();
  const lessons = (data as { lessons: Record<string, unknown>[] }).lessons;
  const patched = lessons.map((l, i) => (i === 0 ? { ...l, schedule } : l));
  const { error } = await testDb().from("courses").update({ lessons: patched }).eq("id", courseId);
  if (error) throw new Error(error.message);
}

async function trackMeetingRow(courseId: string) {
  const { data } = await testDb().from("lesson_meetings").select("id").eq("course_id", courseId);
  for (const row of (data ?? []) as { id: string }[]) {
    const { track } = await import("../../support/db");
    track("lesson_meetings", row.id);
  }
}

describe("creating the meeting for a lesson", () => {
  it("creates one at the lesson's own time", async () => {
    const course = await courseWithLesson(AT_1400);
    const admin = await adminClient("full");

    const res = await admin.post<MeetingResponse>(
      `/api/admin/courses/${course.id}/lessons/0/zoom-meeting`,
      { schedule: AT_1400 }
    );
    await trackMeetingRow(course.id);

    expect(res.status, res.text).toBe(200);
    expect(res.body.action).toBe("created");
    const onZoom = await findMockZoomMeeting(res.body.meeting!.zoomMeetingId);
    expect(onZoom?.startTime).toBe("2026-08-22T14:00:00");
    expect(onZoom?.duration).toBe(90);
    expect(onZoom?.timezone).toBe("Asia/Ulaanbaatar");
  });

  it("puts the join link on the lesson so students see the button", async () => {
    const course = await courseWithLesson(AT_1400);
    const admin = await adminClient("full");

    const res = await admin.post<MeetingResponse>(
      `/api/admin/courses/${course.id}/lessons/0/zoom-meeting`,
      { schedule: AT_1400 }
    );
    await trackMeetingRow(course.id);

    const { data } = await testDb().from("courses").select("lessons").eq("id", course.id).single();
    const lesson = (data as { lessons: { zoomLink?: string }[] }).lessons[0];
    expect(lesson.zoomLink).toBe(res.body.meeting!.joinUrl);
  });
});

describe("the lesson moves to a different hour", () => {
  it("moves the existing meeting instead of handing back the old one", async () => {
    const course = await courseWithLesson(AT_1730);
    const admin = await adminClient("full");

    const first = await admin.post<MeetingResponse>(
      `/api/admin/courses/${course.id}/lessons/0/zoom-meeting`,
      { schedule: AT_1730 }
    );
    await trackMeetingRow(course.id);
    const zoomId = first.body.meeting!.zoomMeetingId;
    expect((await findMockZoomMeeting(zoomId))?.startTime).toBe("2026-08-22T17:30:00");

    // The teacher reschedules and saves, then presses the button again.
    await setSchedule(course.id, AT_1400);
    const second = await admin.post<MeetingResponse>(
      `/api/admin/courses/${course.id}/lessons/0/zoom-meeting`,
      { schedule: AT_1400 }
    );

    expect(second.status, second.text).toBe(200);
    expect(second.body.action).toBe("updated");
    // Same meeting, new time: the link in every student's profile still works
    // and their personal registrant links are not thrown away.
    expect(second.body.meeting!.zoomMeetingId).toBe(zoomId);
    expect(second.body.meeting!.joinUrl).toBe(first.body.meeting!.joinUrl);
    expect((await findMockZoomMeeting(zoomId))?.startTime).toBe("2026-08-22T14:00:00");
    expect((await findMockZoomMeeting(zoomId))?.duration).toBe(90);
  });

  it("refuses when the form's time has not been saved yet", async () => {
    const course = await courseWithLesson(AT_1730);
    const admin = await adminClient("full");

    // The editor shows 14:00 but nobody pressed Хадгалах, so the lesson in the
    // database still says 17:30.
    const res = await admin.post<MeetingResponse & { unsaved?: boolean }>(
      `/api/admin/courses/${course.id}/lessons/0/zoom-meeting`,
      { schedule: AT_1400 }
    );

    expect(res.status).toBe(409);
    expect(res.body.unsaved).toBe(true);
    expect(res.body.error).toContain("Хадгалах");
    // Nothing was created at the wrong hour.
    const { data } = await testDb().from("lesson_meetings").select("id").eq("course_id", course.id);
    expect(data ?? []).toHaveLength(0);
  });
});

describe("starting over", () => {
  it("force creates a brand new meeting and drops the old registrants", async () => {
    const course = await courseWithLesson(AT_1400);
    const admin = await adminClient("full");

    const first = await admin.post<MeetingResponse>(
      `/api/admin/courses/${course.id}/lessons/0/zoom-meeting`,
      { schedule: AT_1400 }
    );
    await trackMeetingRow(course.id);
    const firstZoomId = first.body.meeting!.zoomMeetingId;

    const second = await admin.post<MeetingResponse>(
      `/api/admin/courses/${course.id}/lessons/0/zoom-meeting`,
      { force: true, schedule: AT_1400 }
    );

    expect(second.status, second.text).toBe(200);
    expect(second.body.action).toBe("recreated");
    expect(second.body.meeting!.zoomMeetingId).not.toBe(firstZoomId);
    // Same row id, so attendance rows pointing at it survive.
    expect(second.body.meeting!.id).toBe(first.body.meeting!.id);
  });
});

describe("what the route refuses", () => {
  it("will not give an in-person lesson a Zoom room", async () => {
    const course = await createTestCourse({
      lessons: [{ topic: "Танхимын хичээл", mode: "inperson", schedule: AT_1400 }],
    });
    const admin = await adminClient("full");

    const res = await admin.post<MeetingResponse>(
      `/api/admin/courses/${course.id}/lessons/0/zoom-meeting`,
      { schedule: AT_1400 }
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Танхимын");
  });

  it("answers 404 for a lesson index that does not exist", async () => {
    const course = await courseWithLesson(AT_1400);
    const admin = await adminClient("full");

    const res = await admin.post(`/api/admin/courses/${course.id}/lessons/9/zoom-meeting`, {});

    expect(res.status).toBe(404);
  });
});
