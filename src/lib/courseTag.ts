// The `tag` shown on every course card ("B АНГИЛАЛ СУРАГЧ") used to be one
// free-text field. The admin form now offers a category (B–F) + audience
// (student/teacher) picker for the common case, generating the tag
// automatically — with an optional custom-label override for courses that
// don't fit that shape (teacher-specialty courses, multi-category combos
// like the pre-existing "B,E АНГИЛАЛ сурагч").

// "A" is here because the live data uses it ("A АНГИЛАЛ СУРАГЧ"); leaving it
// out made those courses impossible to pick in the admin form and invisible
// to the category filter on /courses.
export const COURSE_CATEGORIES = ["A", "B", "C", "D", "E", "F"] as const;
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

// ---------------------------------------------------------------------------
// Filtering helpers for the public /courses page
// ---------------------------------------------------------------------------

/**
 * The word that marks the category letters in a tag. Matching the stem
 * "АНГИЛ" rather than the full "АНГИЛАЛ" also covers "ангиллын"; it
 * deliberately does NOT match "АНГИЙН" (as in "БАГА БОЛОН ДУНД АНГИЙН БАГШ"),
 * which is about school years, not categories.
 */
const CATEGORY_MARKER = "АНГИЛ";

/**
 * Every category letter a tag mentions. Real tags are messier than
 * buildCourseTag's output — "B,E АНГИЛАЛ сурагч" and
 * "A,B АНГИЛАЛ · ӨМНӨХ УЛИРАЛ" both name two categories — so a course can
 * legitimately belong to several. Returns [] when the tag names none
 * ("ДАСГАЛЖУУЛАГЧ БАГШ", "4-р анги").
 *
 * Only the text *before* the marker is scanned, so the Cyrillic А of
 * "АНГИЛАЛ" is never mistaken for the Latin category letter A.
 */
export function extractCourseCategories(tag: string): CourseCategory[] {
  const upper = tag.toUpperCase();
  const idx = upper.indexOf(CATEGORY_MARKER);
  if (idx < 0) return [];
  // Latin A-F only: the letters in the live data are Latin even though the
  // surrounding words are Cyrillic.
  const found = upper.slice(0, idx).match(/[A-F]/g) ?? [];
  return [...new Set(found)] as CourseCategory[];
}

/** Teacher courses always say "багш" somewhere in the tag; everything else is for students. */
export function getCourseAudience(tag: string): CourseAudience {
  return /багш/i.test(tag) ? "teacher" : "student";
}
