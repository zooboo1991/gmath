import { isTooLong, MAX_LEN } from "./validate";
import type { CertificateBatchInput } from "./db";

/**
 * The fields an issuing run takes, parsed once.
 *
 * Shared by the real run and the preview: if the two parsed their input
 * differently, the preview could show a batch the real run would refuse — or
 * worse, refuse one it would accept, and be quietly stopped trusting.
 */
export type ParsedBatch =
  | { ok: true; value: Omit<CertificateBatchInput, "programId"> }
  | { ok: false; error: string };

export function parseCertificateBatch(data: unknown): ParsedBatch {
  const source = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const course = text(source.course);
  const studentCategory = text(source.studentCategory);
  const teacherCategory = text(source.teacherCategory);
  const issuedDate = text(source.issuedDate);

  // Name the field that is actually empty. "Курс болон ангиллыг бөглөнө үү"
  // sent the person looking at the two boxes they had already filled in.
  const missing: string[] = [];
  if (!course) missing.push("Курс");
  if (!studentCategory) missing.push("Сурагчийн ангилал");
  if (missing.length > 0) {
    return { ok: false, error: `${missing.join(", ")} талбарыг бөглөнө үү` };
  }
  // The teacher's category is deliberately NOT required: leaving it empty is
  // how the admin says "no teacher certificates in this batch", and everyone
  // then gets the student's wording. See planCertificatesForProgram.
  for (const value of [course, studentCategory, teacherCategory]) {
    if (isTooLong(value, MAX_LEN.certificateNumber)) {
      return { ok: false, error: "Талбар хэт урт байна" };
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedDate)) {
    return { ok: false, error: "Огноог сонгоно уу" };
  }
  return { ok: true, value: { course, studentCategory, teacherCategory, issuedDate } };
}
