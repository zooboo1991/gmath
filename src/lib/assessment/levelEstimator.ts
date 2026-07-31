import type { QuestionnaireInput } from "./types";

/**
 * Maps the questionnaire to the level we START showing problems at. This is
 * only a starting point — the student's "Амархан"/"Мэдэхгүй" answers move it
 * from there, and the teacher sets the real final level by hand at the end.
 *
 * Deliberately simple and rule-based so it can be tuned without touching any
 * other file. Edit the tables below to change how the estimate behaves.
 */

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 10;

/** Base level by school grade. Grades outside the table fall back to 1. */
const BASE_BY_GRADE: Record<number, number> = {
  4: 1,
  5: 1,
  6: 2,
  7: 2,
  8: 3,
  9: 3,
  10: 4,
  11: 4,
  12: 4,
};

/** Words that suggest a real competition result rather than just "took part". */
const MEDAL_WORDS = ["алт", "мөнгө", "хүрэл", "медал", "аварга", "1-р байр", "2-р байр", "3-р байр"];

/** "8-р анги" / "8" / "8 анги" -> 8. Returns null when nothing usable is there. */
export function parseGradeNumber(grade: string): number | null {
  const match = grade.match(/\d{1,2}/);
  if (!match) return null;
  const n = Number(match[0]);
  return n >= 1 && n <= 12 ? n : null;
}

export function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}

export function estimateLevel(answers: QuestionnaireInput): number {
  const gradeNumber = parseGradeNumber(answers.grade);
  let level = gradeNumber ? (BASE_BY_GRADE[gradeNumber] ?? 1) : 1;

  // Has actually prepared for olympiads before, not just sat in class.
  if (answers.hasPrepared) level += 1;

  // Has competed at all.
  if (answers.hasCompeted) level += 1;

  const achievements = answers.achievements.trim().toLowerCase();
  if (achievements) {
    // A named placing/medal is worth more than "I entered a few times".
    level += MEDAL_WORDS.some((w) => achievements.includes(w)) ? 2 : 1;
  }

  return clampLevel(level);
}
