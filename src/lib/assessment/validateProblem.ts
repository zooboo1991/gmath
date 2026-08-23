import { isTooLong, MAX_LEN } from "../validate";
import type { ProblemInput } from "./db";
import { isProblemCategory } from "./types";

/**
 * Validates a problem the admin typed. Returns a Mongolian message, or the
 * cleaned-up values. `partial` skips fields the caller didn't send, so the
 * same rules serve both the create (POST) and edit (PUT) routes.
 */
export function validateProblemInput(
  data: Record<string, unknown>,
  opts: { partial?: boolean } = {}
): { error: string } | { value: Partial<ProblemInput> } {
  const partial = opts.partial ?? false;
  const has = (key: string) => Object.prototype.hasOwnProperty.call(data, key);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const value: Partial<ProblemInput> = {};

  if (!partial || has("category")) {
    // Required on create: a problem with no category reaches no student, and
    // silently filing new ones into that pile is how the bank quietly empties.
    if (!isProblemCategory(data.category)) {
      return { error: "Ангилал сонгоно уу (C — 5-6 анги, D — 7-8 анги)" };
    }
    value.category = data.category;
  }
  // Level and difficulty are gone from the form: the teacher composes an exam
  // by choosing problems, so nothing needs a difficulty ladder to walk. The
  // columns still exist (nullable) and older problems keep their values.
  if (!partial || has("topic")) {
    const topic = str(data.topic);
    if (isTooLong(topic, MAX_LEN.problemTopic)) return { error: "Сэдэв хэт урт байна" };
    value.topic = topic;
  }
  if (!partial || has("bodyLatex")) {
    const body = str(data.bodyLatex);
    if (isTooLong(body, MAX_LEN.problemBody)) return { error: "Бодлогын эх хэт урт байна" };
    value.bodyLatex = body;
  }
  if (!partial || has("imageUrl")) {
    value.imageUrl = str(data.imageUrl);
  }
  if (!partial || has("answerKey")) {
    const answer = str(data.answerKey);
    if (isTooLong(answer, MAX_LEN.problemAnswerKey)) return { error: "Хариу хэт урт байна" };
    value.answerKey = answer;
  }
  if (!partial || has("active")) {
    value.active = data.active !== false;
  }

  return { value };
}

/**
 * Mirrors the problems_has_content CHECK. Done in the app too so the admin
 * gets a readable message instead of a raw Postgres constraint error.
 */
export function hasProblemContent(bodyLatex?: string, imageUrl?: string): boolean {
  return Boolean(bodyLatex?.trim() || imageUrl?.trim());
}
