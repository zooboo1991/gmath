/**
 * Classes of a programme too big for one classroom — client-safe, so the admin
 * roster, the register, the family's timetable and the reminder cron all read a
 * lesson the same way.
 *
 * Each in-person lesson may name the class it is for (Lesson.group) and each
 * child belongs to one class (registrations.class_group). A lesson with no class
 * is everyone's (online lessons stay shared); a child with no class yet is
 * expected at every class's lessons, so nobody silently loses a lesson before
 * the admin has placed them.
 */

/** The classes a programme can be split into. */
export const CLASS_GROUPS = [1, 2] as const;

/** "1-р анги" — how a class is named to staff and families alike. */
export function classGroupLabel(group: number): string {
  return `${group}-р анги`;
}

/** A class number from stored or posted input, or undefined when it is not one. */
export function cleanClassGroup(raw: unknown): number | undefined {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return typeof n === "number" && (CLASS_GROUPS as readonly number[]).includes(n) ? n : undefined;
}

/** Whether a child of `childGroup` is expected at a lesson for `lessonGroup`. Unset on either side: yes. */
export function inClassGroup(childGroup: number | undefined, lessonGroup: number | undefined): boolean {
  return !lessonGroup || !childGroup || childGroup === lessonGroup;
}
