import { redirect } from "next/navigation";
import { can, canView, type AdminCapability, type AdminRole, type AdminSection } from "./adminSections";
import { getAdminActor, getAdminRole, type AdminActor } from "./session";

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

/**
 * The capability check every mutating admin route needs.
 *
 * `isFullAdmin()` was the whole of it while there were two roles and one of
 * them could do nothing. A teacher can do some things — take attendance, mark
 * work, add a recording — so "may this session do THIS" replaces "is this the
 * owner". Returns the actor so a route can log who acted.
 */
export async function requireCapability(
  capability: AdminCapability
): Promise<{ ok: true; actor: AdminActor } | { ok: false }> {
  const actor = await getAdminActor();
  if (!actor || !can(actor.role, capability)) return { ok: false };
  return { ok: true, actor };
}

/** The 401 body every admin route already returns for a refused write. */
export const REFUSED = { ok: false, error: "Зөвшөөрөлгүй" } as const;
