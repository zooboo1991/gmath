import {
  findAssessment,
  findQuestionnaire,
  getPickingState,
  listProblems,
  listSolutions,
} from "./db";
import { SIGNED_URL_TTL_SECONDS } from "./config";
import { createSignedUrl, GRADED_SHEETS_BUCKET, SOLUTIONS_BUCKET } from "../storage";
import { findUserById, toPublicUser } from "../db";

/**
 * Everything a grader needs for one submission, assembled in one place so the
 * detail page and its API route can't drift apart.
 *
 * Unlike the student-facing endpoints this deliberately keeps `answerKey` —
 * the grader is marking against it. Only ever call this from a route already
 * behind isAdmin().
 */
export async function buildGradingDetail(id: string) {
  const assessment = await findAssessment(id);
  if (!assessment) return null;

  const [user, questionnaire, state, allProblems, solutions] = await Promise.all([
    findUserById(assessment.userId),
    findQuestionnaire(id),
    getPickingState(assessment),
    listProblems({ includeInactive: true }),
    listSolutions(id),
  ]);

  const items = await Promise.all(
    state.chosen.map(async (entry) => {
      const problem = allProblems.find((p) => p.id === entry.problemId) ?? null;
      const solution = solutions.find((s) => s.problemId === entry.problemId) ?? null;
      const imageUrls = await Promise.all(
        (solution?.imagePaths ?? []).map((path) =>
          createSignedUrl(SOLUTIONS_BUCKET, path, SIGNED_URL_TTL_SECONDS)
        )
      );
      return {
        problem,
        solution,
        imageUrls: imageUrls.filter((u): u is string => Boolean(u)),
      };
    })
  );

  // The problems the student skipped are useful context for the teacher —
  // "answered Мэдэхгүй at difficulty 6" says as much as a score does.
  const skipped = state.shown
    .filter((s) => s.action !== "solving")
    .map((s) => ({
      action: s.action,
      difficulty: allProblems.find((p) => p.id === s.problemId)?.difficulty ?? null,
      topic: allProblems.find((p) => p.id === s.problemId)?.topic ?? "",
    }));

  // The verdict's pages, plus the single pre-split scan for assessments graded
  // before it could hold more than one.
  const sheetPaths = [
    ...assessment.gradedSheetPaths,
    ...(assessment.gradedSheetPath && !assessment.gradedSheetPaths.includes(assessment.gradedSheetPath)
      ? [assessment.gradedSheetPath]
      : []),
  ];
  const gradedSheets = (
    await Promise.all(
      sheetPaths.map(async (path) => {
        const url = await createSignedUrl(GRADED_SHEETS_BUCKET, path, SIGNED_URL_TTL_SECONDS);
        return url ? { path, url } : null;
      })
    )
  ).filter((s): s is { path: string; url: string } => s !== null);

  return {
    assessment,
    user: user ? toPublicUser(user) : undefined,
    questionnaire: questionnaire ?? null,
    items,
    skipped,
    gradedSheets,
  };
}

export type GradingDetail = NonNullable<Awaited<ReturnType<typeof buildGradingDetail>>>;
