/**
 * A course's public address.
 *
 * Courses are keyed by uuid, which makes for a link nobody can read out loud
 * or type from a poster. A course may carry a short `slug` instead; the uuid
 * address keeps working either way, so a link already shared in a Facebook
 * post does not break the day a slug is added.
 */
export function courseHref(course: { id: string; slug?: string | null }): string {
  return `/courses/${course.slug || course.id}`;
}
