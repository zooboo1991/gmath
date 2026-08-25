import { getSupabase } from "./supabase";
import { toPublicUser, userFromRow, type PublicUser, type UserRow } from "./db";

export type WaitlistStatus = "waiting" | "notified" | "closed";

export type WaitlistRequest = {
  id: string;
  userId: string;
  grade: string;
  note: string;
  status: WaitlistStatus;
  createdAt: string;
  notifiedAt?: string;
};

export type WaitlistRequestWithUser = WaitlistRequest & { user?: PublicUser };

type WaitlistRow = {
  id: string;
  user_id: string;
  grade: string;
  note: string;
  status: WaitlistStatus;
  created_at: string;
  notified_at: string | null;
};

function fromRow(row: WaitlistRow): WaitlistRequest {
  return {
    id: row.id,
    userId: row.user_id,
    grade: row.grade,
    note: row.note ?? "",
    status: row.status,
    createdAt: row.created_at,
    notifiedAt: row.notified_at ?? undefined,
  };
}

/**
 * Joins the queue, or updates the note of a request already in it.
 *
 * Upsert rather than insert: a parent who writes "orой tohиromjtoi" and then
 * remembers the weekend also works should not end up counted twice.
 */
export async function joinWaitlist(input: {
  userId: string;
  grade: string;
  note: string;
}): Promise<WaitlistRequest> {
  const { data, error } = await getSupabase()
    .from("waitlist_requests")
    .upsert(
      {
        user_id: input.userId,
        grade: input.grade,
        note: input.note,
        status: "waiting",
        notified_at: null,
      },
      { onConflict: "user_id,grade" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as WaitlistRow);
}

export async function listWaitlistByUser(userId: string): Promise<WaitlistRequest[]> {
  const { data, error } = await getSupabase()
    .from("waitlist_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as WaitlistRow[]).map(fromRow);
}

/** Removes one request — only ever the asker's own, checked by the caller. */
export async function leaveWaitlist(id: string, userId: string): Promise<boolean> {
  const { error, count } = await getSupabase()
    .from("waitlist_requests")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** The whole queue, newest first, with who is waiting. */
export async function listWaitlist(): Promise<WaitlistRequestWithUser[]> {
  const { data, error } = await getSupabase()
    .from("waitlist_requests")
    .select("*, users(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as (WaitlistRow & { users: UserRow | null })[]).map(
    (row) => {
      const { users, ...rest } = row;
      return {
        ...fromRow(rest),
        user: users ? toPublicUser(userFromRow(users)) : undefined,
      };
    }
  );
}

/** Marks the people just told about a new class, so the queue stops nagging. */
export async function setWaitlistStatus(ids: string[], status: WaitlistStatus): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await getSupabase()
    .from("waitlist_requests")
    .update(
      { status, notified_at: status === "notified" ? new Date().toISOString() : null },
      { count: "exact" }
    )
    .in("id", ids);
  if (error) throw error;
  return count ?? 0;
}
