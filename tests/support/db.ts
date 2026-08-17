/**
 * Direct database access for tests: seeding a row the app has no endpoint
 * for, and cleaning up afterwards.
 *
 * Every insert a test makes is registered here and deleted again by id at the
 * end. There is no "delete everything in the table" helper and there never
 * should be — see the rule in CLAUDE.md. Even against a throwaway database
 * that habit is the one worth keeping, because the day the wrong URL ends up
 * in .env.test is the day it matters.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadTestEnv } from "./env";

let client: SupabaseClient | null = null;

export function testDb(): SupabaseClient {
  if (!client) {
    const env = loadTestEnv();
    client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

type TrackedRow = { table: string; column: string; value: string };
type TrackedObject = { bucket: string; path: string };

const tracked: TrackedRow[] = [];
const trackedObjects: TrackedObject[] = [];

/** Registers a row for deletion by primary key. */
export function track(table: string, id: string | null | undefined): void {
  trackBy(table, "id", id);
}

/** Registers a row whose identifying column isn't `id` (e.g. rate_limits.key). */
export function trackBy(table: string, column: string, value: string | null | undefined): void {
  if (!table || !column) throw new Error("track() needs a table and a column");
  // An empty value would widen the delete below into "every row where the
  // column is empty" — refuse rather than guess.
  if (value === null || value === undefined || value === "") {
    throw new Error(`track(${table}.${column}) got an empty value — refusing to register it`);
  }
  tracked.push({ table, column, value });
}

/**
 * Registers an uploaded file for deletion. Storage objects are not rows and
 * are not cascaded by anything, so an upload test would otherwise leave the
 * bucket filling up.
 */
export function trackStorageObject(bucket: string, path: string): void {
  if (!bucket || !path) throw new Error("trackStorageObject needs a bucket and a path");
  trackedObjects.push({ bucket, path });
}

/**
 * Pulls the bucket and object path out of a Supabase public URL, which is
 * all an upload endpoint hands back.
 */
export function trackStorageUrl(publicUrl: string): void {
  const match = publicUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) throw new Error(`not a Supabase public object URL: ${publicUrl}`);
  trackStorageObject(match[1], decodeURIComponent(match[2]));
}

/**
 * Deletes exactly the rows this run registered, newest first so a child row
 * goes before the parent it references. Failures are collected rather than
 * thrown one at a time: one undeletable row must not strand the rest.
 */
export async function cleanupTracked(): Promise<void> {
  const failures: string[] = [];
  while (tracked.length > 0) {
    const row = tracked.pop()!;
    const { error } = await testDb().from(row.table).delete().eq(row.column, row.value);
    if (error) failures.push(`${row.table}.${row.column}=${row.value}: ${error.message}`);
  }
  while (trackedObjects.length > 0) {
    const object = trackedObjects.pop()!;
    const { error } = await testDb().storage.from(object.bucket).remove([object.path]);
    if (error) failures.push(`${object.bucket}/${object.path}: ${error.message}`);
  }
  if (failures.length > 0) {
    console.error("[cleanup] some test rows could not be deleted:\n" + failures.join("\n"));
  }
}

export function trackedCount(): number {
  return tracked.length;
}

/**
 * The values registered so far for one table — used to reach rows the app
 * created as a side effect of a test's own rows (a notification fired for a
 * user this run created, say) so those can be registered too.
 */
export function trackedValues(table: string, column = "id"): string[] {
  return tracked.filter((r) => r.table === table && r.column === column).map((r) => r.value);
}
