/**
 * Сургалтын даалгавар, сорил — an online course's dated homework and test
 * papers, sat like an exam (problems, photos, «Илгээх», teacher's marks).
 *
 * The questions: does the timetable produce the papers; can only the course's
 * own students sit them, only inside their window, and only once; does only a
 * paper handed in count; are they kept out of every placement path; and is
 * the family told when the marks are in.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, signedInClient, type TestClient } from "../../support/client";
import { cleanupTracked, testDb, track, trackBy, trackStorageObject } from "../../support/db";
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

beforeAll(async () => {
  // The placement test open, so "a course paper never turns up there" is
  // asked of a door that is actually open.
  const { error } = await testDb()
    .from("app_settings")
    .upsert({ key: "assessment_enabled", value: "on", updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
});

const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);

const RHYTHM = [
  "Даваа 09:00-аас · Видео хичээл 1 нээгдэнэ",
  "Мягмар 09:00–21:00 · Даалгавар 1: 3–5 бодлого",
  "Лхагва 09:00-аас · Видео хичээл 2 нээгдэнэ",
  "Пүрэв 09:00–21:00 · Даалгавар 2: 3–5 бодлого",
  "Баасан 19:00–21:00 · Zoom хичээл",
  "Ням 09:00–21:00 · Сорил: тухайн долоо хоногийн сэдвээр",
].join("\n");

type Task = { id: string; kind: string; title: string; opensAt: string; closesAt: string; status: string; problemCount: number };

/** A one-week online course with its timetable, as the admin would set it up. */
async function onlineCourse() {
  const course = await createTestCourse({
    template: "online-olympiad",
    lessons: [
      { topic: "Гурвалжин 1 (видео)", schedule: "2026.10.19 Даваа гараг · 09:00", mode: "online" },
      { topic: "Гурвалжин 2 (видео)", schedule: "2026.10.21 Лхагва гараг · 09:00", mode: "online" },
      { topic: "Гурвалжин 3 (Zoom)", schedule: "2026.10.23 Баасан гараг · 19:00–21:00", mode: "online" },
    ],
  });
  await testDb().from("courses").update({ weekly_schedule: RHYTHM }).eq("id", course.id);
  return course;
}

async function generate(admin: TestClient, courseId: string): Promise<Task[]> {
  const res = await admin.post<{ tasks: Task[]; created: number }>(`/api/admin/courses/${courseId}/tasks`, {});
  expect(res.status, res.text).toBe(200);
  for (const t of res.body.tasks) track("exams", t.id);
  return res.body.tasks;
}

async function problem(topic: string) {
  const { data, error } = await testDb()
    .from("problems")
    .insert({ topic, body_latex: `Бодлого ${topic}`, active: true })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  track("problems", (data as { id: string }).id);
  return (data as { id: string }).id;
}

