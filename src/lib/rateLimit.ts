import { getSupabase } from "./supabase";

type RateLimitRow = {
  key: string;
  attempts: number;
  window_start: string;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

/**
 * Simple fixed-window counter backed by Postgres (serverless functions have
 * no shared memory, so this can't live in-process). Not perfectly atomic
 * under heavy concurrent abuse from the same key — acceptable here, the
 * goal is closing the "unlimited attempts" gap, not building a distributed
 * rate limiter.
 *
 * Fails OPEN (returns allowed:true) on any infrastructure error — e.g. the
 * `rate_limits` table missing because the migration hasn't run yet. A rate
 * limiter's own storage failing should never be able to take down login.
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    return await checkRateLimitStrict(key, maxAttempts, windowSeconds);
  } catch (err) {
    console.error("[rateLimit] failing open due to error:", err);
    return { allowed: true };
  }
}

async function checkRateLimitStrict(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const supabase = getSupabase();
  const now = Date.now();

  const { data: existing, error: selectError } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (selectError) throw selectError;

  const row = existing as RateLimitRow | null;

  if (!row) {
    const { error } = await supabase
      .from("rate_limits")
      .insert({ key, attempts: 1, window_start: new Date(now).toISOString() });
    if (error && error.code !== "23505") throw error;
    return { allowed: true };
  }

  const elapsedSeconds = (now - new Date(row.window_start).getTime()) / 1000;

  if (elapsedSeconds > windowSeconds) {
    const { error } = await supabase
      .from("rate_limits")
      .update({ attempts: 1, window_start: new Date(now).toISOString() })
      .eq("key", key);
    if (error) throw error;
    return { allowed: true };
  }

  if (row.attempts >= maxAttempts) {
    return { allowed: false, retryAfterSeconds: Math.ceil(windowSeconds - elapsedSeconds) };
  }

  const { error } = await supabase
    .from("rate_limits")
    .update({ attempts: row.attempts + 1 })
    .eq("key", key);
  if (error) throw error;
  return { allowed: true };
}

/**
 * Reads the counter without touching it.
 *
 * `checkRateLimit` both tests and increments, which is right for endpoints
 * where every call is the thing being limited (chat messages, page views).
 * It is wrong where only *failures* should count: a login that succeeds is
 * not an attack, and counting it locks a family out of their own account.
 * Those callers peek first, then record a failure only when there is one.
 *
 * Fails OPEN, same as the rest of this module.
 */
export async function peekRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    const { data, error } = await getSupabase()
      .from("rate_limits")
      .select("*")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;

    const row = data as RateLimitRow | null;
    if (!row) return { allowed: true };

    const elapsedSeconds = (Date.now() - new Date(row.window_start).getTime()) / 1000;
    if (elapsedSeconds > windowSeconds) return { allowed: true };
    if (row.attempts >= maxAttempts) {
      return { allowed: false, retryAfterSeconds: Math.ceil(windowSeconds - elapsedSeconds) };
    }
    return { allowed: true };
  } catch (err) {
    console.error("[rateLimit] peek failing open due to error:", err);
    return { allowed: true };
  }
}

/** Counts one failure against the key, starting a fresh window if the old one has run out. */
export async function recordFailedAttempt(key: string, windowSeconds: number): Promise<void> {
  try {
    const supabase = getSupabase();
    const now = Date.now();

    const { data, error: selectError } = await supabase
      .from("rate_limits")
      .select("*")
      .eq("key", key)
      .maybeSingle();
    if (selectError) throw selectError;

    const row = data as RateLimitRow | null;
    if (!row) {
      const { error } = await supabase
        .from("rate_limits")
        .insert({ key, attempts: 1, window_start: new Date(now).toISOString() });
      if (error && error.code !== "23505") throw error;
      return;
    }

    const elapsedSeconds = (now - new Date(row.window_start).getTime()) / 1000;
    const patch =
      elapsedSeconds > windowSeconds
        ? { attempts: 1, window_start: new Date(now).toISOString() }
        : { attempts: row.attempts + 1 };
    const { error } = await supabase.from("rate_limits").update(patch).eq("key", key);
    if (error) throw error;
  } catch (err) {
    console.error("[rateLimit] recording a failure failed:", err);
  }
}

/** Wipes the counter — used after a success, so one good login clears the slate. */
export async function clearRateLimit(key: string): Promise<void> {
  try {
    const { error } = await getSupabase().from("rate_limits").delete().eq("key", key);
    if (error) throw error;
  } catch (err) {
    console.error("[rateLimit] clearing failed:", err);
  }
}

/**
 * Takes `Headers` rather than a `Request` so it works from both Route
 * Handlers (`request.headers`) and Server Components (`await headers()`
 * from `next/headers`), which have no `Request` to hand it.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
