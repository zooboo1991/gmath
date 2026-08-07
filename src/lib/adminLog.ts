import { getSupabase } from "./supabase";
import { getClientIp } from "./rateLimit";

/**
 * Records what a shared admin login did, not who did it — there's only one
 * ADMIN_PASSWORD and one generic session cookie (see lib/session.ts), no
 * per-admin identity to attach. `ip` is the closest available forensic
 * signal. Mirrors the conventions in lib/db.ts: row type, `xFromRow`
 * mapper, throw on read errors — but never on write, since a broken logger
 * must not be able to break the admin action it's recording.
 */

export type AdminLogEntry = {
  id: string;
  actionType: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
};

type AdminLogRow = {
  id: string;
  action_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
};

function adminLogFromRow(row: AdminLogRow): AdminLogEntry {
  return {
    id: row.id,
    actionType: row.action_type,
    targetId: row.target_id ?? undefined,
    details: row.details ?? undefined,
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
