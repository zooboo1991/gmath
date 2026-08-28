import { getSupabase } from "../supabase";
import { fetchAllRows } from "../fetchAll";
import { findTest, scoreTest } from "./index";
import type { TestOutcome } from "./types";

export type TestResult = {
  testSlug: string;
  answers: number[];
  scores: Record<string, number>;
  primaryCode: string;
  secondaryCode?: string;
  createdAt: string;
};

type ResultRow = {
  test_slug: string;
  answers: number[];
  scores: Record<string, number>;
  primary_code: string;
  secondary_code: string | null;
  created_at: string;
};

function fromRow(row: ResultRow): TestResult {
  return {
    testSlug: row.test_slug,
    answers: row.answers,
    scores: row.scores,
    primaryCode: row.primary_code,
    secondaryCode: row.secondary_code ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Stores what a child answered, scored here rather than taken from the page.
 * Retaking replaces the earlier sheet — the profile shows where they are now,
 * not a history of attempts.
 */
export async function saveTestResult(input: {
  userId: string;
  testSlug: string;
  answers: number[];
}): Promise<{ result: TestResult; outcome: TestOutcome } | undefined> {
  const test = findTest(input.testSlug);
  if (!test) return undefined;
  const outcome = scoreTest(test, input.answers);

  const { data, error } = await getSupabase()
    .from("personality_results")
    .upsert(
      {
        user_id: input.userId,
        test_slug: input.testSlug,
        answers: input.answers,
        scores: outcome.scores,
        primary_code: outcome.primaryCode,
        secondary_code: outcome.secondaryCode ?? null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,test_slug" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return { result: fromRow(data as ResultRow), outcome };
}

export async function listTestResults(userId: string): Promise<TestResult[]> {
  const { data, error } = await getSupabase()
    .from("personality_results")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ResultRow[]).map(fromRow);
}

export async function findTestResult(userId: string, testSlug: string): Promise<TestResult | undefined> {
  const { data, error } = await getSupabase()
    .from("personality_results")
    .select("*")
    .eq("user_id", userId)
    .eq("test_slug", testSlug)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as ResultRow) : undefined;
}

/**
 * The archetype each person landed on, newest test first — for the admin's
 * user list, where it is one column and not worth a query per row.
 */
export async function getPrimaryArchetypeByUser(): Promise<Record<string, { testSlug: string; primaryCode: string }>> {
  const rows = await fetchAllRows<{ user_id: string; test_slug: string; primary_code: string }>(() =>
    getSupabase()
      .from("personality_results")
      .select("user_id, test_slug, primary_code")
      .order("created_at", { ascending: false })
      .order("id")
  );
  const byUser: Record<string, { testSlug: string; primaryCode: string }> = {};
  // Newest first, so the first sighting of a user is their latest result.
  for (const row of rows) {
    if (!byUser[row.user_id]) {
      byUser[row.user_id] = { testSlug: row.test_slug, primaryCode: row.primary_code };
    }
  }
  return byUser;
}
