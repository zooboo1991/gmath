/**
 * Notification links — a notification is now a door, not a note.
 *
 * Clicking one used to open a modal with the same text the student had
 * already read; getting to the lesson, the article, or the Zoom room was
 * their own problem. Each notification now carries a `link`, shared by the
 * bell item and the push click.
 *
 * The lesson reminder's link is the interesting one: it goes through
 * GET /api/lessons/join, which resolves a personal registrant URL for tracked
 * meetings (attendance!) and only falls back to the shared room link — so the
 * redirect chain is what these tests hold down.
 */

import { afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, signedInClient } from "../../support/client";
import { cleanupTracked, testDb } from "../../support/db";
import {
  createTestCourse,
  createTestRegistration,
  createTestUser,
  notificationsFor,
  trackNotificationsForCreatedUsers,
} from "../../support/factories";

afterAll(async () => {
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
});

const ZOOM = "https://us06web.zoom.us/j/87348328428";

/** The notification rows a user got, with their links, tracked for cleanup. */
async function notificationLinksFor(userId: string): Promise<{ title: string; link: string | null }[]> {
  await notificationsFor(userId); // registers them for cleanup
  const { data, error } = await testDb()
    .from("notification_recipients")
    .select("notifications(title, link)")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  type Row = { notifications: { title: string; link: string | null } | null };
  return (data as unknown as Row[]).map((r) => r.notifications!).filter(Boolean);
}

describe("what each automatic notification points at", () => {
  it("a confirmed registration points at that course's own card", async () => {
    const course = await createTestCourse();
    const user = await createTestUser();
    const registration = await createTestRegistration({
      userId: user.id,
      programId: course.id,
      payMethod: "bank",
      status: "pending",
    });

    const admin = await adminClient("full");
    expect((await admin.post(`/api/admin/registrations/${registration.id}/approve`)).status).toBe(200);

    const links = await notificationLinksFor(user.id);
    expect(links).toContainEqual({
      title: "Төлбөр баталгаажлаа",
      link: `/profile?course=${encodeURIComponent(course.id)}`,
    });
  });

  it("a new recording points at the course card where its play button is", async () => {
    const course = await createTestCourse({
      lessons: [{ topic: "Логик бодлогууд", mode: "online" }],
    });
    const user = await createTestUser();
    await createTestRegistration({ userId: user.id, programId: course.id, status: "active" });

    const admin = await adminClient("full");
    const res = await admin.put(`/api/admin/courses/${course.id}`, {
      kind: "upcoming",
      status: "published",
      tag: "C ангилал",
      title: course.title,
      topics: "сэдэв",
      price: course.price,
      period: "4 долоо хоног",
      lessons: [
        {
          topic: "Логик бодлогууд",
          mode: "online",
          recordingLink: "73b1b96f-825f-48bf-a1a2-1209cb7d85ba",
        },
      ],
    });
    expect(res.status, res.text).toBe(200);

    // The PUT fires the notification without awaiting it (a slow SMS gateway
    // must not hold the admin's save hostage), so this read is a race the
    // test would lose more often than not. Poll briefly instead.
    let links: { title: string; link: string | null }[] = [];
    for (let i = 0; i < 20 && links.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      links = await notificationLinksFor(user.id);
    }
    expect(links).toContainEqual({
      title: "Хичээлийн бичлэг орлоо",
      link: `/profile?course=${encodeURIComponent(course.id)}`,
    });
  });
});

describe("an admin-composed notification with a link", () => {
  it("stores the link and shows it to the recipient", async () => {
    const user = await createTestUser();
    const admin = await adminClient("full");

    const res = await admin.post("/api/admin/notifications", {
      title: "Шинэ анги нээгдлээ",
      body: "Сонгон бэлтгэлийн 5-р ангид бүртгэл эхэллээ.",
      targetType: "users",
      userIds: [user.id],
      channel: "site",
      link: "/courses/songon5",
    });
    expect(res.status, res.text).toBe(200);

    const student = await signedInClient(user.phone, user.password);
    const list = await student.get<{ notifications: { title: string; link?: string }[] }>("/api/notifications");
    expect(list.status).toBe(200);
    expect(list.body.notifications).toContainEqual(
      expect.objectContaining({ title: "Шинэ анги нээгдлээ", link: "/courses/songon5" })
    );
  });

  it("refuses a link a click could not open", async () => {
    const user = await createTestUser();
    const admin = await adminClient("full");

    for (const link of ["gmath.mn/courses", "javascript:alert(1)", "ftp://x", "  "]) {
      const res = await admin.post("/api/admin/notifications", {
        title: "Тест",
        body: "Тест",
        targetType: "users",
        userIds: [user.id],
        channel: "site",
        link,
      });
      // "  " trims to nothing, which is simply "no link" — the others are 400.
      if (link.trim()) expect(res.status, link).toBe(400);
      else expect(res.status, link).toBe(200);
    }
  });
});

describe("GET /api/lessons/join — the reminder's landing", () => {
  it("sends a signed-out click to the profile's sign-in", async () => {
    const res = await anonClient().get("/api/lessons/join?courseId=x&lessonIndex=0");
    expect([302, 307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/profile");
  });

  it("redirects an active student into the Zoom room", async () => {
    const course = await createTestCourse({
      lessons: [{ topic: "Амьд хичээл", mode: "online", zoomLink: ZOOM }],
    });
    const user = await createTestUser();
    await createTestRegistration({ userId: user.id, programId: course.id, status: "active" });
    const student = await signedInClient(user.phone, user.password);

    const res = await student.get(
      `/api/lessons/join?courseId=${course.id}&lessonIndex=0`
    );

    expect([302, 307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toBe(ZOOM);
  });

  it("sends anyone not registered on the course back to the profile", async () => {
    const course = await createTestCourse({
      lessons: [{ topic: "Амьд хичээл", mode: "online", zoomLink: ZOOM }],
    });
    const outsider = await createTestUser();
    const client = await signedInClient(outsider.phone, outsider.password);

    const res = await client.get(`/api/lessons/join?courseId=${course.id}&lessonIndex=0`);

    expect([302, 307, 308]).toContain(res.status);
    // Back to their own page — never into a room they did not pay for.
    expect(res.headers.get("location")).toContain("/profile");
    expect(res.headers.get("location")).not.toBe(ZOOM);
  });

  it("shrugs off a malformed query instead of erroring", async () => {
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    for (const q of ["", "?courseId=x", "?courseId=x&lessonIndex=-1", "?courseId=x&lessonIndex=abc"]) {
      const res = await client.get(`/api/lessons/join${q}`);
      expect([302, 307, 308], q).toContain(res.status);
      expect(res.headers.get("location"), q).toContain("/profile");
    }
  });
});
