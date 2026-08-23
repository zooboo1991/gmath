/**
 * The teacher's verdict pages — POST/DELETE /api/admin/grading/[id]/sheet.
 *
 * Marking a paper by hand produces one photo per page, and the single-image
 * version of this quietly replaced the previous upload every time: a teacher
 * who scanned three pages ended up sending the child one. These tests hold the
 * "many pages" property down, along with the two rules that keep children's
 * work private — only a full admin may touch them, and a page can only be
 * deleted from the assessment it belongs to.
 */

import { afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, signedInClient } from "../../support/client";
import { cleanupTracked, testDb, trackStorageObject } from "../../support/db";
import { createTestAssessment, createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

/** A 1x1 PNG — enough to pass the byte-signature check in lib/storage. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/**
 * Uploads leave objects in the bucket that no cascade reaches — the row is
 * deleted with its user, the file is not — so every one is registered for
 * cleanup as it is created.
 */
async function trackSheets(assessmentId: string) {
  for (const path of await sheetPaths(assessmentId)) trackStorageObject("graded-sheets", path);
}

function sheetForm(name = "page.png") {
  const body = new FormData();
  body.append("file", new File([new Uint8Array(PNG)], name, { type: "image/png" }));
  return body;
}

async function gradableAssessment() {
  const user = await createTestUser();
  const assessment = await createTestAssessment({ userId: user.id, status: "grading" });
  return { user, assessmentId: assessment.id };
}

async function sheetPaths(assessmentId: string): Promise<string[]> {
  const { data, error } = await testDb()
    .from("assessments")
    .select("graded_sheet_paths")
    .eq("id", assessmentId)
    .single();
  if (error) throw new Error(error.message);
  return (data as { graded_sheet_paths: string[] }).graded_sheet_paths;
}

describe("attaching the marked-up pages", () => {
  it("keeps every page instead of replacing the last", async () => {
    const { assessmentId } = await gradableAssessment();
    const admin = await adminClient("full");

    for (const name of ["page1.png", "page2.png", "page3.png"]) {
      const res = await admin.postForm<{ path: string; url: string }>(
        `/api/admin/grading/${assessmentId}/sheet`,
        sheetForm(name)
      );
      expect(res.status, res.text).toBe(200);
      expect(res.body.url).toContain("/graded-sheets/");
    }

    await trackSheets(assessmentId);
    const paths = await sheetPaths(assessmentId);
    expect(paths).toHaveLength(3);
    expect(new Set(paths).size).toBe(3);
  });

  it("shows all of them to the student it belongs to", async () => {
    const { user, assessmentId } = await gradableAssessment();
    const admin = await adminClient("full");
    await admin.postForm(`/api/admin/grading/${assessmentId}/sheet`, sheetForm());
    await admin.postForm(`/api/admin/grading/${assessmentId}/sheet`, sheetForm());
    await trackSheets(assessmentId);
    // Completed, because that is when the result page renders the verdict.
    await testDb()
      .from("assessments")
      .update({ status: "completed", final_level: 3 })
      .eq("id", assessmentId);

    const student = await signedInClient(user.phone, user.password);
    const page = await student.get("/profile/assessment");

    expect(page.status).toBe(200);
    expect(page.text).toContain("Багшийн засварласан хуудас");
    // Two signed links, one per page.
    expect(page.text.match(/graded-sheets/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("removes one page and leaves the rest", async () => {
    const { assessmentId } = await gradableAssessment();
    const admin = await adminClient("full");
    await admin.postForm(`/api/admin/grading/${assessmentId}/sheet`, sheetForm());
    await admin.postForm(`/api/admin/grading/${assessmentId}/sheet`, sheetForm());
    await trackSheets(assessmentId);
    const [first, second] = await sheetPaths(assessmentId);

    const res = await admin.del(`/api/admin/grading/${assessmentId}/sheet`, { path: first });

    expect(res.status).toBe(200);
    expect(await sheetPaths(assessmentId)).toEqual([second]);
  });
});

describe("who may touch them", () => {
  it("refuses the read-only admin and a signed-out visitor", async () => {
    const { assessmentId } = await gradableAssessment();

    const viewer = await adminClient("viewer");
    expect((await viewer.postForm(`/api/admin/grading/${assessmentId}/sheet`, sheetForm())).status).toBe(401);
    expect((await anonClient().postForm(`/api/admin/grading/${assessmentId}/sheet`, sheetForm())).status).toBe(401);
  });

  it("will not delete a page belonging to a different assessment", async () => {
    const mine = await gradableAssessment();
    const theirs = await gradableAssessment();
    const admin = await adminClient("full");
    await admin.postForm(`/api/admin/grading/${theirs.assessmentId}/sheet`, sheetForm());
    await trackSheets(theirs.assessmentId);
    const [theirPath] = await sheetPaths(theirs.assessmentId);

    const res = await admin.del(`/api/admin/grading/${mine.assessmentId}/sheet`, { path: theirPath });

    expect(res.status).toBe(404);
    // Still attached where it belongs.
    expect(await sheetPaths(theirs.assessmentId)).toEqual([theirPath]);
  });

  it("answers 404 for an assessment that does not exist", async () => {
    const admin = await adminClient("full");
    const res = await admin.postForm(
      "/api/admin/grading/00000000-0000-4000-8000-000000000000/sheet",
      sheetForm()
    );
    expect(res.status).toBe(404);
  });
});
