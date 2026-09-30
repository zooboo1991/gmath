/**
 * The step-by-step paper: one problem per step, saved as the child goes.
 *
 * What the browser needs from the server is (1) every problem on the paper in
 * order with what has been done to it, so a child who closes the tab resumes
 * where they stopped, and (2) a way to record "бодож чадсангүй" so a paper of
 * ten can be handed in with nine photos.
 */

import { afterAll, describe, expect, it } from "vitest";
import { adminClient, signedInClient, TestClient } from "../../support/client";
import { cleanupTracked, testDb, track, trackStorageObject } from "../../support/db";
import { createTestCourse, createTestRegistration, createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

/** A 1x1 JPEG — the smallest thing with real JPEG magic bytes. */
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);

type Step = { problem: { id: string } | null; imageUrls: string[]; skipped: boolean };

/**
 * Seeded on every problem below. Admin-only: a child must never receive either
 * of them, while solving or on the marked report afterwards.
 */
const ANSWER_MARKER = "answer-key-only-for-admins";
const SOLUTION_MARKER = "reference-solution-only-for-teachers";

/** An invited child, paid, with a two-problem paper in front of them. */
async function readyToSolve(): Promise<{
  client: TestClient;
  assessmentId: string;
  problemIds: string[];
}> {
  const admin = await adminClient("full");
  const course = await createTestCourse();
  const user = await createTestUser({ grade: "6-р анги" });
  await createTestRegistration({ userId: user.id, programId: course.id, status: "active" });

  const problemIds: string[] = [];
  for (const body of ["1+1", "2+2"]) {
    const { data } = await testDb()
      .from("problems")
      .insert({
        category: "C",
        topic: "Алхмын тест",
        body_latex: body,
        answer_key: ANSWER_MARKER,
        solution_latex: SOLUTION_MARKER,
        active: true,
      })
      .select("id")
      .single();
    const problemId = (data as { id: string }).id;
    track("problems", problemId);
    problemIds.push(problemId);
  }

  const created = await admin.post<{ exam: { id: string } }>("/api/admin/exams", {
    title: "Алхмын шалгалт",
    category: "C",
    fee: "0₮",
  });
  const examId = created.body.exam.id;
  track("exams", examId);
  await admin.put(`/api/admin/exams/${examId}`, {
    problemIds,
    freeCourseIds: [course.id],
    status: "open",
  });

  const client = await signedInClient(user.phone, user.password);
  const started = await client.post<{ assessment: { id: string } }>("/api/assessment", {
    track: "olympiad",
    examId,
  });
  const assessmentId = started.body.assessment.id;
  await client.post(`/api/assessment/${assessmentId}/pay`);

  return { client, assessmentId, problemIds };
}

/** Uploads one photo of working against a problem. */
async function uploadPhoto(client: TestClient, assessmentId: string, problemId: string) {
  const body = new FormData();
  body.append("problemId", problemId);
  body.append("files", new Blob([JPEG], { type: "image/jpeg" }), "bodolt.jpg");
  const res = await client.postForm(`/api/assessment/${assessmentId}/solutions`, body);
  const { data } = await testDb()
    .from("solutions")
    .select("image_paths")
    .eq("assessment_id", assessmentId)
    .eq("problem_id", problemId)
    .maybeSingle();
  for (const path of (data as { image_paths: string[] } | null)?.image_paths ?? []) {
    trackStorageObject("solutions", path);
  }
  return res;
}

