/**
 * Admin roles and what each may see. Deliberately free of any server-only
 * import (no next/headers, no db) so the sidebar — a client component — can
 * use canView() without dragging the session/database layer into the browser
 * bundle. The enforcement half lives in lib/adminAccess.ts.
 *
 *   full   — everything (the original single admin)
 *   viewer — read-only, and only the sections listed below
 */
export type AdminRole = "full" | "viewer";

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
  | "assessment"
  | "notifications"
  | "chat"
  | "logs"
  | "courseEditor";

export function canView(role: AdminRole, section: AdminSection): boolean {
  if (role === "full") return true;
  return (VIEWER_SECTIONS as readonly string[]).includes(section);
}
