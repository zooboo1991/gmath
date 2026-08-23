/**
 * Exams — the teacher composes a paper, the child sits it.
 *
 * This replaced an engine that chose problems per child by difficulty. The
 * properties that matter now are different: every child on an exam gets the
 * same problems in the same order (so two results can be compared at all), a
 * child only ever meets the exam for their own category, and the price is the
 * exam's — zero for the children the teacher put on its free list.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, anonClient, signedInClient, TestClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { createTestCourse, createTestRegistration, createTestUser } from "../../support/factories";

/** Switches the site-wide "түвшин тогтоох" gate. */
async function setAssessmentSwitch(value: "on" | "off") {
  const { error } = await testDb()
    .from("app_settings")
    .upsert({ key: "assessment_enabled", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  // The switch is shared state in a shared database, and a run interrupted
  // mid-test leaves it wherever it was — which then fails every later test
  // for a reason that has nothing to do with them. Start from a known state
  // rather than trusting the last run to have cleaned up after itself.
  await setAssessmentSwitch("on");
});

afterAll(async () => {
  await cleanupTracked();
});

async function createProblem(category: "C" | "D", topic: string) {
  const { data, error } = await testDb()
    .from("problems")
    .insert({ category, topic, body_latex: `Бодлого ${topic}`, active: true })
    .select("id")
    .single();
  if (error) throw new Error(`createProblem failed: ${error.message}`);
  const id = (data as { id: string }).id;
  track("problems", id);
  return id;
}

/** An open exam with `count` problems, built through the real admin endpoints. */
async function createExam(
  admin: TestClient,
  options: { category?: "C" | "D"; fee?: string; count?: number; open?: boolean; freeCourseIds?: string[] } = {}
) {
  const category = options.category ?? "C";
  const run = randomUUID().slice(0, 8);
  const problemIds: string[] = [];
  for (let i = 0; i < (options.count ?? 2); i += 1) {
    problemIds.push(await createProblem(category, `${category}-${run}-${i}`));
  }

  const created = await admin.post<{ exam: { id: string } }>("/api/admin/exams", {
    title: `Тест шалгалт ${run}`,
    category,
    fee: options.fee ?? "20,000₮",
  });
  if (created.status !== 200) throw new Error(`exam create failed: ${created.text}`);
  const examId = created.body.exam.id;
  track("exams", examId);

  const saved = await admin.put(`/api/admin/exams/${examId}`, {
    problemIds,
    freeCourseIds: options.freeCourseIds ?? [],
    ...(options.open === false ? {} : { status: "open" }),
  });
  if (saved.status !== 200) throw new Error(`exam save failed: ${saved.text}`);
  return { examId, problemIds };
}

/** Starts the olympiad flow for a child of this grade. */
async function startFor(grade: string) {
  const user = await createTestUser({ grade });
  const client = await signedInClient(user.phone, user.password);
  const started = await client.post<{
    assessment?: { id: string; amount: string; examId?: string };
    exam?: { id: string; title: string };
    free?: boolean;
    error?: string;
  }>("/api/assessment", { track: "olympiad" });
  return { user, client, started };
}

describe("a child sitting an exam", () => {
  it("is given the exam's problems, in the teacher's order", async () => {
    const admin = await adminClient("full");
    const { examId, problemIds } = await createExam(admin, { category: "C", count: 3 });

    const { client, started } = await startFor("5");
    expect(started.status, started.text).toBe(200);
    expect(started.body.assessment?.examId).toBe(examId);
    const assessmentId = started.body.assessment!.id;

    // Pay, then answer the questionnaire — the paper is laid out at that point.
    await testDb().from("assessments").update({ status: "paid" }).eq("id", assessmentId);
    const questionnaire = await client.post(`/api/assessment/${assessmentId}/questionnaire`, {
      grade: "5",
      age: 11,
    });
    expect(questionnaire.status, questionnaire.text).toBe(200);

    const { data } = await testDb()
      .from("assessment_problems")
      .select("problem_id, action, shown_order")
      .eq("assessment_id", assessmentId)
      .order("shown_order");
    const rows = data as { problem_id: string; action: string }[];
    expect(rows.map((r) => r.problem_id)).toEqual(problemIds);
    expect(rows.every((r) => r.action === "solving")).toBe(true);
  });

  it("does not lay the paper out twice when the questionnaire is re-submitted", async () => {
    const admin = await adminClient("full");
    await createExam(admin, { category: "D", count: 2 });

    const { client, started } = await startFor("7");
    const assessmentId = started.body.assessment!.id;
    await testDb().from("assessments").update({ status: "paid" }).eq("id", assessmentId);

    await client.post(`/api/assessment/${assessmentId}/questionnaire`, { grade: "7" });
    await client.post(`/api/assessment/${assessmentId}/questionnaire`, { grade: "8" });

    const { count } = await testDb()
      .from("assessment_problems")
      .select("problem_id", { count: "exact", head: true })
      .eq("assessment_id", assessmentId);
    expect(count).toBe(2);
  });

  it("is charged the exam's own fee", async () => {
    const admin = await adminClient("full");
    await createExam(admin, { category: "C", fee: "35,000₮" });

    const { started } = await startFor("6");

    expect(started.body.assessment?.amount).toBe("35,000₮");
    expect(started.body.free).toBe(false);
  });

  it("pays nothing when their course is on the exam's free list", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse();
    const user = await createTestUser({ grade: "5" });
    await createTestRegistration({ userId: user.id, programId: course.id, status: "active" });
    await createExam(admin, { category: "C", fee: "35,000₮", freeCourseIds: [course.id] });

    const client = await signedInClient(user.phone, user.password);
    const started = await client.post<{ assessment: { id: string; amount: string }; free: boolean }>(
      "/api/assessment",
      { track: "olympiad" }
    );
    expect(started.body.free).toBe(true);
    expect(started.body.assessment.amount).toBe("0₮");

    // And paying is a no-op that just opens the test — no invoice, no QPay.
    const paid = await client.post<{ paid: boolean; free: boolean }>(
      `/api/assessment/${started.body.assessment.id}/pay`
    );
    expect(paid.status, paid.text).toBe(200);
    expect(paid.body.paid).toBe(true);
    const { data } = await testDb()
      .from("assessments")
      .select("status, payment_invoice_id")
      .eq("id", started.body.assessment.id)
      .single();
    expect((data as { status: string }).status).toBe("paid");
    expect((data as { payment_invoice_id: string | null }).payment_invoice_id).toBeNull();
  });

  it("is told plainly when their category has no open exam", async () => {
    const admin = await adminClient("full");
    // Open one for the other category only.
    await createExam(admin, { category: "D" });
    // Close every C exam so the state is unambiguous.
    await testDb().from("exams").update({ status: "closed" }).eq("category", "C");

    const { started } = await startFor("5");

    expect(started.status).toBe(409);
    expect(started.body.error).toContain("нээлттэй шалгалт алга");
  });

  it("never gets the other category's exam", async () => {
    const admin = await adminClient("full");
    const { examId: cExam } = await createExam(admin, { category: "C" });
    const { examId: dExam } = await createExam(admin, { category: "D" });

    const fifth = await startFor("5");
    const seventh = await startFor("7");

    expect(fifth.started.body.assessment?.examId).toBe(cExam);
    expect(seventh.started.body.assessment?.examId).toBe(dExam);
  });
});

