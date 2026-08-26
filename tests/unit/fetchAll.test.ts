/**
 * Paging past PostgREST's 1000-row ceiling. Every count and sum that reads
 * rows depends on this being right, and the failure mode is silent: a number
 * that simply stops growing.
 */

import { describe, expect, it } from "vitest";
import { chunk, fetchAllRows } from "@/lib/fetchAll";

/** A query builder that hands out `total` rows, 1000 at a time. */
function fakeTable(total: number) {
  const calls: [number, number][] = [];
  const build = () => ({
    range: (from: number, to: number) => {
      calls.push([from, to]);
      const rows = [];
      for (let i = from; i <= Math.min(to, total - 1); i += 1) rows.push({ i });
      return Promise.resolve({ data: rows, error: null });
    },
  });
  return { build, calls };
}

describe("fetchAllRows", () => {
  it("keeps asking until a short page comes back", async () => {
    const { build, calls } = fakeTable(2040);
    const rows = await fetchAllRows<{ i: number }>(build);

    expect(rows).toHaveLength(2040);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks once more when the last page is exactly full", async () => {
    // 1000 rows look identical to "there may be more" — stopping there is how
    // a total silently caps itself.
    const { build, calls } = fakeTable(1000);
    const rows = await fetchAllRows<{ i: number }>(build);

    expect(rows).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it("makes one request for an empty table", async () => {
    const { build, calls } = fakeTable(0);
    expect(await fetchAllRows(build)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("passes the error up rather than returning a short list", async () => {
    const build = () => ({
      range: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    });
    await expect(fetchAllRows(build)).rejects.toBeTruthy();
  });
});

describe("chunk", () => {
  it("splits a long id list into batches an URL can carry", () => {
    const ids = Array.from({ length: 320 }, (_, i) => String(i));
    const batches = chunk(ids);

    expect(batches.map((b) => b.length)).toEqual([150, 150, 20]);
    expect(batches.flat()).toEqual(ids);
  });

  it("leaves a short list alone", () => {
    expect(chunk(["a", "b"])).toEqual([["a", "b"]]);
    expect(chunk([])).toEqual([]);
  });
});
