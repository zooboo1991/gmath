import { getSupabase } from "./supabase";
import { fetchAllRows } from "./fetchAll";

/**
 * What the school itself did in a date range, next to the traffic figures.
 *
 * Every count is a head-only query on one table's timestamp — nothing here
 * reads rows. Each falls back to zero on its own: a newer table missing on an
 * install must not blank the whole analytics page.
 */
export type ActivityStats = {
  assessment: { started: number; submitted: number; completed: number };
  waitlist: number;
  chat: { conversations: number; issues: number };
  certificates: { downloads: number; verifies: number };
  /** Distinct students the Zoom webhook saw in a lesson during the range. */
  attended: number;
  /** Notifications the admin sent. */
  notifications: number;
};

async function countInRange(
  table: string,
  column: string,
  fromIso: string,
  toIso: string,
  filters: Record<string, string> = {}
): Promise<number> {
  let query = getSupabase()
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(column, fromIso)
    .lte(column, toIso);
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** Distinct students seen in a lesson — a count of rows would double-count rejoins. */
async function countAttendees(fromIso: string, toIso: string): Promise<number> {
  type Row = { user_id: string; users: { is_test?: boolean | null } | null };
  // Paged: one busy month of lessons passes a thousand rows, and the count
  // would then stop moving without anything looking wrong.
  const rows = await fetchAllRows<Row>(() =>
    getSupabase()
      .from("lesson_attendance")
      .select("user_id, users(is_test)")
      .gte("joined_at", fromIso)
      .lte("joined_at", toIso)
      .order("id")
  );
  return new Set(rows.filter((row) => !row.users?.is_test).map((row) => row.user_id)).size;
}

export async function getActivityStats(fromDate: string, toDate: string): Promise<ActivityStats> {
  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;
  const zero = () => 0;

  const [
    started,
    submitted,
    completed,
    waitlist,
    conversations,
    issues,
    downloads,
    verifies,
    attended,
    notifications,
  ] = await Promise.all([
    countInRange("assessments", "created_at", fromIso, toIso).catch(zero),
    // Handed in and marked are both status changes, so they are counted by
    // when the row last moved rather than when it was created.
    countInRange("assessments", "updated_at", fromIso, toIso, { status: "problems_submitted" }).catch(zero),
    countInRange("assessments", "updated_at", fromIso, toIso, { status: "completed" }).catch(zero),
    countInRange("waitlist_requests", "created_at", fromIso, toIso).catch(zero),
    countInRange("chat_conversations", "started_at", fromIso, toIso).catch(zero),
    countInRange("chat_issues", "created_at", fromIso, toIso).catch(zero),
    countInRange("certificate_events", "created_at", fromIso, toIso, { kind: "download" }).catch(zero),
    countInRange("certificate_events", "created_at", fromIso, toIso, { kind: "verify" }).catch(zero),
    countAttendees(fromIso, toIso).catch(zero),
    countInRange("notifications", "created_at", fromIso, toIso).catch(zero),
  ]);

  return {
    assessment: { started, submitted, completed },
    waitlist,
    chat: { conversations, issues },
    certificates: { downloads, verifies },
    attended,
    notifications,
  };
}
