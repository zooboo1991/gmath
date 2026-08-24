import { getPickingState, listProblems, listSolutions } from "./db";
import { SIGNED_URL_TTL_SECONDS } from "./config";
import { toPublicProblem, type Assessment, type PublicProblem } from "./types";
import { createSignedUrl, GRADED_SHEETS_BUCKET, SOLUTIONS_BUCKET } from "../storage";

/** One problem as the student sees it back: their work, and what the teacher wrote on it. */
export type ReportItem = {
  problem: PublicProblem | null;
  /** The student's own photographs of their working. */
  imageUrls: string[];
  score?: number;
  comment?: string;
  /** They pressed "Бодож чадсангүй" — no photo, and none expected. */
  skipped: boolean;
};

export type AssessmentReport = {
  items: ReportItem[];
  gradedSheetUrls: string[];
  /** Points the teacher gave, and how many problems carry a score. */
  totalScore: number;
  scoredCount: number;
};

/**
 * The marked paper, for the student.
 *
 * The grader's own view (`buildGradingDetail`) keeps the answer key; this one
 * must not — so problems go through `toPublicProblem` before they leave.
 */
export async function buildAssessmentReport(assessment: Assessment): Promise<AssessmentReport> {
  const [state, allProblems, solutions] = await Promise.all([
    getPickingState(assessment),
    listProblems({ includeInactive: true }),
    listSolutions(assessment.id).catch(() => []),
  ]);

  const items = await Promise.all(
    state.shown.map(async (entry) => {
      const problem = allProblems.find((p) => p.id === entry.problemId);
      const solution = solutions.find((s) => s.problemId === entry.problemId);
      const urls = await Promise.all(
        (solution?.imagePaths ?? []).map((path) =>
          createSignedUrl(SOLUTIONS_BUCKET, path, SIGNED_URL_TTL_SECONDS)
        )
      );
      return {
        problem: problem ? toPublicProblem(problem) : null,
        imageUrls: urls.filter((u): u is string => Boolean(u)),
        score: solution?.graderScore,
        comment: solution?.graderComment,
        skipped: entry.action === "dont_know",
      };
    })
  );

  // The verdict's pages, plus the single scan of assessments graded before it
  // could hold more than one.
  const paths = [
    ...assessment.gradedSheetPaths,
    ...(assessment.gradedSheetPath && !assessment.gradedSheetPaths.includes(assessment.gradedSheetPath)
      ? [assessment.gradedSheetPath]
      : []),
  ];
  const gradedSheetUrls = (
    await Promise.all(paths.map((p) => createSignedUrl(GRADED_SHEETS_BUCKET, p, SIGNED_URL_TTL_SECONDS)))
  ).filter((url): url is string => Boolean(url));

  const scored = items.filter((i) => i.score !== undefined);
  return {
    items,
    gradedSheetUrls,
    totalScore: scored.reduce((sum, i) => sum + (i.score ?? 0), 0),
    scoredCount: scored.length,
  };
}
