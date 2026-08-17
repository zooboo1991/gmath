/**
 * Brings up everything the suite talks to, once: the mock third parties, and
 * a Next.js server running against the test database.
 *
 * The server is started with NODE_ENV=test, which is what keeps it away from
 * production: Next does not read `.env.local` in that mode, so `.env.test` is
 * the only database credential it can see. Its environment is built from an
 * allowlist rather than inherited wholesale, so a stray exported variable in
 * the developer's shell can't put a real key back in.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Server } from "node:http";
import { loadTestEnv, BASE_URL, MOCK_BASE, MOCK_PORT, TEST_PORT, NETWORK_JOURNAL, WEB_ROOT } from "./env";
import { startMockServer } from "./mockServer";

let mockServer: Server | null = null;
let nextServer: ChildProcess | null = null;

/**
 * `next dev` rewrites tsconfig.json on startup to register the type files of
 * whatever distDir it is using — here .next-test, whose generated types are
 * half-written whenever the server is killed and then break
 * `npx tsc --noEmit`, the project's own check. The file is snapshotted here
 * and put back on teardown so a test run leaves no trace in it.
 */
const TSCONFIG_PATH = resolve(WEB_ROOT, "tsconfig.json");
let tsconfigSnapshot: string | null = null;

const READY_TIMEOUT_MS = 180_000;

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError = "";
  while (Date.now() < deadline) {
    if (nextServer?.exitCode !== null && nextServer?.exitCode !== undefined) {
      throw new Error(`test server exited early with code ${nextServer.exitCode}`);
    }
    try {
      // /api/account/me answers for a signed-out visitor without touching the
      // database, so this proves the server is up before any test needs it —
      // and warms the route compiler in dev mode.
      const res = await fetch(`${BASE_URL}/api/account/me`);
      if (res.ok) return;
      lastError = `status ${res.status}`;
    } catch (err) {
      lastError = String(err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`test server did not become ready in ${READY_TIMEOUT_MS}ms (last: ${lastError})`);
}

export async function setup(): Promise<void> {
  const testEnv = loadTestEnv();

  tsconfigSnapshot = readFileSync(TSCONFIG_PATH, "utf8");

  mkdirSync(dirname(NETWORK_JOURNAL), { recursive: true });
  rmSync(NETWORK_JOURNAL, { force: true });

  mockServer = await startMockServer(MOCK_PORT);

  const guardUrl = pathToFileURL(resolve(WEB_ROOT, "tests/support/network-guard.mjs")).href;

  const childEnv: NodeJS.ProcessEnv = {
    // Allowlisted passthrough — everything else about the developer's shell
    // is deliberately left behind.
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    SHELL: process.env.SHELL,
    TMPDIR: process.env.TMPDIR,
    LANG: process.env.LANG,

    ...testEnv,

    NODE_ENV: "test",
    PORT: String(TEST_PORT),
    // A separate build directory so this never collides with the developer's
    // own `npm run dev` in the same folder.
    NEXT_DIST_DIR: ".next-test",
    NEXT_TELEMETRY_DISABLED: "1",

    // QPay reads its base URL from the environment, so it needs no
    // interception — it is pointed straight at the mock.
    QPAY_BASE_URL: MOCK_BASE,

    TEST_MOCK_BASE: MOCK_BASE,
    TEST_NETWORK_JOURNAL: NETWORK_JOURNAL,
    NODE_OPTIONS: `--import ${guardUrl}`,
  };

  const nextBin = resolve(WEB_ROOT, "node_modules/next/dist/bin/next");
  nextServer = spawn(process.execPath, [nextBin, "dev", "--port", String(TEST_PORT)], {
    cwd: WEB_ROOT,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  const log = (prefix: string) => (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.log(`[test-server${prefix}] ${line}`);
  };
  nextServer.stdout?.on("data", log(""));
  nextServer.stderr?.on("data", log(":err"));

  await waitForServer();
}

export async function teardown(): Promise<void> {
  if (nextServer?.pid) {
    // Kill the whole process group: `next dev` runs its compiler in children
    // that would otherwise keep the port bound.
    try {
      process.kill(-nextServer.pid, "SIGTERM");
    } catch {
      nextServer.kill("SIGTERM");
    }
  }
  if (mockServer) {
    await new Promise<void>((r) => mockServer!.close(() => r()));
  }

  if (tsconfigSnapshot !== null && readFileSync(TSCONFIG_PATH, "utf8") !== tsconfigSnapshot) {
    writeFileSync(TSCONFIG_PATH, tsconfigSnapshot);
  }
}
