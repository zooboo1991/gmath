import type { Metadata } from "next";

/**
 * Wraps both the login page and the panel, for one reason: the manifest.
 *
 * The site's own manifest starts at /profile — install it and you get the
 * student app. A teacher wants the opposite, so /admin points at a manifest
 * of its own (scope /admin, start_url /admin). Browsers install per manifest,
 * so both can sit on the same phone as separate apps with separate icons.
 *
 * It has to be declared here rather than inside (panel) so it is present on
 * the login page too — that is the page a teacher is on when they decide to
 * install it.
 */
export const metadata: Metadata = {
  manifest: "/admin-manifest.webmanifest",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
