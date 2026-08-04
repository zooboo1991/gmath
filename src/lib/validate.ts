export const MAX_LEN = {
  name: 50,
  school: 150,
  province: 60,
  district: 60,
  email: 254,
  social: 100,
  password: 200,
  courseTag: 100,
  courseTitle: 150,
  courseTopics: 600,
  coursePrice: 40,
  coursePeriod: 30,
  courseMode: 50,
  courseDate: 30,
  courseFacebookGroup: 300,
  courseZoomLink: 500,
  courseZoomMeetingId: 60,
  courseZoomPasscode: 60,
  lessonTopic: 200,
  lessonSchedule: 200,
  articleTitle: 200,
  articleExcerpt: 500,
  articleContent: 60000,
  articleAuthor: 100,
  analyticsPath: 300,
  analyticsReferrer: 500,
  certificateNumber: 60,
  certificateCategory: 150,
  certificateCourse: 200,
  problemTopic: 120,
  problemBody: 4000,
  problemAnswerKey: 2000,
  levelName: 80,
  levelText: 2000,
  settingValue: 200,
  notificationTitle: 150,
  notificationBody: 2000,
} as const;

export function isTooLong(value: unknown, max: number): boolean {
  return typeof value === "string" && value.length > max;
}

// Links supplied by an admin end up as `href` values, so anything other than
// a plain http(s) URL (e.g. a `javascript:` URL) must be rejected before it
// is stored.
export function isValidHttpUrl(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const { protocol } = new URL(value.trim());
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// Tiptap's "empty" editor state is still non-empty HTML (e.g. "<p></p>"),
// so a plain string-emptiness check always passes. Strip tags before
// judging whether there's actually anything there (an image with no
// caption text still counts as real content).
export function isEmptyHtml(html: unknown): boolean {
  if (typeof html !== "string" || !html) return true;
  if (/<img[\s>]/i.test(html)) return false;
  return html.replace(/<[^>]*>/g, "").trim().length === 0;
}
