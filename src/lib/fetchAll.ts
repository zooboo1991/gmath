/**
 * PostgREST hands back at most 1000 rows per request and says nothing about
 * what it left behind. Anything that counts, sums or de-duplicates rows has
 * to page — the alternative is a number that quietly stops growing, which is
 * exactly what the analytics page did until it was caught.
 */

/** How many rows one request returns before Supabase truncates. */
const PAGE = 1000;

/**
 * Every row a query matches.
 *
 * The builder is called once per page, so it must produce the same query each
 * time — and that query must be ORDERED. Paging an unordered query lets rows
 * shuffle between requests, which loses some and repeats others.
 */
export async function fetchAllRows<T>(build: () => {
  range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>;
}): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await build().range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

/**
 * Splits ids for an `.in(...)` filter into batches.
 *
 * PostgREST takes the whole list in the URL, so a few hundred uuids is a
 * request that stops fitting — and the reply is capped at 1000 rows besides.
 */
export function chunk<T>(items: T[], size = 150): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}
