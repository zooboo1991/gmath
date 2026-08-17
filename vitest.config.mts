import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Tests run against a real Next.js server (started by globalSetup) and a real
 * — throwaway — Supabase project, so they share two pieces of mutable state:
 * the database and the rate-limit counters. `fileParallelism: false` keeps
 * them in one file at a time; without it, two files creating registrations
 * for the same course, or hammering the same rate-limit key, would fail each
 * other for reasons that have nothing to do with the code under test.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/support/globalSetup.ts"],
    setupFiles: ["./tests/support/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    teardownTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
