import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * Crawlers were previously getting a 404 here, which also meant nothing
 * pointed them at the sitemap — 36 articles' worth of content Google had to
 * find by luck.
 *
 * /admin and /api are disallowed because they are useless in search results
 * (both are gated anyway — this is tidiness, not a security control; a
 * disallow line is public and is never what keeps anything private).
 * /profile is per-account and has nothing crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/profile"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
