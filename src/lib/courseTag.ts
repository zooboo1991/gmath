// The `tag` shown on every course card ("B АНГИЛАЛ СУРАГЧ") used to be one
// free-text field. The admin form now offers a category (B–F) + audience
// (student/teacher) picker for the common case, generating the tag
// automatically — with an optional custom-label override for courses that
// don't fit that shape (teacher-specialty courses, multi-category combos
// like the pre-existing "B,E АНГИЛАЛ сурагч").

export const COURSE_CATEGORIES = ["B", "C", "D", "E", "F"] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];
export type CourseAudience = "student" | "teacher";

export function buildCourseTag(
  category: CourseCategory | "",
  audience: CourseAudience,
  customLabel: string
): string {
  if (customLabel.trim()) return customLabel.trim();
  const audienceLabel = audience === "teacher" ? "БАГШ" : "СУРАГЧ";
  if (category) return `${category} АНГИЛАЛ ${audienceLabel}`;
  return audience === "teacher" ? "БАГШИЙН СУРГАЛТ" : "СУРАГЧИЙН СУРГАЛТ";
}

/**
 * Best-effort split of an existing tag back into category/audience so the
 * admin form can pre-select them when editing. Anything that doesn't match
 * the clean "<letter> АНГИЛАЛ <СУРАГЧ|БАГШ>" pattern (multi-category combos,
 * teacher-specialty names, etc.) is preserved as-is in `customLabel` so
 * editing never silently rewrites content the admin didn't touch.
 */
export function parseCourseTag(tag: string): {
  category: CourseCategory | "";
  audience: CourseAudience;
  customLabel: string;
} {
  const match = tag.trim().match(/^([B-F])\s+АНГИЛАЛ\s+(СУРАГЧ|БАГШ)$/i);
  if (match) {
    const category = match[1].toUpperCase() as CourseCategory;
    const audience: CourseAudience = match[2].toUpperCase() === "БАГШ" ? "teacher" : "student";
    return { category, audience, customLabel: "" };
  }
  const audience: CourseAudience = /багш/i.test(tag) ? "teacher" : "student";
  return { category: "", audience, customLabel: tag };
}