/** A paper with two problems, opened, its window around now. */
async function readyPaper(admin: TestClient, task: Task) {
  const problems = [await problem(`даалгавар-${randomUUID().slice(0, 6)}-1`), await problem(`даалгавар-${randomUUID().slice(0, 6)}-2`)];
  const opened = await admin.put(`/api/admin/course-tasks/${task.id}`, {
    problemIds: problems,
    status: "open",
    opensAt: new Date(Date.now() - 3600_000).toISOString(),
    closesAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  expect(opened.status, opened.text).toBe(200);
  // Unlinked before the problems go — the link holds them against deletion.
  trackBy("exam_problems", "exam_id", task.id);
  return problems;
}

async function student(courseId: string) {
  const user = await createTestUser();
  await createTestRegistration({ userId: user.id, programId: courseId, status: "active" });
  return { user, client: await signedInClient(user.phone, user.password) };
}

async function start(client: TestClient, examId: string) {
  const res = await client.post<{ assessmentId: string; error?: string }>(`/api/course-tasks/${examId}/start`, {});
  if (res.status === 200) track("assessments", res.body.assessmentId);
  return res;
}

async function upload(client: TestClient, assessmentId: string, problemId: string) {
  const body = new FormData();
  body.append("problemId", problemId);
  body.append("files", new Blob([JPEG], { type: "image/jpeg" }), "bodolt.jpg");
  const res = await client.postForm(`/api/assessment/${assessmentId}/solutions`, body);
  if (res.status === 200) {
    const { data } = await testDb().from("solutions").select("image_paths").eq("assessment_id", assessmentId);
    for (const row of (data ?? []) as { image_paths: string[] }[]) for (const p of row.image_paths) trackStorageObject("solutions", p);
  }
  return res;
}

describe("making a course's papers from its timetable", () => {
  it("creates a homework per Мягмар/Пүрэв line and a test per Ням line, once", async () => {
    const admin = await adminClient("full");
    const course = await onlineCourse();
    const tasks = await generate(admin, course.id);
    expect(tasks.map((t) => [t.kind, t.title, t.status, t.problemCount])).toEqual([
      ["homework", "Даалгавар 1: Гурвалжин 1", "draft", 0],
      ["homework", "Даалгавар 2: Гурвалжин 2", "draft", 0],
      ["test", "Сорил 1: Гурвалжин", "draft", 0],
    ]);
    // Мягмар 2026-10-20 09:00–21:00 Ulaanbaatar time.
    expect([tasks[0].opensAt, tasks[0].closesAt].map((t) => new Date(t).toISOString())).toEqual([
      "2026-10-20T01:00:00.000Z",
      "2026-10-20T13:00:00.000Z",
    ]);
    const again = await admin.post<{ created: number }>(`/api/admin/courses/${course.id}/tasks`, {});
    expect(again.body.created).toBe(0);
  });

  it("cannot open a paper with no problems on it", async () => {
    const admin = await adminClient("full");
    const course = await onlineCourse();
    const [first] = await generate(admin, course.id);
    expect((await admin.put(`/api/admin/course-tasks/${first.id}`, { status: "open" })).status).toBe(400);
  });

  it("is the full admin's: a viewer may not create or edit papers", async () => {
    const admin = await adminClient("full");
    const viewer = await adminClient("viewer");
    const course = await onlineCourse();
    const [first] = await generate(admin, course.id);
    expect((await viewer.post(`/api/admin/courses/${course.id}/tasks`, {})).status).toBe(401);
    expect((await viewer.put(`/api/admin/course-tasks/${first.id}`, { status: "open" })).status).toBe(401);
    expect((await viewer.get(`/api/admin/courses/${course.id}/tasks`)).status).toBe(200);
    expect((await viewer.del(`/api/admin/course-tasks/${first.id}`)).status).toBe(401);
  });

  it("shows a read-only admin the paper, but not the bank's answer keys", async () => {
    const admin = await adminClient("full");
    const viewer = await adminClient("viewer");
    const course = await onlineCourse();
    const [first] = await generate(admin, course.id);
    const [onPaper] = await readyPaper(admin, first);
    const secret = `хариу-${randomUUID().slice(0, 8)}`;
    await testDb().from("problems").update({ answer_key: secret, solution_latex: secret }).eq("id", onPaper);
    const page = await viewer.get(`/admin/course-tasks/${first.id}`);
    expect(page.status).toBe(200);
    expect(page.text).not.toContain(secret);
  });

  it("deletes a paper no child has started, and keeps one that a child has", async () => {
    const admin = await adminClient("full");
    const course = await onlineCourse();
    const [first, second] = await generate(admin, course.id);
    expect((await admin.del(`/api/admin/course-tasks/${second.id}`)).status).toBe(200);
    const { data: gone } = await testDb().from("exams").select("id").eq("id", second.id);
    expect(gone).toEqual([]);

    await readyPaper(admin, first);
    const { client } = await student(course.id);
    expect((await start(client, first.id)).status).toBe(200);
    expect((await admin.del(`/api/admin/course-tasks/${first.id}`)).status).toBe(409);
    // The timetable still promises the deleted one, so regenerating makes it
    // again — but never a second copy of the first.
    const again = await admin.post<{ created: number }>(`/api/admin/courses/${course.id}/tasks`, {});
    expect(again.body.created).toBe(1);
    const { data: rows } = await testDb().from("exams").select("id").eq("program_id", course.id);
    for (const row of (rows ?? []) as { id: string }[]) track("exams", row.id);
    expect(rows).toHaveLength(3);
  });

  it("does not make a paper again after its window was moved", async () => {
    const admin = await adminClient("full");
    const course = await onlineCourse();
    const [first] = await generate(admin, course.id);
    const moved = await admin.put(`/api/admin/course-tasks/${first.id}`, {
      opensAt: "2026-10-20T03:00:00.000Z",
      closesAt: "2026-10-20T14:00:00.000Z",
    });
    expect(moved.status, moved.text).toBe(200);
    const again = await admin.post<{ created: number }>(`/api/admin/courses/${course.id}/tasks`, {});
    expect(again.body.created).toBe(0);
  });
});

describe("a student sitting a paper", () => {
  it("starts it inside its window, solves it, hands it in, and sees it marked", async () => {
    const admin = await adminClient("full");
    const course = await onlineCourse();
    const [homework] = await generate(admin, course.id);
    const problems = await readyPaper(admin, homework);
    const { user, client } = await student(course.id);

    const started = await start(client, homework.id);
    expect(started.status, started.text).toBe(200);
    // Pressing it again reopens the same sitting.
    expect((await start(client, homework.id)).body.assessmentId).toBe(started.body.assessmentId);
    const id = started.body.assessmentId;

    const paper = await client.get<{ steps: { problem: { id: string } | null }[] }>(`/api/assessment/${id}/solutions`);
    expect(paper.status, paper.text).toBe(200);
    expect(paper.body.steps.map((s) => s.problem?.id)).toEqual(problems);

    expect((await upload(client, id, problems[0])).status).toBe(200);
    expect((await client.post(`/api/assessment/${id}/skip`, { problemId: problems[1] })).status).toBe(200);
    expect((await client.post(`/api/assessment/${id}/submit`, {})).status).toBe(200);

    // The family's list shows it handed in.
    const page = await client.get(`/profile/course/${course.id}?tab=tasks`);
    expect(page.text).toContain(homework.title);
    expect(page.text).toContain("Илгээсэн");

    // Marked with scores alone — no written verdict needed for homework — and the family is told.
    const { data: solution } = await testDb().from("solutions").select("id").eq("assessment_id", id).single();
    // A course paper is marked like an olympiad: out of 7 a problem, not a placement test's 10.
    const over = await admin.put(`/api/admin/grading/${id}/score`, { solutionId: (solution as { id: string }).id, graderScore: 7.5 });
    expect(over.status, over.text).toBe(400);
    const scored = await admin.put(`/api/admin/grading/${id}/score`, { solutionId: (solution as { id: string }).id, graderScore: 7, graderComment: "Зөв" });
    expect(scored.status, scored.text).toBe(200);
    const done = await admin.put(`/api/admin/grading/${id}/complete`, { teacherComment: "" });
    expect(done.status, done.text).toBe(200);
    const bells = (await notificationsFor(user.id)).filter((n) => n.title === "Даалгаврын дүн гарлаа");
    expect(bells).toHaveLength(1);
    const report = await client.get(`/profile/assessment?a=${id}`);
    expect(report.status).toBe(200);
    expect(report.text).toContain(homework.title);
    // Two problems on the paper, the one given up on included.
    expect(report.text).toContain("7 / 14");
  });

  it("shows the admin, on the paper's page, who has handed it in", async () => {
    const admin = await adminClient("full");
    const course = await onlineCourse();
    const [homework] = await generate(admin, course.id);
    const problems = await readyPaper(admin, homework);
    const handedIn = await student(course.id);
    const halfway = await student(course.id);
    const absent = await student(course.id);

    const a = (await start(handedIn.client, homework.id)).body.assessmentId;
    expect((await upload(handedIn.client, a, problems[0])).status).toBe(200);
    expect((await handedIn.client.post(`/api/assessment/${a}/skip`, { problemId: problems[1] })).status).toBe(200);
    expect((await handedIn.client.post(`/api/assessment/${a}/submit`, {})).status).toBe(200);
    // Photographed one problem and never pressed «Илгээх».
    const b = (await start(halfway.client, homework.id)).body.assessmentId;
    expect((await upload(halfway.client, b, problems[0])).status).toBe(200);

    const page = await admin.get(`/admin/course-tasks/${homework.id}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain("Илгээлт (1 / 3)");
    for (const s of [handedIn, halfway, absent]) expect(page.text).toContain(s.user.firstName);
    expect(page.text).toContain("Илгээсэн");
    expect(page.text).toContain("Эхлүүлсэн");
    expect(page.text).toContain("Эхлүүлээгүй");
    // Only handed-in work opens in the grading queue.
    expect(page.text).toContain(`/admin/grading/${a}`);
    expect(page.text).not.toContain(`/admin/grading/${b}`);
  });

  it("is only for the course's own active students", async () => {
    const admin = await adminClient("full");
    const course = await onlineCourse();
    const [homework] = await generate(admin, course.id);
    await readyPaper(admin, homework);
    const outsider = await createTestUser();
    const client = await signedInClient(outsider.phone, outsider.password);
    expect((await start(client, homework.id)).status).toBe(404);
  });

  it("does not open before its time, and takes nothing after it closes", async () => {
    const admin = await adminClient("full");
    const course = await onlineCourse();
    const [homework] = await generate(admin, course.id);
    const problems = await readyPaper(admin, homework);
    const { client } = await student(course.id);

    await testDb().from("exams").update({ opens_at: new Date(Date.now() + 3600_000).toISOString(), closes_at: new Date(Date.now() + 7200_000).toISOString() }).eq("id", homework.id);
    expect((await start(client, homework.id)).status).toBe(409);

    await testDb().from("exams").update({ opens_at: new Date(Date.now() - 3600_000).toISOString(), closes_at: new Date(Date.now() + 3600_000).toISOString() }).eq("id", homework.id);
    const started = await start(client, homework.id);
    expect(started.status).toBe(200);
    expect((await upload(client, started.body.assessmentId, problems[0])).status).toBe(200);

    // Time is up before «Илгээх»: nothing more goes in, and it does not count.
    await testDb().from("exams").update({ closes_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", homework.id);
    expect((await upload(client, started.body.assessmentId, problems[1])).status).toBe(409);
    expect((await client.post(`/api/assessment/${started.body.assessmentId}/submit`, {})).status).toBe(409);
    const page = await client.get(`/profile/course/${course.id}?tab=tasks`);
    expect(page.text).toContain("Илгээгээгүй");
    const queue = await testDb().from("assessments").select("status").eq("id", started.body.assessmentId).single();
    expect((queue.data as { status: string }).status).toBe("questionnaire_done");
    // Nor can it be marked, and the family is told nothing.
    expect((await admin.put(`/api/admin/grading/${started.body.assessmentId}/complete`, { teacherComment: "" })).status).toBe(409);
  });

  it("keeps a paper the teacher never opened off the child's list once its day has passed", async () => {
    const admin = await adminClient("full");
    const course = await onlineCourse();
    const [homework] = await generate(admin, course.id);
    await testDb()
      .from("exams")
      .update({ opens_at: new Date(Date.now() - 7200_000).toISOString(), closes_at: new Date(Date.now() - 3600_000).toISOString() })
      .eq("id", homework.id);
    const { client } = await student(course.id);
    const page = await client.get(`/profile/course/${course.id}?tab=tasks`);
    expect(page.status).toBe(200);
    expect(page.text).not.toContain(homework.title);
    expect(page.text).not.toContain("Илгээгээгүй");
  });

  it("picks up a sitting left half-made and lays its paper out", async () => {
    const admin = await adminClient("full");
    const course = await onlineCourse();
    const [homework] = await generate(admin, course.id);
    const problems = await readyPaper(admin, homework);
    const { user, client } = await student(course.id);
    const { data, error } = await testDb()
      .from("assessments")
      .insert({ user_id: user.id, amount: "0₮", track: "course", exam_id: homework.id })
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    const stuck = data as { id: string; status: string };
    track("assessments", stuck.id);
    expect(stuck.status).toBe("awaiting_payment");

    const started = await start(client, homework.id);
    expect(started.body.assessmentId).toBe(stuck.id);
    const paper = await client.get<{ steps: { problem: { id: string } | null }[] }>(`/api/assessment/${stuck.id}/solutions`);
    expect(paper.body.steps.map((s) => s.problem?.id)).toEqual(problems);
    // The placement steps are not a way in.
    expect((await client.post(`/api/assessment/${stuck.id}/pay`, {})).status).toBe(404);
    expect((await client.post(`/api/assessment/${stuck.id}/questionnaire`, { grade: "9" })).status).toBe(404);
  });

  it("never turns up in the placement flow", async () => {
    const admin = await adminClient("full");
    const course = await onlineCourse();
    const [homework] = await generate(admin, course.id);
    await readyPaper(admin, homework);
    const { client } = await student(course.id);
    const started = await start(client, homework.id);
    expect(started.status).toBe(200);

    // /assessment resumes an unfinished placement test — this is not one.
    const resume = await client.get<{ assessment: { id: string } | null }>("/api/assessment");
    expect(resume.status, resume.text).toBe(200);
    expect(resume.body.assessment).toBeNull();
    // And the placement results page has nothing running: it offers the level test.
    const results = await client.get("/profile/assessment");
    expect(results.text).toContain("Түвшин тогтоох шалгалт өгөөгүй байна");
    expect(results.text).not.toContain("Шалгалт үргэлжилж байна");
  });
});