describe("composing an exam", () => {
  it("refuses to open one with no problems on it", async () => {
    const admin = await adminClient("full");
    const created = await admin.post<{ exam: { id: string } }>("/api/admin/exams", {
      title: "Хоосон шалгалт",
      category: "C",
      fee: "10,000₮",
    });
    track("exams", created.body.exam.id);

    const res = await admin.put<{ error: string }>(`/api/admin/exams/${created.body.exam.id}`, {
      status: "open",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Бодлогогүй");
  });

  it("keeps the order the teacher chose, including after a re-save", async () => {
    const admin = await adminClient("full");
    const { examId, problemIds } = await createExam(admin, { count: 3 });
    const reversed = [...problemIds].reverse();

    await admin.put(`/api/admin/exams/${examId}`, { problemIds: reversed });

    const res = await admin.get<{ exam: { problems: { id: string }[] } }>(`/api/admin/exams/${examId}`);
    expect(res.body.exam.problems.map((p) => p.id)).toEqual(reversed);
  });

  it("is admin-only, end to end", async () => {
    const admin = await adminClient("full");
    const { examId } = await createExam(admin);
    const viewer = await adminClient("viewer");

    expect((await anonClient().get("/api/admin/exams")).status).toBe(401);
    expect((await viewer.get("/api/admin/exams")).status).toBe(401);
    expect((await viewer.post("/api/admin/exams", { title: "x", category: "C" })).status).toBe(401);
    expect((await viewer.put(`/api/admin/exams/${examId}`, { title: "x" })).status).toBe(401);
    expect((await viewer.del(`/api/admin/exams/${examId}`)).status).toBe(401);
  });

  it("refuses a title or category it cannot use", async () => {
    const admin = await adminClient("full");
    for (const body of [
      { title: "", category: "C" },
      { title: "Нэр", category: "A" },
      { title: "Нэр" },
      {},
    ]) {
      expect((await admin.post("/api/admin/exams", body)).status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe("free by course, not by name", () => {
  it("charges a child whose course is not on the list", async () => {
    const admin = await adminClient("full");
    const listed = await createTestCourse();
    const other = await createTestCourse();
    const user = await createTestUser({ grade: "5" });
    await createTestRegistration({ userId: user.id, programId: other.id, status: "active" });
    await createExam(admin, { category: "C", fee: "35,000₮", freeCourseIds: [listed.id] });

    const client = await signedInClient(user.phone, user.password);
    const started = await client.post<{ free: boolean; assessment: { amount: string } }>("/api/assessment", {
      track: "olympiad",
    });

    expect(started.body.free).toBe(false);
    expect(started.body.assessment.amount).toBe("35,000₮");
  });

  it("charges a child whose registration is still pending", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse();
    const user = await createTestUser({ grade: "6" });
    // Enrolled but not paid: not yet a student of that course.
    await createTestRegistration({ userId: user.id, programId: course.id, status: "pending" });
    await createExam(admin, { category: "C", fee: "35,000₮", freeCourseIds: [course.id] });

    const client = await signedInClient(user.phone, user.password);
    const started = await client.post<{ free: boolean }>("/api/assessment", { track: "olympiad" });

    expect(started.body.free).toBe(false);
  });

  it("includes a child who enrols after the exam was set up", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse();
    await createExam(admin, { category: "D", fee: "35,000₮", freeCourseIds: [course.id] });

    // The list names a course, not people, so this child counts from the
    // moment their registration goes active.
    const user = await createTestUser({ grade: "7" });
    await createTestRegistration({ userId: user.id, programId: course.id, status: "active" });

    const client = await signedInClient(user.phone, user.password);
    const started = await client.post<{ free: boolean }>("/api/assessment", { track: "olympiad" });

    expect(started.body.free).toBe(true);
  });
});

describe("an invited class while the assessment is closed", () => {
  afterEach(async () => {
    await setAssessmentSwitch("on");
  });

  it("lets the invited child in, and keeps everyone else out", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse();
    const invited = await createTestUser({ grade: "5" });
    await createTestRegistration({ userId: invited.id, programId: course.id, status: "active" });
    await createExam(admin, { category: "C", fee: "35,000₮", freeCourseIds: [course.id] });

    const outsider = await createTestUser({ grade: "5" });

    await setAssessmentSwitch("off");

    const invitedClient = await signedInClient(invited.phone, invited.password);
    const started = await invitedClient.post<{ free: boolean }>("/api/assessment", { track: "olympiad" });
    expect(started.status, started.text).toBe(200);
    expect(started.body.free).toBe(true);

    const outsiderClient = await signedInClient(outsider.phone, outsider.password);
    expect((await outsiderClient.post("/api/assessment", { track: "olympiad" })).status).toBe(503);
    expect((await outsiderClient.get("/api/assessment")).status).toBe(503);
  });

  it("lets the invited child carry on with an assessment already started", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse();
    const user = await createTestUser({ grade: "7" });
    await createTestRegistration({ userId: user.id, programId: course.id, status: "active" });
    await createExam(admin, { category: "D", freeCourseIds: [course.id] });

    const client = await signedInClient(user.phone, user.password);
    const started = await client.post<{ assessment: { id: string } }>("/api/assessment", {
      track: "olympiad",
    });
    const assessmentId = started.body.assessment.id;

    await setAssessmentSwitch("off");

    // Every per-assessment endpoint goes through the same guard.
    expect((await client.get(`/api/assessment/${assessmentId}/solutions`)).status).toBe(200);
  });

  it("shows the invited child a button on their profile", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse();
    const invited = await createTestUser({ grade: "6" });
    await createTestRegistration({ userId: invited.id, programId: course.id, status: "active" });
    await createExam(admin, { category: "C", freeCourseIds: [course.id] });
    await setAssessmentSwitch("off");

    const client = await signedInClient(invited.phone, invited.password);
    const page = await client.get("/profile");

    expect(page.status).toBe(200);
    expect(page.text).toContain("Түвшин тогтоох · Үнэгүй");
  });

  it("shows no such button to a child who was not invited", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse();
    await createExam(admin, { category: "C", freeCourseIds: [course.id] });
    const outsider = await createTestUser({ grade: "6" });
    await setAssessmentSwitch("off");

    const client = await signedInClient(outsider.phone, outsider.password);
    const page = await client.get("/profile");

    expect(page.status).toBe(200);
    expect(page.text).not.toContain("Түвшин тогтоох · Үнэгүй");
  });
});
