/**
 * Issuing a finished course's certificates from the course page.
 *
 * The numbers are the point: students and teachers run in their own series,
 * a second press must not hand anyone a second certificate, and a batch has
 * to continue after whatever the month already holds.
 */

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { adminClient, staffClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { createTestCourse, createTestRegistration, createTestUser } from "../../support/factories";

const staffAccounts: string[] = [];

afterAll(async () => {
  for (const id of staffAccounts) await testDb().from("admin_users").delete().eq("id", id);
  await cleanupTracked();
});

type IssueResult = { created: number; skipped: number; certificates: { certificateNumber: string; phone: string }[] };

/** A finished course with two students and one teacher on its roster. */
async function courseWithRoster() {
  const course = await createTestCourse();
  const students = [await createTestUser(), await createTestUser()];
  const teacher = await createTestUser({ role: "teacher" });
  for (const user of [...students, teacher]) {
    await createTestRegistration({ userId: user.id, programId: course.id, status: "active" });
  }
  return { course, students, teacher };
}

/** Certificates issued in this test run, tracked so cleanup takes them. */
async function trackIssued(numbers: string[]) {
  const { data } = await testDb().from("certificates").select("id").in("certificate_number", numbers);
  for (const row of (data ?? []) as { id: string }[]) track("certificates", row.id);
}

const body = (course: string, issuedDate = "2026-08-24") => ({
  course,
  studentCategory: "Тест ангилал",
  teacherCategory: "Багш",
  issuedDate,
});

describe("issuing a course's certificates", () => {
  it("gives every confirmed student and teacher one, in their own series", async () => {
    const admin = await adminClient("full");
    const { course, students, teacher } = await courseWithRoster();
    const courseName = `TEST-${course.id.slice(0, 8)}`;

    const res = await admin.post<IssueResult>(
      `/api/admin/courses/${course.id}/certificates`,
      body(courseName)
    );
    expect(res.status, res.text).toBe(200);
    await trackIssued(res.body.certificates.map((c) => c.certificateNumber));

    expect(res.body.created).toBe(3);
    expect(res.body.skipped).toBe(0);

    const byPhone = new Map(res.body.certificates.map((c) => [c.phone, c.certificateNumber]));
    expect(byPhone.get(teacher.phone)).toMatch(/^T2608\d{3}$/);
    for (const student of students) {
      expect(byPhone.get(student.phone)).toMatch(/^S2608\d{3}$/);
    }
    // Two students, two different numbers.
    expect(new Set(byPhone.values()).size).toBe(3);
  });

  it("does not hand anyone a second one when pressed again", async () => {
    const admin = await adminClient("full");
    const { course } = await courseWithRoster();
    const courseName = `TEST-${course.id.slice(0, 8)}`;

    const first = await admin.post<IssueResult>(
      `/api/admin/courses/${course.id}/certificates`,
      body(courseName)
    );
    await trackIssued(first.body.certificates.map((c) => c.certificateNumber));

    const second = await admin.post<IssueResult>(
      `/api/admin/courses/${course.id}/certificates`,
      body(courseName)
    );
    expect(second.status, second.text).toBe(200);
    expect(second.body.created).toBe(0);
    expect(second.body.skipped).toBe(3);
  });

  it("continues the month's numbering for the next course", async () => {
    const admin = await adminClient("full");
    const one = await courseWithRoster();
    const two = await courseWithRoster();

    const first = await admin.post<IssueResult>(
      `/api/admin/courses/${one.course.id}/certificates`,
      body(`TEST-${one.course.id.slice(0, 8)}`)
    );
    await trackIssued(first.body.certificates.map((c) => c.certificateNumber));
    const second = await admin.post<IssueResult>(
      `/api/admin/courses/${two.course.id}/certificates`,
      body(`TEST-${two.course.id.slice(0, 8)}`)
    );
    await trackIssued(second.body.certificates.map((c) => c.certificateNumber));

    const run = (number: string) => Number(number.slice(5));
    const firstStudents = first.body.certificates.filter((c) => c.certificateNumber.startsWith("S"));
    const secondStudents = second.body.certificates.filter((c) => c.certificateNumber.startsWith("S"));
    expect(Math.min(...secondStudents.map((c) => run(c.certificateNumber)))).toBeGreaterThan(
      Math.max(...firstStudents.map((c) => run(c.certificateNumber)))
    );
  });

  it("skips a pending registration — only confirmed students get one", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse();
    const waiting = await createTestUser();
    await createTestRegistration({ userId: waiting.id, programId: course.id, status: "pending" });

    const res = await admin.post<IssueResult>(
      `/api/admin/courses/${course.id}/certificates`,
      body(`TEST-${course.id.slice(0, 8)}`)
    );
    expect(res.status, res.text).toBe(200);
    expect(res.body.created).toBe(0);
  });

  it("refuses a batch with no course written on it", async () => {
    const admin = await adminClient("full");
    const { course } = await courseWithRoster();

    const res = await admin.post<{ error: string }>(`/api/admin/courses/${course.id}/certificates`, {
      ...body(""),
    });
    expect(res.status).toBe(400);
  });

  it("is refused to a teacher's account — a certificate is the school's word", async () => {
    const owner = await adminClient("full");
    const { course } = await courseWithRoster();
    const { client, id } = await staffClient(owner, {
      name: "Тест багш",
      username: `cert-teacher-${randomUUID().slice(0, 8)}`,
      password: "TeacherPass-2026",
      role: "teacher",
    });
    staffAccounts.push(id);

    const res = await client.post(`/api/admin/courses/${course.id}/certificates`, {
      ...body(`TEST-${course.id.slice(0, 8)}`),
    });
    expect(res.status).toBe(401);
  });
});
