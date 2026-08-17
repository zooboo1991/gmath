/**
 * Loads `.env.test` for the Vitest process and refuses to go any further if
 * it points anywhere near the production database.
 *
 * The Next.js server under test gets its own copy of these values a different
 * way: it runs with NODE_ENV=test, and Next deliberately does not read
 * `.env.local` in that mode (see next/dist/docs/01-app/02-guides/
 * environment-variables.md), so `.env.test` is the only database credential
 * it can see. This module is the matching guarantee for the test process,
 * which loads no env file on its own.
 *
 * Local and production currently share one Supabase project, so "the tests
 * run somewhere else" cannot be left to convention — the checks below are
 * what make it a fact.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const SETUP_HINT = [
  "",
  "Тестийн орчин бэлдээгүй байна.",
  "  1. Supabase дээр ТУСДАА (хаяж болох) төсөл үүсгэ",
  "  2. supabase/schema.sql-ыг тэр төслийн SQL Editor дээр нэг удаа ажиллуул",
  "  3. articles / problems / solutions / graded-sheets гэсэн 4 bucket үүсгэ",
  "  4. web/.env.test.example-ийг web/.env.test болгон хуулж, тэр төслийн",
  "     URL болон service_role түлхүүрийг бөглө",
  "",
].join("\n");

const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SESSION_SECRET"] as const;

let cached: Record<string, string> | null = null;

export function loadTestEnv(): Record<string, string> {
  if (cached) return cached;

  const testEnvPath = resolve(webRoot, ".env.test");
  if (!existsSync(testEnvPath)) {
    throw new Error(`web/.env.test олдсонгүй.${SETUP_HINT}`);
  }

  const testEnv = parseEnvFile(testEnvPath);

  for (const key of REQUIRED) {
    if (!testEnv[key]) {
      throw new Error(`web/.env.test дотор ${key} дутуу байна.${SETUP_HINT}`);
    }
  }

  // Explicit, human-written statement that this database is throwaway. No
  // amount of automated checking substitutes for the person who created it
  // saying so.
  if (testEnv.TEST_DB_IS_DISPOSABLE !== "true") {
    throw new Error(
      `web/.env.test дотор TEST_DB_IS_DISPOSABLE=true байх ёстой — ` +
        `энэ сангийн өгөгдлийг устгаж болно гэдгийг баталгаажуулж байна.${SETUP_HINT}`
    );
  }

  // The decisive check: whatever the dev environment points at, the tests
  // must not point at the same place.
  const localEnv = parseEnvFile(resolve(webRoot, ".env.local"));
  if (localEnv.NEXT_PUBLIC_SUPABASE_URL) {
    if (localEnv.NEXT_PUBLIC_SUPABASE_URL.trim() === testEnv.NEXT_PUBLIC_SUPABASE_URL.trim()) {
      throw new Error(
        "ЗОГСЛОО: .env.test дэх Supabase URL нь .env.local-тай ЯГ ИЖИЛ байна. " +
          "Энэ бол жинхэнэ сурагч, төлбөрийн сан. Тест ажиллуулахгүй."
      );
    }
    if (localEnv.SUPABASE_SERVICE_ROLE_KEY?.trim() === testEnv.SUPABASE_SERVICE_ROLE_KEY.trim()) {
      throw new Error(
        "ЗОГСЛОО: .env.test дэх service_role түлхүүр нь .env.local-тай ижил байна. Тест ажиллуулахгүй."
      );
    }
  }

  cached = testEnv;
  return testEnv;
}

/** Fixed ports so the Vitest process and the spawned server agree without passing state around. */
export const TEST_PORT = Number(process.env.TEST_PORT ?? 3100);
export const MOCK_PORT = Number(process.env.MOCK_PORT ?? 3101);
export const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
export const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;
export const NETWORK_JOURNAL = resolve(webRoot, ".next-test/network-journal.jsonl");
export const WEB_ROOT = webRoot;
