import type { ProblemAction, Problem } from "./types";
import { MAX_LEVEL, MIN_LEVEL } from "./levelEstimator";

/**
 * Decides which problem to show next. Pure functions with no DB access, so
 * the adaptive behaviour can be reasoned about (and tested) on its own; the
 * caller in ./db loads the candidate rows and persists the choice.
 */

/** How far the target moves on each answer. */
const STEP_UP = 1;
const STEP_DOWN = 1;

/**
 * "Амархан" means we aimed too low, "Мэдэхгүй" too high. "Бодъё" means this
 * one is about right, so the target stays where it is and we offer another
 * problem near the same difficulty.
 */
export function nextTargetDifficulty(current: number, action: ProblemAction): number {
  const moved =
    action === "too_easy" ? current + STEP_UP : action === "dont_know" ? current - STEP_DOWN : current;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, moved));
}

/**
 * Picks the unseen active problem closest to `target`. Ties break towards the
 * easier problem, so a student is never pushed up by an arbitrary ordering.
 * Returns null when the bank has nothing left to show.
 */
export function pickNextProblem(
  candidates: Problem[],
  target: number,
  seenProblemIds: Iterable<string>
): Problem | null {
  const seen = new Set(seenProblemIds);
  let best: Problem | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const problem of candidates) {
    if (!problem.active || seen.has(problem.id)) continue;
    const distance = Math.abs(problem.difficulty - target);
    if (distance < bestDistance || (distance === bestDistance && best && problem.difficulty < best.difficulty)) {
      best = problem;
      bestDistance = distance;
    }
  }

  return best;
}
