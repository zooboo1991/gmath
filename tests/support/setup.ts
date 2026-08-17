/**
 * Runs in every test worker before its file. Puts the test environment into
 * process.env so helpers that read it (admin credentials, the Supabase
 * client used for seeding) see the throwaway project — never .env.local,
 * which this process never reads.
 *
 * The network guard is loaded here too. The Vitest process makes its own
 * outbound calls (seeding via Supabase, driving the mock), and it should be
 * held to the same rule as the server: nothing reaches a live third party.
 */

import { loadTestEnv, MOCK_BASE, NETWORK_JOURNAL } from "./env";

const testEnv = loadTestEnv();
for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] = value;
}
process.env.TEST_MOCK_BASE = MOCK_BASE;
process.env.TEST_NETWORK_JOURNAL = NETWORK_JOURNAL;

await import("./network-guard.mjs");
