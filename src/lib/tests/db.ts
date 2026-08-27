import { getSupabase } from "../supabase";
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
