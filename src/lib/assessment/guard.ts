import { findAssessment } from "./db";
import { getSessionUser } from "../session";
import type { Assessment, AssessmentStatus } from "./types";
import type { User } from "../db";

/**
 * Ownership check for every /api/assessment/[id]/* route.
 *
 * An assessment id is a UUID in the URL, so the only thing standing between
 * one student and another's answers is this function — it must be the single
 * way those routes load an assessment. Returns a discriminated union so a
 * route can't accidentally use the assessment without handling the failure.
 */
export type GuardResult =
  | { ok: true; user: User; assessment: Assessment }
  | { ok: false; error: string; status: number };

export async function requireOwnAssessment(id: string): Promise<GuardResult> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: "Нэвтэрнэ үү", status: 401 };
  }

  const assessment = await findAssessment(id);
  // Someone else's assessment is reported as missing rather than forbidden,
  // so the response can't be used to probe which ids exist.
  if (!assessment || assessment.userId !== user.id) {
    return { ok: false, error: "Үнэлгээ олдсонгүй", status: 404 };
  }

  return { ok: true, user, assessment };
}

/**
 * Guards the step order — a student must not be able to skip straight to
 * uploading solutions by calling the API directly.
 */
export function requireStatus(
  assessment: Assessment,
  allowed: AssessmentStatus[]
): { ok: true } | { ok: false; error: string; status: number } {
  if (!allowed.includes(assessment.status)) {
    return { ok: false, error: "Энэ алхмыг одоо гүйцэтгэх боломжгүй", status: 409 };
  }
  return { ok: true };
}
