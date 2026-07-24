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

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
