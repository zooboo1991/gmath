import { redirect } from "next/navigation";
import { canView, type AdminRole, type AdminSection } from "./adminSections";
import { getAdminRole } from "./session";

/**
 * Server-side gate for an admin page. Called at the top of every page the
 * read-only account must not reach — the sidebar simply not linking there is
 * not a control, since the URL can be typed.
 *
 * Returns the role so the page can pass `canEdit` down to its panel. A
 * signed-out visitor goes to the login form; a viewer who reaches a section
 * they lack goes back to the dashboard rather than seeing an error page.
 */
export async function requireAdminSection(section: AdminSection): Promise<AdminRole> {
  const role = await getAdminRole();
  if (!role) redirect("/admin/login");
  if (!canView(role, section)) redirect("/admin");
  return role;
}
