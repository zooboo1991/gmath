export const MAX_LEN = {
  name: 50,
  school: 150,
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
  lessonTopic: 200,
  lessonSchedule: 200,
  articleTitle: 200,
  articleExcerpt: 500,
  articleContent: 20000,
  articleAuthor: 100,
} as const;

export function isTooLong(value: unknown, max: number): boolean {
  return typeof value === "string" && value.length > max;
}
