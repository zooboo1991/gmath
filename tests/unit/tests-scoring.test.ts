/**
 * Тестийн оноо: the same table produces the same archetype every time, and
 * a half-finished or hand-edited answer sheet is not a result.
 */

import { describe, expect, it } from "vitest";
import { findTest, isCompleteAnswerSheet, scoreTest, axisPositions, TESTS } from "@/lib/tests";

const test = findTest("matematik-arhetip")!;

describe("the test definition", () => {
  it("is complete: every option scores something a declared archetype owns", () => {
    for (const [i, question] of test.questions.entries()) {
      expect(question.options.length, `асуулт ${i + 1}`).toBeGreaterThanOrEqual(2);
      for (const option of question.options) {
        const points = Object.entries(option.points);
        expect(points.length, `${i + 1}: «${option.text}»`).toBeGreaterThan(0);
        for (const [key, value] of points) {
          expect(test.archetypes, `${i + 1}: ${key}`).toHaveProperty(key);
          expect(value).toBeGreaterThan(0);
        }
      }
    }
  });

  it("names every archetype its axes refer to", () => {
    for (const axis of test.axes) {
      for (const key of [...axis.leftKeys, ...axis.rightKeys]) {
        expect(test.archetypes, `${axis.left}/${axis.right}: ${key}`).toHaveProperty(key);
      }
    }
  });

  it("has a unique slug per test", () => {
    expect(new Set(TESTS.map((t) => t.slug)).size).toBe(TESTS.length);
  });
});

describe("scoring", () => {
  it("adds the points of the chosen options and ranks them", () => {
    // Every answer the first option: the sheet's points are exactly those.
    const answers = test.questions.map(() => 0);
    const outcome = scoreTest(test, answers);

    const expected: Record<string, number> = {};
    for (const question of test.questions) {
      for (const [key, value] of Object.entries(question.options[0].points)) {
        expected[key] = (expected[key] ?? 0) + value;
      }
    }
    for (const [key, value] of Object.entries(expected)) {
      expect(outcome.scores[key], key).toBe(value);
    }
    expect(outcome.primaryCode).toBe(outcome.order[0]);
    expect(outcome.scores[outcome.order[0]]).toBeGreaterThanOrEqual(outcome.scores[outcome.order[1]]);
  });

  it("gives the same answers the same result every time", () => {
    const answers = [3, 1, 2, 0, 3, 0, 2, 0, 3, 1, 1, 2];
    const first = scoreTest(test, answers);
    const second = scoreTest(test, answers);
    expect(second).toEqual(first);
  });

  it("keeps every axis inside its ends", () => {
    const answers = [3, 1, 2, 0, 3, 0, 2, 0, 3, 1, 1, 2];
    for (const value of axisPositions(test, scoreTest(test, answers).scores)) {
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("what counts as a finished sheet", () => {
  it("takes one valid choice per question", () => {
    expect(isCompleteAnswerSheet(test, test.questions.map(() => 0))).toBe(true);
  });

  it("refuses a short sheet, a stray index and rubbish", () => {
    expect(isCompleteAnswerSheet(test, [0, 1, 2])).toBe(false);
    expect(isCompleteAnswerSheet(test, test.questions.map(() => 9))).toBe(false);
    expect(isCompleteAnswerSheet(test, test.questions.map(() => -1))).toBe(false);
    expect(isCompleteAnswerSheet(test, "0,1,2")).toBe(false);
    expect(isCompleteAnswerSheet(test, null)).toBe(false);
  });
});
