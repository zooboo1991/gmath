/**
 * Хүүхдийн суух гараг — Сонгон ангид зарим хүүхэд ангийн хичээллэдэг өдрүүдийн
 * заримд л ирдэг.
 *
 * The questions: can a full admin add a child for some of the class's days and
 * change them later; is a child left off the register of a lesson on a day
 * they do not attend (and can that register not mark them); does a change from
 * a date leave the registers before it as they were; does the family see their
 * days.
 */

import { afterAll, describe, expect, it } from "vitest";
import { adminClient, signedInClient, type TestClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { createTestCourse, createTestRegistration, createTestUser, trackNotificationsForCreatedUsers } from "../../support/factories";

afterAll(async () => {
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
});

// A Мягмар / Пүрэв / Баасан class, like «Өдрийн анги, Тэгш».
const LESSONS = [
  { topic: "Мягмар 1", schedule: "2026.09.29 Мягмар гараг · 15:30–17:30", mode: "inperson" }, // 0
  { topic: "Пүрэв 1", schedule: "2026.10.01 Пүрэв гараг · 15:30–17:30", mode: "inperson" }, // 1
  { topic: "Баасан 1", schedule: "2026.10.02 Баасан гараг · 16:00–18:00", mode: "inperson" }, // 2
  // Still to come, far enough ahead that the test does not age.
  { topic: "Мягмар 2", schedule: "2099.03.10 Мягмар гараг · 15:30–17:30", mode: "inperson" }, // 3
  { topic: "Баасан 2", schedule: "2099.03.13 Баасан гараг · 16:00–18:00", mode: "inperson" }, // 4
  { topic: "Пүрэв 2", schedule: "2099.03.12 Пүрэв гараг · 15:30–17:30", mode: "inperson" }, // 5
];

type Reg = { id: string; attendDays: { from: string | null; days: number[] | null }[] };

async function register(admin: TestClient, courseId: string, lessonIndex: number) {
  const res = await admin.get<{
    students: { userId: string; present?: boolean }[];
    lesson: { present: number | null; absent: number | null };
    offDay: number;
  }>(
    `/api/admin/roll-call?courseId=${courseId}&lessonIndex=${lessonIndex}`
  );
  expect(res.status, res.text).toBe(200);
  return res.body;
}

const onRegister = async (admin: TestClient, courseId: string, lessonIndex: number) =>
  (await register(admin, courseId, lessonIndex)).students.map((s) => s.userId);

describe("adding a child for some of the class's days", () => {
  it("keeps them off the registers of the other days, and refuses to mark them there", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse({ lessons: LESSONS, template: "songon" });
    const bat = await createTestUser({ firstName: "Бат" });
    const other = await createTestUser();
    await createTestRegistration({ userId: other.id, programId: course.id, status: "active" });

    const added = await admin.post<{ registration: Reg }>("/api/admin/registrations", {
      programId: course.id,
      phone: bat.phone,
      weekdays: [4, 2],
    });
    expect(added.status, added.text).toBe(200);
    track("registrations", added.body.registration.id);
    expect(added.body.registration.attendDays).toEqual([{ from: null, days: [2, 4] }]);

    // Мягмар: both. Баасан: only the other child — this is the owner's "5 дахийн ирц".
    expect(await onRegister(admin, course.id, 0)).toEqual(expect.arrayContaining([bat.id, other.id]));
    const friday = await register(admin, course.id, 2);
    expect(friday.students.map((s) => s.userId)).toContain(other.id);
    expect(friday.students.map((s) => s.userId)).not.toContain(bat.id);
    // The teacher is told one child is missing because of their days.
    expect(friday.offDay).toBe(1);

    // A register opened before the change cannot mark Бат on a Баасан.
    const stale = await admin.put("/api/admin/roll-call", {
      courseId: course.id,
      lessonIndex: 2,
      marks: [
        { userId: other.id, present: true },
        { userId: bat.id, present: false },
      ],
    });
    expect(stale.status).toBe(409);
    const saved = await admin.put("/api/admin/roll-call", {
      courseId: course.id,
      lessonIndex: 2,
      marks: [{ userId: other.id, present: true }],
    });
    expect(saved.status, saved.text).toBe(200);

    // The register list counts the children expected that day.
    const history = await admin.get<{ lessons: { courseId: string; lessonIndex: number; rosterCount: number }[] }>(
      "/api/admin/roll-call?history=1"
    );
    const mine = history.body.lessons.filter((l) => l.courseId === course.id);
    expect(mine.find((l) => l.lessonIndex === 0)?.rosterCount).toBe(2);
    expect(mine.find((l) => l.lessonIndex === 2)?.rosterCount).toBe(1);

    // A child who later leaves the course still counts in the registers taken while they were there.
    await testDb().from("registrations").delete().eq("program_id", course.id).eq("user_id", other.id);
    const after = await admin.get<{ lessons: { courseId: string; lessonIndex: number; present: number | null }[] }>(
      "/api/admin/roll-call?history=1"
    );
    expect(after.body.lessons.find((l) => l.courseId === course.id && l.lessonIndex === 2)?.present).toBe(1);
  });

  it("refuses days the class does not meet on", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse({ lessons: LESSONS });
    const kid = await createTestUser();
    for (const weekdays of [[1], [], [9], "2,4"]) {
      const res = await admin.post("/api/admin/registrations", { programId: course.id, phone: kid.phone, weekdays });
      expect(res.status, JSON.stringify(weekdays)).toBe(400);
    }
    // A class that meets on one day has nothing to choose.
    const oneDay = await createTestCourse({ lessons: [LESSONS[0], LESSONS[3]] });
    const reg = await createTestRegistration({ userId: kid.id, programId: oneDay.id, status: "active" });
    const res = await admin.put(`/api/admin/registrations/${reg.id}/weekdays`, { weekdays: [2], from: null });
    expect(res.status).toBe(400);
    // Clearing a restriction is always possible, even there.
    const reset = await admin.put(`/api/admin/registrations/${reg.id}/weekdays`, { weekdays: null, from: null });
    expect(reset.status, reset.text).toBe(200);
  });
});

