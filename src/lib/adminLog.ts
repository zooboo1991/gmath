import { getSupabase } from "./supabase";
import { getClientIp } from "./rateLimit";
import { getAdminActor } from "./session";

/**
 * Records what an admin action did, and — since named accounts exist — who did
 * it. `actorName` is absent for anything done with the environment password,
 * which has no name to record; `ip` remains the only signal in that case.
 *
 * Mirrors the conventions in lib/db.ts: row type, `xFromRow` mapper, throw on
 * read errors — but never on write, since a broken logger must not be able to
 * break the admin action it is recording.
 */

export type AdminLogEntry = {
  id: string;
  actionType: string;
  targetId?: string;
  details?: Record<string, unknown>;
  /** The named account that did it. Absent for the environment password. */
  actorName?: string;
  ip?: string;
  createdAt: string;
};

type AdminLogRow = {
  id: string;
  action_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  actor_name: string | null;
  ip: string | null;
  created_at: string;
};

function adminLogFromRow(row: AdminLogRow): AdminLogEntry {
  return {
    id: row.id,
    actionType: row.action_type,
    targetId: row.target_id ?? undefined,
    details: row.details ?? undefined,
    actorName: row.actor_name ?? undefined,
    ip: row.ip ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Fire-and-forget by design — call it right after a mutation succeeds and
 * don't let a logging hiccup turn into a 500 for an action that already
 * went through.
 */
export async function logAdminAction(
  request: Request,
  input: { actionType: string; targetId?: string; details?: Record<string, unknown> }
): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from("admin_logs")
      .insert({
        action_type: input.actionType,
        target_id: input.targetId ?? null,
        details: input.details ?? null,
        // Read from the session rather than passed in by every caller: there
        // are forty call sites and one of them would eventually forget.
        actor_name: (await getAdminActor())?.name ?? null,
        ip: getClientIp(request.headers),
      });
    if (error) console.error("[adminLog] insert failed:", error);
  } catch (err) {
    console.error("[adminLog] insert threw:", err);
  }
}

export async function listAdminLogs(limit = 200): Promise<AdminLogEntry[]> {
  const { data, error } = await getSupabase()
    .from("admin_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as AdminLogRow[]).map(adminLogFromRow);
}
