/**
 * Admin roles: what each may see, and what each may change.
 *
 * Deliberately free of any server-only import (no next/headers, no db) so the
 * sidebar — a client component — can use canView() without dragging the
 * session/database layer into the browser bundle. The enforcement half lives
 * in lib/adminAccess.ts and in each route handler.
 *
 *   full    — everything (the owner)
 *   viewer  — read-only, and only the sections listed below
 *   teacher — takes attendance, marks work, adds recordings and notes.
 *             Never money: no payments, no confirming registrations, no
 *             editing a course's price or whether it is published.
 */
export type AdminRole = "full" | "viewer" | "teacher";

export const VIEWER_SECTIONS = [
  "dashboard",
  "registrations",
  "courses",
  "users",
  "analytics",
] as const;

export type AdminSection =
  | (typeof VIEWER_SECTIONS)[number]
  | "articles"
  | "certificates"
  /** Setting the assessment up: the problem bank, exams, levels, fees. */
  | "assessment"
  /** Marking what students submitted. Split from the above so a teacher gets
   *  the queue without the fee settings and the problem bank. */
  | "grading"
  /** Ирц бүртгэх: the teacher's register for classroom lessons. */
  | "attendance"
  | "notifications"
  /** Хүлээлгийн жагсаалт: who is waiting for a class that does not exist yet. */
  | "waitlist"
  | "chat"
  /** Гэрээний загварууд: Word файл, тагийн зураглал, сургалттай холбох. */
  | "contracts"
  | "logs"
  | "staff"
  | "courseEditor";

/**
 * A teacher's sections: the register, and the work waiting to be marked.
 *
 * Not the dashboard — its first tile is total revenue. Not the course pages
 * either: taking attendance was what took them there, and it now has a screen
 * of its own built for the job.
 */
export const TEACHER_SECTIONS = ["attendance", "grading"] as const;

export function canView(role: AdminRole, section: AdminSection): boolean {
  if (role === "full") return true;
  if (role === "teacher") return (TEACHER_SECTIONS as readonly string[]).includes(section);
  return (VIEWER_SECTIONS as readonly string[]).includes(section);
}

/**
 * What a role may change. Sections answer "which page"; these answer "which
 * button on it", which is the question a teacher's account actually raises —
 * they need the course page for attendance and recordings while the price and
 * the registration queue on that same page stay out of reach.
 */
export type AdminCapability =
  /** Lesson rows: topic, schedule, Zoom link, recording, notes, attendance. */
  | "lessons"
  /** A course's own fields: title, price, status, Facebook group, capacity. */
  | "courseInfo"
  /** Approving, cancelling, adding payments — anything about money or seats. */
  | "registrations"
  /** The grading queue: scores, comments, marked scans, final level. */
  | "grading"
  /** The problem bank, exams, levels, fees. */
  | "assessmentSetup"
  /** Articles, notifications, certificates, chat, settings, staff accounts. */
  | "siteAdmin";

const CAPABILITIES: Record<AdminRole, readonly AdminCapability[]> = {
  full: ["lessons", "courseInfo", "registrations", "grading", "assessmentSetup", "siteAdmin"],
  teacher: ["lessons", "grading"],
  viewer: [],
};

export function can(role: AdminRole, capability: AdminCapability): boolean {
  return CAPABILITIES[role].includes(capability);
}