describe("changing a child's days", () => {
  it("from a date leaves the registers before it as they were", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse({ lessons: LESSONS, template: "songon" });
    const bat = await createTestUser({ firstName: "Бат" });
    const reg = await createTestRegistration({ userId: bat.id, programId: course.id, status: "active" });

    // Marked absent on the first Баасан, while still down for every day.
    await admin.put("/api/admin/roll-call", { courseId: course.id, lessonIndex: 2, marks: [{ userId: bat.id, present: false }] });

    const changed = await admin.put<{ registration: Reg }>(`/api/admin/registrations/${reg.id}/weekdays`, {
      weekdays: [2, 4],
      from: "2026-10-10",
    });
    expect(changed.status, changed.text).toBe(200);
    expect(changed.body.registration.attendDays).toEqual([{ from: "2026-10-10", days: [2, 4] }]);

    // The Баасан before the change still lists Бат and his absence; the one after does not list him.
    const before = await register(admin, course.id, 2);
    expect(before.students.find((s) => s.userId === bat.id)?.present).toBe(false);
    expect(before.lesson.absent).toBe(1);
    expect(await onRegister(admin, course.id, 4)).not.toContain(bat.id);
    expect(await onRegister(admin, course.id, 3)).toContain(bat.id);

    // Set from the start, the old Баасан absence no longer counts against him.
    await admin.put(`/api/admin/registrations/${reg.id}/weekdays`, { weekdays: [2, 4], from: null });
    const rewritten = await register(admin, course.id, 2);
    expect(rewritten.students.map((s) => s.userId)).not.toContain(bat.id);
    expect(rewritten.lesson.absent).toBeNull();

    // Back to every day.
    const all = await admin.put<{ registration: Reg }>(`/api/admin/registrations/${reg.id}/weekdays`, { weekdays: null, from: null });
    expect(all.body.registration.attendDays).toEqual([]);
    expect(await onRegister(admin, course.id, 4)).toContain(bat.id);

    // Bad input changes nothing.
    for (const body of [{ weekdays: [1], from: null }, { weekdays: [2], from: "2026-02-31" }, { from: null }]) {
      expect((await admin.put(`/api/admin/registrations/${reg.id}/weekdays`, body)).status, JSON.stringify(body)).toBe(400);
    }
    const { data } = await testDb().from("registrations").select("attend_days").eq("id", reg.id).single();
    expect((data as { attend_days: unknown }).attend_days).toBeNull();
  });

  it("tells the family which days their child attends", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse({ lessons: LESSONS, template: "songon" });
    const bat = await createTestUser({ firstName: "Бат" });
    const reg = await createTestRegistration({ userId: bat.id, programId: course.id, status: "active" });
    await admin.put(`/api/admin/registrations/${reg.id}/weekdays`, { weekdays: [2, 4], from: null });

    const family = await signedInClient(bat.phone, bat.password);
    const page = await family.get(`/profile/course/${course.id}?tab=attendance`);
    expect(page.status).toBe(200);
    expect(page.text).toContain("Мягмар, Пүрэв гарагт суудаг");
    // Still to come: Мягмар and Пүрэв in 2099 — not Баасан.
    expect(page.text).toMatch(/Цаашид (<!-- -->)?2(<!-- -->)? хичээл байна/);

    // A change set for later is announced, while today's days still show.
    await admin.put(`/api/admin/registrations/${reg.id}/weekdays`, { weekdays: [2], from: "2099-01-01" });
    const later = await family.get(`/profile/course/${course.id}?tab=attendance`);
    expect(later.text).toContain("Мягмар, Пүрэв гарагт суудаг");
    expect(later.text).toContain("2099.01.01 өдрөөс Мягмар гарагт суудаг");
  });
});
