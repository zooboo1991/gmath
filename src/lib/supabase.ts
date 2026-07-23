import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service_role key. This bypasses
 * Row Level Security entirely — safe here because every table access goes
 * through our own Next.js API routes / server components, which already
 * gate access via the session/admin cookies in lib/session.ts. Never import
 * this client into client components or expose the service_role key to
 * the browser.
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
