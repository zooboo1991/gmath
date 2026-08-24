/**
 * Named admin accounts, and what a teacher's account may do.
 *
 * Until now "admin" was one shared password: everyone who had it could do
 * everything, and admin_logs could only record what happened, never who. A
 * teacher account exists so attendance and marking can be delegated — which
 * means the interesting question is not what it can do but what it cannot.
 *
 * Money is the line. A teacher must never confirm a registration, record a
 * payment, or change what a course costs, and no amount of hiding buttons
 * enforces that — only these checks do.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, anonClient, staffClient, TestClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { createTestCourse, createTestRegistration, createTestUser } from "../../support/factories";

const created: string[] = [];

afterAll(async () => {
  for (const id of created) await testDb().from("admin_users").delete().eq("id", id);
  await cleanupTracked();
});

async function makeTeacher(): Promise<TestClient> {
  const owner = await adminClient("full");
  const run = randomUUID().slice(0, 8);
  const { client, id } = await staffClient(owner, {
    name: "Тест багш",
    username: `teacher-${run}`,
    password: "TeacherPass-2026",
    role: "teacher",
  });
  created.push(id);
  return client;
}

describe("what a teacher's account may do", () => {
  it("saves a lesson schedule", async () => {
    const teacher = await makeTeacher();
    const course = await createTestCourse({ lessons: [] });

    const res = await teacher.put(`/api/admin/courses/${course.id}/lessons`, {
      lessons: [{ topic: "Логик бодлогууд", mode: "online", schedule: "2026.09.01 Мягмар гараг · 19:00–21:00" }],
    });

    expect(res.status, res.text).toBe(200);
    const { data } = await testDb().from("courses").select("lessons").eq("id", course.id).single();
    expect((data as { lessons: unknown[] }).lessons).toHaveLength(1);
  });

  it("reads the grading queue", async () => {
    const teacher = await makeTeacher();
    expect((await teacher.get("/api/admin/grading")).status).toBe(200);
  });

  it("creates a Zoom meeting for a lesson", async () => {
    const teacher = await makeTeacher();
    const course = await createTestCourse({
      lessons: [{ topic: "Амьд хичээл", mode: "online", schedule: "2026.09.02 Лхагва гараг · 19:00–21:00" }],
    });

    const res = await teacher.post(`/api/admin/courses/${course.id}/lessons/0/zoom-meeting`, {
      schedule: "2026.09.02 Лхагва гараг · 19:00–21:00",
    });

    expect(res.status, res.text).toBe(200);
    const { data } = await testDb().from("lesson_meetings").select("id").eq("course_id", course.id);
    for (const row of (data ?? []) as { id: string }[]) track("lesson_meetings", row.id);
  });

  it("asks for a place to upload a lesson's notes", async () => {
    const teacher = await makeTeacher();
    const res = await teacher.post("/api/admin/lesson-note", { size: 1000 });
    expect(res.status, res.text).toBe(200);
  });
});

describe("what a teacher's account may not do", () => {
  it("cannot touch money or seats", async () => {
    const teacher = await makeTeacher();
    const course = await createTestCourse();
    const user = await createTestUser();
    const registration = await createTestRegistration({
      userId: user.id,
      programId: course.id,
      payMethod: "bank",
      status: "pending",
    });

    const refused = [
      { method: "POST", path: `/api/admin/registrations/${registration.id}/approve`, body: {} },
      { method: "POST", path: `/api/admin/registrations/${registration.id}/cancel`, body: {} },
      { method: "POST", path: `/api/admin/registrations/${registration.id}/payments`, body: { amount: 1, paidAt: "2026-09-01" } },
      { method: "POST", path: `/api/admin/registrations/${registration.id}/settle-manual`, body: { amount: 1, paidAt: "2026-09-01" } },
      { method: "POST", path: "/api/admin/registrations", body: {} },
      { method: "DELETE", path: `/api/admin/registrations/${registration.id}`, body: undefined },
    ] as const;

    for (const route of refused) {
      const res =
        route.method === "POST"
          ? await teacher.post(route.path, route.body)
          : await teacher.del(route.path);
      expect(res.status, `${route.method} ${route.path}`).toBe(401);
    }

    // And the registration is untouched.
    const { data } = await testDb().from("registrations").select("status").eq("id", registration.id).single();
    expect((data as { status: string }).status).toBe("pending");
  });

  it("cannot change a course's own fields", async () => {
    const teacher = await makeTeacher();
    const course = await createTestCourse({ price: "100,000₮" });

    const res = await teacher.put(`/api/admin/courses/${course.id}`, {
      kind: "upcoming",
      status: "published",
      tag: "C ангилал",
      title: "Хакердсан гарчиг",
      topics: "сэдэв",
      price: "1₮",
      period: "4 долоо хоног",
    });

    expect(res.status).toBe(401);
    const { data } = await testDb().from("courses").select("price").eq("id", course.id).single();
    expect((data as { price: string }).price).toBe("100,000₮");
  });

  it("cannot reach the other admin sections", async () => {
    const teacher = await makeTeacher();
    // Each route asked with a method it actually implements — a 405 would
    // "pass" a permission test while proving nothing about permissions.
    const refused = [
      { method: "POST", path: "/api/admin/users" },
      { method: "GET", path: "/api/admin/articles" },
      { method: "GET", path: "/api/admin/certificates" },
      { method: "GET", path: "/api/admin/notifications" },
      { method: "GET", path: "/api/admin/settings" },
      { method: "PUT", path: "/api/admin/settings" },
      { method: "GET", path: "/api/admin/staff" },
      { method: "GET", path: "/api/admin/logs" },
      { method: "GET", path: "/api/admin/problems" },
      { method: "POST", path: "/api/admin/exams" },
    ] as const;

    for (const route of refused) {
      const res =
        route.method === "GET"
          ? await teacher.get(route.path)
          : route.method === "POST"
            ? await teacher.post(route.path, {})
            : await teacher.put(route.path, {});
      expect(res.status, `${route.method} ${route.path}`).toBe(401);
    }
  });

  it("cannot create accounts, least of all its own promotion", async () => {
    const teacher = await makeTeacher();
    const res = await teacher.post("/api/admin/staff", {
      name: "Өөрөө",
      username: `promoted-${randomUUID().slice(0, 6)}`,
      password: "Password-2026",
      role: "full",
    });
    expect(res.status).toBe(401);
  });
});

describe("the accounts themselves", () => {
  it("refuses a login for a deactivated account", async () => {
    const owner = await adminClient("full");
    const run = randomUUID().slice(0, 8);
    const { client, id } = await staffClient(owner, {
      name: "Хаагдах багш",
      username: `off-${run}`,
      password: "TeacherPass-2026",
      role: "teacher",
    });
    created.push(id);
    // Works before.
    expect((await client.get("/api/admin/grading")).status).toBe(200);

    expect((await owner.put(`/api/admin/staff/${id}`, { active: false })).status).toBe(200);

    const again = anonClient();
    const res = await again.post("/api/admin/login", {
      username: `off-${run}`,
      password: "TeacherPass-2026",
    });
    expect(res.status).toBe(401);
  });

  it("records who did it in the audit log", async () => {
    const teacher = await makeTeacher();
    const course = await createTestCourse({ lessons: [] });

    await teacher.put(`/api/admin/courses/${course.id}/lessons`, {
      lessons: [{ topic: "Нэрээр бүртгэгдэх", mode: "online" }],
    });

    const { data } = await testDb()
      .from("admin_logs")
      .select("action_type, actor_name")
      .eq("target_id", course.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as { action_type: string; actor_name: string | null };
    expect(row.action_type).toBe("lesson.schedule_update");
    expect(row.actor_name).toBe("Тест багш");
  });

  it("refuses a username that could not be typed at a login form", async () => {
    const owner = await adminClient("full");
    for (const username of ["ab", "Багш", "with space", "a".repeat(40)]) {
      const res = await owner.post("/api/admin/staff", {
        name: "Тест",
        username,
        password: "Password-2026",
        role: "teacher",
      });
      expect(res.status, username).toBe(400);
    }
  });

  it("refuses a short password", async () => {
    const owner = await adminClient("full");
    const res = await owner.post("/api/admin/staff", {
      name: "Тест",
      username: `short-${randomUUID().slice(0, 6)}`,
      password: "1234",
      role: "teacher",
    });
    expect(res.status).toBe(400);
  });
});
