import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service_role key. This bypasses
 * Row Level Security entirely — safe here because every table access goes
 * through our own Next.js API routes / server components, which already
 * gate access via the session/admin cookies in lib/session.ts. Never import
 * this client into client components or expose the service_role key to
 * the browser.
 *
 * Built lazily (on first use, not on module load) so that `next build`'s
 * page-data-collection step — which imports this module without the real
 * runtime env vars present — doesn't crash with "supabaseUrl is required".
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
      );
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
