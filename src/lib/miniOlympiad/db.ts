import { getSupabase } from "../supabase";
import { fetchAllRows } from "../fetchAll";
import { createNotification, listAllRegistrations } from "../db";
import { MINI_OLYMPIAD_BUCKET } from "../storage";
import { standings, totalOf, type ProblemScore } from "./score";

export type MiniOlympiad = {
  id: string;
  programId: string;
  title: string;
  heldOn: string;
  problemCount: number;
  maxPerProblem: number;
  publishedAt?: string;
  createdAt: string;
};

export type OlympiadFile = { path: string; name: string; size: number };

export type OlympiadResult = {
  id: string;
  olympiadId: string;
  userId: string;
  scores: ProblemScore[];
  comments: string[];
  /** Teacher-only. Never sent to a family. */
  notes: string[];
  files: OlympiadFile[];
  /** When the family was told the results are out. */
  notifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/** A registered child of the programme, as the admin links a result to them. */
export type OlympiadRosterEntry = {
  userId: string;
  name: string;
  phone: string;
  isTest?: boolean;
  /** No longer on the programme, but still has a result in this olympiad. */
  left?: boolean;
};

type OlympiadRow = {
  id: string;
  program_id: string;
  title: string;
  held_on: string;
  problem_count: number;
  max_per_problem: number;
  published_at: string | null;
  created_at: string;
};

type ResultRow = {
  id: string;
  olympiad_id: string;
  user_id: string;
  scores: ProblemScore[] | null;
  comments: string[] | null;
  notes: string[] | null;
  files: OlympiadFile[] | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
};

function olympiadFromRow(row: OlympiadRow): MiniOlympiad {
  return {
    id: row.id,
    programId: row.program_id,
    title: row.title,
    heldOn: row.held_on,
    problemCount: row.problem_count,
    maxPerProblem: row.max_per_problem,
    publishedAt: row.published_at ?? undefined,
    createdAt: row.created_at,
  };
}

/** Pads or trims a stored per-problem array to the olympiad's problem count. */
function fit<T>(values: T[] | null, count: number, fill: T): T[] {
  const list = Array.isArray(values) ? values.slice(0, count) : [];
  while (list.length < count) list.push(fill);
  return list;
}

function resultFromRow(row: ResultRow, count: number): OlympiadResult {
  return {
    id: row.id,
    olympiadId: row.olympiad_id,
    userId: row.user_id,
    scores: fit<ProblemScore>(row.scores, count, null),
    comments: fit(row.comments, count, ""),
    notes: fit(row.notes, count, ""),
    files: Array.isArray(row.files) ? row.files : [],
    notifiedAt: row.notified_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Newest olympiad first. */
export async function listOlympiads(): Promise<MiniOlympiad[]> {
  const rows = await fetchAllRows<OlympiadRow>(() =>
    getSupabase()
      .from("mini_olympiads")
      .select("*")
      .order("held_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
  );
  return rows.map(olympiadFromRow);
}

export async function findOlympiad(id: string): Promise<MiniOlympiad | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const { data, error } = await getSupabase().from("mini_olympiads").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? olympiadFromRow(data as OlympiadRow) : undefined;
}

export async function createOlympiad(input: {
  programId: string;
  title: string;
  heldOn: string;
  problemCount: number;
  maxPerProblem: number;
}): Promise<MiniOlympiad> {
  const { data, error } = await getSupabase()
    .from("mini_olympiads")
    .insert({
      program_id: input.programId,
      title: input.title,
      held_on: input.heldOn,
      problem_count: input.problemCount,
      max_per_problem: input.maxPerProblem,
    })
    .select("*")
    .single();
  if (error) throw error;
  return olympiadFromRow(data as OlympiadRow);
}

export async function updateOlympiad(
  id: string,
  patch: Partial<{ title: string; held_on: string; max_per_problem: number }>
): Promise<MiniOlympiad | undefined> {
  const { data, error } = await getSupabase().from("mini_olympiads").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? olympiadFromRow(data as OlympiadRow) : undefined;
}

/** Publishes (families see their child's result) or hides the results. */
export async function setPublished(id: string, publish: boolean): Promise<MiniOlympiad | undefined> {
  const { data, error } = await getSupabase()
    .from("mini_olympiads")
    .update({ published_at: publish ? new Date().toISOString() : null })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? olympiadFromRow(data as OlympiadRow) : undefined;
}

/**
 * Tells every family of a published olympiad not yet told — on publishing, and
 * again for children added afterwards. The rows are claimed first (guarded on
 * notified_at being empty) so a family is told once however often the admin
 * toggles; if sending fails the claim is released for the next try, and the
 * error is thrown for the caller to report.
 */
export async function notifyPending(olympiad: MiniOlympiad): Promise<number> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  // Only children still on the programme: the link opens their course page, which a child who left cannot see.
  const onProgramme = new Set((await listOlympiadRoster(olympiad.programId)).map((r) => r.userId));
  const { data: waiting, error: waitingError } = await supabase
    .from("mini_olympiad_results")
    .select("id, user_id")
    .eq("olympiad_id", olympiad.id)
    .is("notified_at", null);
  if (waitingError) throw waitingError;
  const ids = ((waiting ?? []) as { id: string; user_id: string }[]).filter((r) => onProgramme.has(r.user_id)).map((r) => r.id);
  const userIds: string[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("mini_olympiad_results")
      .update({ notified_at: now })
      .in("id", ids.slice(i, i + 100))
      .is("notified_at", null)
      .select("user_id");
    if (error) throw error;
    userIds.push(...((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
  }
  if (userIds.length === 0) return 0;
  try {
    await createNotification({
      title: "Мини олимпиадын дүн гарлаа",
      body: `${olympiad.title} — дүн гарлаа. Хүүхдийнхээ оноо, байр, багшийн тайлбарыг профайлаас харна уу.`,
      targetType: "users",
      userIds,
      channel: "site",
      link: `/profile/course/${encodeURIComponent(olympiad.programId)}?tab=olympiad`,
    });
  } catch (err) {
    const { error: releaseError } = await supabase
      .from("mini_olympiad_results")
      .update({ notified_at: null })
      .eq("olympiad_id", olympiad.id)
      .eq("notified_at", now);
    // Left claimed, these families would never be told: say which olympiad and when, to clear by hand.
    if (releaseError) console.error("[olympiads] releasing the notification claim failed", olympiad.id, now, releaseError.message);
    throw err;
  }
  return userIds.length;
}

/**
 * After results are saved: when the olympiad is already out, the families of
 * newly added children are told too. A failure is reported, not thrown — the
 * scores are saved either way.
 */
export async function notifyIfPublished(olympiad: MiniOlympiad): Promise<{ notified: number; notifyFailed?: true }> {
  if (!olympiad.publishedAt) return { notified: 0 };
  try {
    return { notified: await notifyPending(olympiad) };
  } catch (err) {
    console.error("[olympiads] notifying participants failed", olympiad.id, err);
    return { notified: 0, notifyFailed: true };
  }
}

export async function deleteOlympiad(id: string): Promise<void> {
  const { error } = await getSupabase().from("mini_olympiads").delete().eq("id", id);
  if (error) throw error;
}

export async function listResults(olympiad: MiniOlympiad): Promise<OlympiadResult[]> {
  const rows = await fetchAllRows<ResultRow>(() =>
    getSupabase().from("mini_olympiad_results").select("*").eq("olympiad_id", olympiad.id).order("id")
  );
  return rows.map((r) => resultFromRow(r, olympiad.problemCount));
}

export async function findResult(olympiad: MiniOlympiad, userId: string): Promise<OlympiadResult | undefined> {
  if (!UUID_RE.test(userId)) return undefined;
  const { data, error } = await getSupabase()
    .from("mini_olympiad_results")
    .select("*")
    .eq("olympiad_id", olympiad.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? resultFromRow(data as ResultRow, olympiad.problemCount) : undefined;
}

/** Creates or replaces one child's scores, comments and notes; files are left as they are. */
export async function upsertResult(
  olympiad: MiniOlympiad,
  userId: string,
  values: { scores: ProblemScore[]; comments: string[]; notes: string[] }
): Promise<OlympiadResult> {
  const { data, error } = await getSupabase()
    .from("mini_olympiad_results")
    .upsert(
      {
        olympiad_id: olympiad.id,
        user_id: userId,
        scores: values.scores,
        comments: values.comments,
        notes: values.notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "olympiad_id,user_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return resultFromRow(data as ResultRow, olympiad.problemCount);
}

/**
 * Changes one result's scan list. The list is read, changed and written back
 * only if nobody saved the row in between (guarded on updated_at), retrying a
 * few times — two admins adding or removing scans at once never lose or
 * resurrect each other's files. `change` returns an error message to refuse.
 */
export async function changeResultFiles(
  olympiad: MiniOlympiad,
  userId: string,
  change: (files: OlympiadFile[]) => OlympiadFile[] | { refuse: string; status?: number }
): Promise<{ result: OlympiadResult; before: OlympiadResult } | { refuse: string; status: number }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const before = await findResult(olympiad, userId);
    if (!before) return { refuse: "Эхлээд сурагчийн дүнг оруулна уу", status: 404 };
    const next = change(before.files);
    if ("refuse" in next) return { refuse: next.refuse, status: next.status ?? 400 };
    const { data, error } = await getSupabase()
      .from("mini_olympiad_results")
      .update({ files: next, updated_at: new Date().toISOString() })
      .eq("id", before.id)
      .eq("updated_at", before.updatedAt)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (data) return { result: resultFromRow(data as ResultRow, olympiad.problemCount), before };
  }
  return { refuse: "Өөр хүн зэрэг өөрчилж байна — дахин оролдоно уу", status: 409 };
}

/**
 * Removes scans from Storage. A failure is logged, not thrown: the rows are
 * already gone, and the leftover paths (no names in them) can be cleaned up
 * by hand.
 */
export async function removeOlympiadFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { error } = await getSupabase().storage.from(MINI_OLYMPIAD_BUCKET).remove(paths);
    if (error) console.error("[olympiads] removing scans failed", paths, error.message);
  } catch (err) {
    console.error("[olympiads] removing scans failed", paths, err);
  }
}

export async function deleteResult(olympiad: MiniOlympiad, userId: string): Promise<OlympiadResult | undefined> {
  const { data, error } = await getSupabase()
    .from("mini_olympiad_results")
    .delete()
    .eq("olympiad_id", olympiad.id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? resultFromRow(data as ResultRow, olympiad.problemCount) : undefined;
}

/**
 * The children registered (active) on the programme — whom a result can
 * belong to. Test accounts are listed (the owner tries the flow with one) but
 * marked, so they never count towards real children's places.
 */
export async function listOlympiadRoster(programId: string): Promise<OlympiadRosterEntry[]> {
  const regs = await listAllRegistrations();
  const seen = new Set<string>();
  const out: OlympiadRosterEntry[] = [];
  for (const r of regs) {
    if (r.programId !== programId || r.status !== "active" || !r.user || seen.has(r.user.id)) continue;
    seen.add(r.user.id);
    out.push({
      userId: r.user.id,
      name: `${r.user.lastName ?? ""} ${r.user.firstName ?? ""}`.trim() || r.user.phone,
      phone: r.user.phone,
      ...(r.user.isTest ? { isTest: true } : {}),
    });
  }
  return out;
}

/** Names of children who have a result but are no longer on the programme. */
export async function leftRosterEntries(userIds: string[]): Promise<OlympiadRosterEntry[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await getSupabase().from("users").select("id, first_name, last_name, phone, is_test").in("id", userIds);
  if (error) throw error;
  type Row = { id: string; first_name: string | null; last_name: string | null; phone: string; is_test: boolean | null };
  return ((data ?? []) as Row[]).map((u) => ({
    userId: u.id,
    name: `${u.last_name ?? ""} ${u.first_name ?? ""}`.trim() || u.phone,
    phone: u.phone,
    left: true,
    ...(u.is_test ? { isTest: true } : {}),
  }));
}

/** Test accounts among the given users (a result may outlive its registration). */
export async function testUserIds(userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < userIds.length; i += 100) {
    const { data, error } = await getSupabase().from("users").select("id").eq("is_test", true).in("id", userIds.slice(i, i + 100));
    if (error) throw error;
    for (const r of (data ?? []) as { id: string }[]) out.add(r.id);
  }
  return out;
}

/** What a family sees: only their own row, plus their place among everyone who took part. */
export type FamilyOlympiadView = {
  olympiadId: string;
  resultId: string;
  title: string;
  heldOn: string;
  problemCount: number;
  maxPerProblem: number;
  scores: ProblemScore[];
  comments: string[];
  /** Only positions: the uploaded file's name may be another child's ("D Anungoo.pdf" picked by hand). */
  files: { index: number }[];
  total: number;
  place: number;
  participants: number;
};

/**
 * The published olympiads of one programme that this child took part in,
 * newest first. Other children's rows are read only to count and place —
 * nothing of theirs leaves this function.
 */
export async function listOlympiadsForFamily(userId: string, programId: string): Promise<FamilyOlympiadView[]> {
  const { data, error } = await getSupabase()
    .from("mini_olympiads")
    .select("*")
    .eq("program_id", programId)
    .not("published_at", "is", null)
    .order("held_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const olympiads = ((data ?? []) as OlympiadRow[]).map(olympiadFromRow);
  const out: FamilyOlympiadView[] = [];
  for (const o of olympiads) {
    const results = await listResults(o);
    const mine = results.find((r) => r.userId === userId);
    if (!mine) continue;
    const tests = await testUserIds(results.map((r) => r.userId));
    const standing = standings(results.map((r) => ({ userId: r.userId, total: totalOf(r.scores), isTest: tests.has(r.userId) }))).get(userId)!;
    out.push({
      olympiadId: o.id,
      resultId: mine.id,
      title: o.title,
      heldOn: o.heldOn,
      problemCount: o.problemCount,
      maxPerProblem: o.maxPerProblem,
      scores: mine.scores,
      comments: mine.comments,
      files: mine.files.map((_, index) => ({ index })),
      total: totalOf(mine.scores),
      place: standing.place,
      participants: standing.participants,
    });
  }
  return out;
}

/** One result with its olympiad, for the family's file route (checks happen there). */
export async function findResultWithOlympiad(
  resultId: string
): Promise<{ result: OlympiadResult; olympiad: MiniOlympiad } | undefined> {
  if (!UUID_RE.test(resultId)) return undefined;
  const { data, error } = await getSupabase().from("mini_olympiad_results").select("*").eq("id", resultId).maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  const olympiad = await findOlympiad((data as ResultRow).olympiad_id);
  if (!olympiad) return undefined;
  return { result: resultFromRow(data as ResultRow, olympiad.problemCount), olympiad };
}
