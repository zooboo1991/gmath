import { mathArchetypeTest } from "./mathArchetype";
import type { PersonalityTest, TestOutcome } from "./types";

export type { Archetype, Axis, PersonalityTest, Question, TestOutcome } from "./types";

/**
 * Every test the site offers. A new one is a file in this folder plus a line
 * here — the questions are content, not data, so they are versioned with the
 * code that renders them.
 */
export const TESTS: PersonalityTest[] = [mathArchetypeTest];

export function findTest(slug: string): PersonalityTest | undefined {
  return TESTS.find((test) => test.slug === slug);
}

/**
 * Adds up an answer sheet.
 *
 * Runs on the server as well as in the browser, and the server's result is
 * the one that gets stored: a page can be edited, an answer sheet cannot be
 * trusted to have scored itself honestly.
 */
export function scoreTest(test: PersonalityTest, answers: number[]): TestOutcome {
  const scores: Record<string, number> = {};
  for (const key of Object.keys(test.archetypes)) scores[key] = 0;

  answers.forEach((choice, i) => {
    const option = test.questions[i]?.options[choice];
    if (!option) return;
    for (const [key, points] of Object.entries(option.points)) {
      if (key in scores) scores[key] += points;
    }
  });

  // Ties break by the order the archetypes are declared in, so the same
  // answers always produce the same result.
  const order = Object.keys(test.archetypes).sort((a, b) => scores[b] - scores[a]);
  return {
    scores,
    order,
    primaryCode: order[0],
    secondaryCode: order[1],
  };
}

/** Where each axis sits, from -1 (all the way left) to +1 (all the way right). */
export function axisPositions(test: PersonalityTest, scores: Record<string, number>): number[] {
  return test.axes.map((axis) => {
    const left = axis.leftKeys.reduce((sum, key) => sum + (scores[key] ?? 0), 0);
    const right = axis.rightKeys.reduce((sum, key) => sum + (scores[key] ?? 0), 0);
    return left + right ? (right - left) / (left + right) : 0;
  });
}

/** True when the sheet has one valid choice per question. */
export function isCompleteAnswerSheet(test: PersonalityTest, answers: unknown): answers is number[] {
  return (
    Array.isArray(answers) &&
    answers.length === test.questions.length &&
    answers.every(
      (choice, i) =>
        Number.isInteger(choice) &&
        (choice as number) >= 0 &&
        (choice as number) < test.questions[i].options.length
    )
  );
}