describe("the paper, step by step", () => {
  it("hands back every problem so the child can be put back where they stopped", async () => {
    const { client, assessmentId, problemIds } = await readyToSolve();

    const before = await client.get<{ steps: Step[] }>(`/api/assessment/${assessmentId}/solutions`);
    expect(before.status, before.text).toBe(200);
    expect(before.body.steps).toHaveLength(2);
    expect(before.body.steps.every((s) => s.imageUrls.length === 0 && !s.skipped)).toBe(true);

    await uploadPhoto(client, assessmentId, problemIds[0]);

    const after = await client.get<{ steps: Step[] }>(`/api/assessment/${assessmentId}/solutions`);
    const done = after.body.steps.filter((s) => s.imageUrls.length > 0 || s.skipped);
    expect(done).toHaveLength(1);
    expect(done[0].problem?.id).toBe(problemIds[0]);
  });

  it("lets a problem be given up on, and hands the paper in one photo short", async () => {
    const { client, assessmentId, problemIds } = await readyToSolve();

    await uploadPhoto(client, assessmentId, problemIds[0]);
    const skipped = await client.post(`/api/assessment/${assessmentId}/skip`, {
      problemId: problemIds[1],
    });
    expect(skipped.status, skipped.text).toBe(200);

    const steps = await client.get<{ steps: Step[] }>(`/api/assessment/${assessmentId}/solutions`);
    expect(steps.body.steps.find((s) => s.problem?.id === problemIds[1])?.skipped).toBe(true);

    const submitted = await client.post(`/api/assessment/${assessmentId}/submit`);
    expect(submitted.status, submitted.text).toBe(200);
  });

  it("takes the photo when a child comes back to a problem they gave up on", async () => {
    const { client, assessmentId, problemIds } = await readyToSolve();

    await client.post(`/api/assessment/${assessmentId}/skip`, { problemId: problemIds[0] });
    const res = await uploadPhoto(client, assessmentId, problemIds[0]);
    expect(res.status, res.text).toBe(200);

    const steps = await client.get<{ steps: Step[] }>(`/api/assessment/${assessmentId}/solutions`);
    const step = steps.body.steps.find((s) => s.problem?.id === problemIds[0]);
    expect(step?.skipped).toBe(false);
    expect(step?.imageUrls).toHaveLength(1);
  });

  it("refuses to mark a photographed problem as unsolved", async () => {
    const { client, assessmentId, problemIds } = await readyToSolve();

    await uploadPhoto(client, assessmentId, problemIds[0]);
    const res = await client.post(`/api/assessment/${assessmentId}/skip`, {
      problemId: problemIds[0],
    });
    expect(res.status).toBe(409);
  });

  it("does not hand out a second paper for an exam already sat", async () => {
    const { client, assessmentId, problemIds } = await readyToSolve();

    for (const problemId of problemIds) await uploadPhoto(client, assessmentId, problemId);
    const submitted = await client.post(`/api/assessment/${assessmentId}/submit`);
    expect(submitted.status, submitted.text).toBe(200);

    // The profile card and the start page both go through here. Pressing
    // "start" again must return the sat exam, not open a fresh one.
    const { data: exam } = await testDb()
      .from("assessments")
      .select("exam_id")
      .eq("id", assessmentId)
      .single();
    const examId = (exam as { exam_id: string }).exam_id;

    const again = await client.post<{ assessment: { id: string }; resumed: boolean }>(
      "/api/assessment",
      { track: "olympiad", examId }
    );
    expect(again.status, again.text).toBe(200);
    expect(again.body.assessment.id).toBe(assessmentId);
    expect(again.body.resumed).toBe(true);

    const fetched = await client.get<{ assessment: { id: string; status: string } | null }>(
      `/api/assessment?exam=${examId}`
    );
    expect(fetched.body.assessment?.id).toBe(assessmentId);
    expect(fetched.body.assessment?.status).toBe("problems_submitted");
  });

  it("shows the child the teacher's note and score on each problem", async () => {
    const admin = await adminClient("full");
    const { client, assessmentId, problemIds } = await readyToSolve();

    await uploadPhoto(client, assessmentId, problemIds[0]);
    await client.post(`/api/assessment/${assessmentId}/skip`, { problemId: problemIds[1] });
    await client.post(`/api/assessment/${assessmentId}/submit`);

    const { data: solution } = await testDb()
      .from("solutions")
      .select("id")
      .eq("assessment_id", assessmentId)
      .eq("problem_id", problemIds[0])
      .single();

    const scored = await admin.put(`/api/admin/grading/${assessmentId}/score`, {
      solutionId: (solution as { id: string }).id,
      graderScore: "7",
      graderComment: "Тэгшитгэлээ зөв зохиосон, тооцоололд алдаа гарсан.",
    });
    expect(scored.status, scored.text).toBe(200);

    // No level is sent — the scale is off the form, and marking must still
    // be finishable without one.
    const completed = await admin.put(`/api/admin/grading/${assessmentId}/complete`, {
      teacherComment: "Сайн ажиллалаа. Геометр дээр илүү дасгал хий.",
    });
    expect(completed.status, completed.text).toBe(200);

    const page = await client.get(`/profile/assessment?a=${assessmentId}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain("Тэгшитгэлээ зөв зохиосон");
    expect(page.text).toContain("Геометр дээр илүү дасгал хий");
    // React splits adjacent text nodes with a comment marker in server HTML,
    // so the score and its unit are not literally next to each other.
    expect(page.text).toMatch(/7(<!-- -->)?\s*оноо/);
    // Out of the whole paper: the skipped problem still counts, as a zero.
    expect(page.text).toContain("7 / 20");
    expect(page.text).toContain("Бодлого бүрийн үнэлгээ");
    expect(page.text).toContain("Бодож чадсангүй");
  });

  it("never hands the child the answer or the reference solution", async () => {
    const admin = await adminClient("full");
    const { client, assessmentId, problemIds } = await readyToSolve();

    const solving = await client.get(`/api/assessment/${assessmentId}/solutions`);
    expect(solving.status, solving.text).toBe(200);
    expect(solving.text).not.toContain(ANSWER_MARKER);
    expect(solving.text).not.toContain(SOLUTION_MARKER);
    expect(solving.text).not.toContain("answerKey");
    expect(solving.text).not.toContain("solutionLatex");

    await uploadPhoto(client, assessmentId, problemIds[0]);
    await client.post(`/api/assessment/${assessmentId}/skip`, { problemId: problemIds[1] });
    await client.post(`/api/assessment/${assessmentId}/submit`);

    // The teacher, on the other hand, marks against it.
    const detail = await admin.get<{ items: { problem: { solutionLatex?: string } | null }[] }>(
      `/api/admin/grading/${assessmentId}`
    );
    expect(detail.status, detail.text).toBe(200);
    expect(detail.body.items.map((i) => i.problem?.solutionLatex)).toContain(SOLUTION_MARKER);

    const { data: solution } = await testDb()
      .from("solutions")
      .select("id")
      .eq("assessment_id", assessmentId)
      .eq("problem_id", problemIds[0])
      .single();
    await admin.put(`/api/admin/grading/${assessmentId}/score`, {
      solutionId: (solution as { id: string }).id,
      graderScore: "10",
      graderComment: "",
    });
    const completed = await admin.put(`/api/admin/grading/${assessmentId}/complete`, {
      teacherComment: "Дүгнэлт",
    });
    expect(completed.status, completed.text).toBe(200);

    // The marked paper shows each problem again — still without either.
    const page = await client.get(`/profile/assessment?a=${assessmentId}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain("Бодлого бүрийн үнэлгээ");
    expect(page.text).not.toContain(ANSWER_MARKER);
    expect(page.text).not.toContain(SOLUTION_MARKER);
    // Walks the whole paper, solving through marking to the report — about
    // fifteen round trips, which outlasts the default 30s on the test project.
  }, 90_000);

  it("adds the paper up and shows the conclusion in its three parts", async () => {
    const admin = await adminClient("full");
    const { client, assessmentId, problemIds } = await readyToSolve();

    for (const problemId of problemIds) await uploadPhoto(client, assessmentId, problemId);
    await client.post(`/api/assessment/${assessmentId}/submit`);

    const { data: rows } = await testDb()
      .from("solutions")
      .select("id, problem_id")
      .eq("assessment_id", assessmentId);
    const solutionFor = (problemId: string) =>
      (rows as { id: string; problem_id: string }[]).find((r) => r.problem_id === problemId)!.id;
    await admin.put(`/api/admin/grading/${assessmentId}/score`, {
      solutionId: solutionFor(problemIds[0]),
      graderScore: "10",
      graderComment: "",
    });
    await admin.put(`/api/admin/grading/${assessmentId}/score`, {
      solutionId: solutionFor(problemIds[1]),
      graderScore: "5.5",
      graderComment: "",
    });

    // The headings alone are as empty as a blank box.
    const bare = await admin.put(`/api/admin/grading/${assessmentId}/complete`, {
      teacherComment: "Чадвар\n\nҮнэлгээ\n\nСайжруулах зүйлс\n",
    });
    expect(bare.status).toBe(400);

    const tooLong = await admin.put(`/api/admin/grading/${assessmentId}/complete`, {
      teacherComment: "Чадвар\n" + "а".repeat(3001),
    });
    expect(tooLong.status).toBe(400);

    // Three real paragraphs run well past the old 500-character cap.
    const filler = " Бодолтынхоо алхам бүрийг тайлбарлан бичсэн нь сайн байна.".repeat(8);
    const conclusion =
      `Чадвар\nТэгшитгэл зохиох чадвар сайн.${filler}\n\n` +
      `Үнэлгээ\nГүйцэтгэл дундаас дээгүүр.${filler}\n\n` +
      "Сайжруулах зүйлс\n• Хариугаа нөхцөлд орлуулж шалгах\n• Инвариантын бодлого дээр дасгал хийх";
    expect(conclusion.length).toBeGreaterThan(500);
    const completed = await admin.put(`/api/admin/grading/${assessmentId}/complete`, {
      teacherComment: conclusion,
    });
    expect(completed.status, completed.text).toBe(200);

    const page = await client.get(`/profile/assessment?a=${assessmentId}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain("15.5 / 20");
    for (const heading of ["Чадвар", "Үнэлгээ", "Сайжруулах зүйлс"]) {
      expect(page.text).toMatch(new RegExp(`<h3[^>]*>${heading}</h3>`));
    }
    expect(page.text).toContain("Тэгшитгэл зохиох чадвар сайн.");
    expect(page.text).toContain("• Инвариантын бодлого дээр дасгал хийх");

    // The finished list shows the same total.
    const list = await admin.get("/admin/grading?tab=completed");
    expect(list.status).toBe(200);
    expect(list.text).toContain("15.5 / 20");
  }, 90_000);

  it("counts only the problems a child chose on a paper from the old adaptive walk", async () => {
    // Before exams were composed, the walk showed card after card and the
    // child passed over most ("too_easy", "dont_know" = "show me another").
    // Only the ones they chose to solve were ever on their paper.
    const problemIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const { data } = await testDb()
        .from("problems")
        .insert({ category: "C", topic: "Хуучин алхам", body_latex: `${i}+${i}`, active: true })
        .select("id")
        .single();
      track("problems", (data as { id: string }).id);
      problemIds.push((data as { id: string }).id);
    }
    const user = await createTestUser({ grade: "6-р анги" });
    const { data: sitting } = await testDb()
      .from("assessments")
      .insert({
        user_id: user.id,
        track: "olympiad",
        status: "completed",
        category: "C",
        // Typed loosely: a heading with its text after a colon, and a
        // section left empty.
        teacher_comment: "чадвар: Тэгшитгэл сайн зохиодог.\nҮнэлгээ\n\nСайжруулах зүйлс\n• Дасгал хийх",
      })
      .select("id")
      .single();
    const assessmentId = (sitting as { id: string }).id;
    track("assessments", assessmentId);
    const actions = ["too_easy", "too_easy", "dont_know", "solving", "solving"];
    await testDb()
      .from("assessment_problems")
      .insert(actions.map((action, i) => ({ assessment_id: assessmentId, problem_id: problemIds[i], action, shown_order: i })));
    await testDb().from("solutions").insert([
      { assessment_id: assessmentId, problem_id: problemIds[3], grader_score: 10, graded_at: new Date().toISOString() },
      { assessment_id: assessmentId, problem_id: problemIds[4], grader_score: 5, graded_at: new Date().toISOString() },
    ]);

    const client = await signedInClient(user.phone, user.password);
    const page = await client.get(`/profile/assessment?a=${assessmentId}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain("15 / 20");
    expect(page.text).toMatch(/<h3[^>]*>Чадвар<\/h3><p[^>]*>Тэгшитгэл сайн зохиодог\.<\/p>/);
    expect(page.text).not.toMatch(/<h3[^>]*>Үнэлгээ<\/h3>/);
    expect(page.text).toMatch(/<h3[^>]*>Сайжруулах зүйлс<\/h3>/);

    const admin = await adminClient("full");
    const grading = await admin.get(`/admin/grading/${assessmentId}`);
    expect(grading.status).toBe(200);
    expect(grading.text).toContain("15 / 20");
    const list = await admin.get("/admin/grading?tab=completed");
    expect(list.text).toContain("15 / 20");
    expect(list.text).not.toContain("15 / 50");
  }, 90_000);

  it("will not close marking while a handed-in problem has no score", async () => {
    const admin = await adminClient("full");
    const { client, assessmentId, problemIds } = await readyToSolve();

    for (const problemId of problemIds) await uploadPhoto(client, assessmentId, problemId);
    await client.post(`/api/assessment/${assessmentId}/submit`);

    const tooEarly = await admin.put<{ error: string }>(
      `/api/admin/grading/${assessmentId}/complete`,
      { teacherComment: "Дүгнэлт" }
    );
    expect(tooEarly.status).toBe(400);
    expect(tooEarly.body.error).toContain("оноо тавиагүй");

    // Zero counts as a score — the point is that nothing is left blank.
    const { data: rows } = await testDb()
      .from("solutions")
      .select("id")
      .eq("assessment_id", assessmentId);
    for (const row of rows as { id: string }[]) {
      await admin.put(`/api/admin/grading/${assessmentId}/score`, {
        solutionId: row.id,
        graderScore: "0",
        graderComment: "",
      });
    }

    const now = await admin.put(`/api/admin/grading/${assessmentId}/complete`, {
      teacherComment: "Дүгнэлт",
    });
    expect(now.status, now.text).toBe(200);
  });

  it("lets the school void a sitting so the child starts over", async () => {
    const admin = await adminClient("full");
    const { client, assessmentId, problemIds } = await readyToSolve();

    await uploadPhoto(client, assessmentId, problemIds[0]);
    const { data: exam } = await testDb()
      .from("assessments")
      .select("exam_id")
      .eq("id", assessmentId)
      .single();
    const examId = (exam as { exam_id: string }).exam_id;

    const cancelled = await admin.post(`/api/admin/grading/${assessmentId}/cancel`);
    expect(cancelled.status, cancelled.text).toBe(200);

    // Starting again gives a new paper, not the voided one — which is what
    // makes it look like a first attempt to the child.
    const restarted = await client.post<{ assessment: { id: string; status: string } }>(
      "/api/assessment",
      { track: "olympiad", examId }
    );
    expect(restarted.status, restarted.text).toBe(200);
    expect(restarted.body.assessment.id).not.toBe(assessmentId);

    // And the old one is out of the grading queue.
    const queue = await admin.get<{ queue: { id: string }[] }>("/api/admin/grading");
    expect(queue.body.queue.some((a) => a.id === assessmentId)).toBe(false);
  });

  it("puts a voided sitting back in the queue when restored", async () => {
    const admin = await adminClient("full");
    const { client, assessmentId, problemIds } = await readyToSolve();

    for (const problemId of problemIds) await uploadPhoto(client, assessmentId, problemId);
    await client.post(`/api/assessment/${assessmentId}/submit`);
    await admin.post(`/api/admin/grading/${assessmentId}/cancel`);

    const restored = await admin.post(`/api/admin/grading/${assessmentId}/restore`);
    expect(restored.status, restored.text).toBe(200);

    // Back exactly where it was cancelled from — handed in, not mid-solve.
    const { data } = await testDb()
      .from("assessments")
      .select("status")
      .eq("id", assessmentId)
      .single();
    expect((data as { status: string }).status).toBe("problems_submitted");

    const queue = await admin.get<{ queue: { id: string }[] }>("/api/admin/grading");
    expect(queue.body.queue.some((a) => a.id === assessmentId)).toBe(true);

    // Restoring something that was never cancelled is refused.
    expect((await admin.post(`/api/admin/grading/${assessmentId}/restore`)).status).toBe(409);
  });

  it("restores a mid-solve cancel to solving, not to the queue", async () => {
    const admin = await adminClient("full");
    const { client, assessmentId, problemIds } = await readyToSolve();

    await uploadPhoto(client, assessmentId, problemIds[0]);
    await admin.post(`/api/admin/grading/${assessmentId}/cancel`);
    await admin.post(`/api/admin/grading/${assessmentId}/restore`);

    const { data } = await testDb()
      .from("assessments")
      .select("status")
      .eq("id", assessmentId)
      .single();
    expect((data as { status: string }).status).toBe("questionnaire_done");
  });

  it("will not void a sitting the teacher already finished", async () => {
    const admin = await adminClient("full");
    const { client, assessmentId, problemIds } = await readyToSolve();

    for (const problemId of problemIds) await uploadPhoto(client, assessmentId, problemId);
    await client.post(`/api/assessment/${assessmentId}/submit`);
    const { data: rows } = await testDb()
      .from("solutions")
      .select("id")
      .eq("assessment_id", assessmentId);
    for (const row of rows as { id: string }[]) {
      await admin.put(`/api/admin/grading/${assessmentId}/score`, {
        solutionId: row.id,
        graderScore: "5",
        graderComment: "",
      });
    }
    await admin.put(`/api/admin/grading/${assessmentId}/complete`, { teacherComment: "Дүгнэлт" });

    const res = await admin.post<{ error: string }>(`/api/admin/grading/${assessmentId}/cancel`);
    expect(res.status).toBe(409);
  });

  it("tells the child the paper is in, rather than offering the form again", async () => {
    const { client, assessmentId, problemIds } = await readyToSolve();

    for (const problemId of problemIds) await uploadPhoto(client, assessmentId, problemId);
    await client.post(`/api/assessment/${assessmentId}/submit`);

    // The status the solve page reads to decide between the stepper and the
    // "handed in" card — every edit is refused past this point.
    const after = await client.get<{ status: string }>(`/api/assessment/${assessmentId}/solutions`);
    expect(after.body.status).toBe("problems_submitted");

    const page = await client.get(`/assessment/${assessmentId}/solve`);
    expect(page.status).toBe(200);
    expect(page.text).toContain("Бодолт илгээгдсэн");
  });

  it("reports the handed-in sitting even when the page is opened without ?exam=", async () => {
    const { client, assessmentId, problemIds } = await readyToSolve();

    for (const problemId of problemIds) await uploadPhoto(client, assessmentId, problemId);
    await client.post(`/api/assessment/${assessmentId}/submit`);

    // No ?exam= — the plain /assessment page. Offering "start" here ends in a
    // 409 the child cannot do anything about.
    const plain = await client.get<{ assessment: { id: string; status: string } | null }>(
      "/api/assessment"
    );
    expect(plain.status, plain.text).toBe(200);
    expect(plain.body.assessment?.id).toBe(assessmentId);
    expect(plain.body.assessment?.status).toBe("problems_submitted");
  });

  it("puts an unpaid cancel back as unpaid, not into the grading queue", async () => {
    const admin = await adminClient("full");
    const { assessmentId } = await readyToSolve();

    // Wind it back to the state a sitting is in before payment settles.
    await testDb().from("assessments").update({ status: "awaiting_payment" }).eq("id", assessmentId);

    await admin.post(`/api/admin/grading/${assessmentId}/cancel`);
    await admin.post(`/api/admin/grading/${assessmentId}/restore`);

    const { data } = await testDb()
      .from("assessments")
      .select("status")
      .eq("id", assessmentId)
      .single();
    expect((data as { status: string }).status).toBe("awaiting_payment");

    const queue = await admin.get<{ queue: { id: string }[] }>("/api/admin/grading");
    expect(queue.body.queue.some((a) => a.id === assessmentId)).toBe(false);
  });

  it("refuses a problem that is not on this child's paper", async () => {
    const { client, assessmentId } = await readyToSolve();
    const other = await readyToSolve();

    const res = await client.post(`/api/assessment/${assessmentId}/skip`, {
      problemId: other.problemIds[0],
    });
    expect(res.status).toBe(400);
  });
});
