import type { MetadataRoute } from "next";
import { listArticles, listPublishedCourseSummaries, listYearlyPrograms } from "@/lib/db";
import { SITE_URL } from "@/lib/siteUrl";
import { courseHref } from "@/lib/courseHref";

/**
 * Generated rather than static, because the valuable half of this site is
 * database-driven: 36 articles and every published course. A hand-written
 * sitemap would go stale the moment an article is posted.
 *
 * Best-effort by design — if Supabase is unreachable the static pages still
 * get served rather than the whole sitemap 500ing, since a partial sitemap is
 * far better for crawlers than none.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/courses`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/articles`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/assessment`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/certificate`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/teacher`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/team`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/team/batchimeg`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/data-deletion`, changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
    const [courses, yearly, articles] = await Promise.all([
      listPublishedCourseSummaries(),
      listYearlyPrograms(),
      listArticles(),
    ]);

    return [
      ...staticPages,
      ...courses.map((c) => ({
        url: `${SITE_URL}${courseHref(c)}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      // Yearly programmes live at hand-written /courses/c and /courses/d pages
      // rather than the course-id pattern — same mapping Courses.tsx uses.
      ...yearly.map((p) => ({
        url: `${SITE_URL}/courses/${p.id.replace("program-", "")}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      ...articles.map((a) => ({
        url: `${SITE_URL}/articles/${a.id}`,
        lastModified: new Date(a.createdAt),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ];
  } catch (err) {
    console.error("[sitemap] failed to load database entries:", err);
    return staticPages;
  }
}
