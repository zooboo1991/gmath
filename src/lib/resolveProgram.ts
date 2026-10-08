import { findCourseById, findYearlyProgramById } from "./db";
import { classWeekdays } from "./attendDays";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolvedProgram = {
  label: string;
  price: string;
  tag: string;
  /** The weekdays a course meets (from its dated lessons); empty for a yearly programme. */
  weekdays: number[];
};

/**
 * Resolves a course/yearly-program id to its label/price/tag server-side —
 * never trust a client-supplied price. Same id-shape split (a yearly
 * program's id never looks like a UUID) already used inline by /api/enroll
 * and /api/admin/notifications.
 */
export async function resolveProgram(programId: string): Promise<ResolvedProgram | undefined> {
  const yearlyProgram = await findYearlyProgramById(programId);
  if (yearlyProgram) {
    return { label: yearlyProgram.label, price: yearlyProgram.price, tag: yearlyProgram.tag, weekdays: [] };
  }
  if (UUID_RE.test(programId)) {
    const course = await findCourseById(programId);
    if (!course) return undefined;
    return {
      label: `${course.title} (${course.tag})`,
      price: course.price,
      tag: course.tag,
      weekdays: classWeekdays(course.lessons),
    };
  }
  return undefined;
}
