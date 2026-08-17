/**
 * Outbound-network kill switch. Loaded with `--import` into both the Vitest
 * process and the Next.js test server, before any application code runs.
 *
 * Two jobs:
 *
 *   1. Nothing this app talks to for real — QPay, Skytel SMS, Zoom, Facebook
 *      Graph, Anthropic, DeepSeek — may be reached from a test. Known hosts
 *      are rewritten to the local mock server; unknown hosts are refused
 *      outright, so an integration added later fails loudly here instead of
 *      quietly sending a real request (and, for Skytel, real money off a
 *      prepaid SMS balance).
 *
 *   2. Every attempt is journalled to a file so tests can assert what was
 *      called — and that nothing escaped — rather than taking it on trust.
 *
 * Only the test Supabase host and localhost are allowed straight through.
 * `fetch` covers every integration except web-push, which sends over
 * node:https, so https.request/get are wrapped as well. VAPID keys are left
 * unset in .env.test as a second layer (push.ts returns early without them),
 * but a guard that only holds while the thing it guards is switched off is
 * not a guard.
 */

import { appendFileSync } from "node:fs";
import https from "node:https";

const MOCK_BASE = process.env.TEST_MOCK_BASE ?? "";
const JOURNAL = process.env.TEST_NETWORK_JOURNAL ?? "";

/** The one remote host a test is allowed to reach: its own throwaway database. */
const supabaseHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
})();

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1", "0.0.0.0"]);

/**
 * Hosts the app is known to call, each handed to the mock server instead.
 * Keep this list in step with the `fetch` call sites in src/lib — a host
 * missing from here is blocked, which is the safe direction to be wrong in.
 */
const INTERCEPTED = new Set([
  "merchant.qpay.mn",
  "web2sms.skytel.mn",
  "api.zoom.us",
  "zoom.us",
  "graph.facebook.com",
  "api.anthropic.com",
  "api.deepseek.com",
]);

function journal(entry) {
  if (!JOURNAL) return;
  try {
    appendFileSync(JOURNAL, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // A journal write must never be the reason a test fails.
  }
}

function hostnameOf(host) {
  return host.replace(/:\d+$/, "");
}

function classify(host) {
  const name = hostnameOf(host);
  if (LOCAL_HOSTS.has(name)) return "allow";
  if (supabaseHost && host === supabaseHost) return "allow";
  if (INTERCEPTED.has(name)) return MOCK_BASE ? "intercept" : "block";
  return "block";
}

function blocked(host, url) {
  journal({ kind: "blocked", host, url });
  return new Error(
    `[network-guard] blocked a real outbound request to ${host} (${url}). ` +
      `Tests must never reach a live third party. Add the host to INTERCEPTED in ` +
      `tests/support/network-guard.mjs and give the mock server a handler for it.`
  );
}

// ---------------------------------------------------------------------------
// fetch
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;

globalThis.fetch = async function guardedFetch(input, init) {
  const original =
    typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? "";

  let url;
  try {
    url = new URL(original);
  } catch {
    // Relative URL (Next's own internals) — nothing leaves the machine.
    return realFetch(input, init);
  }

  const verdict = classify(url.host);
  if (verdict === "allow") {
    return realFetch(input, init);
  }
  if (verdict === "block") {
    throw blocked(url.host, url.href);
  }

  // Intercepted: same path and query, sent to the mock, tagged with the host
  // it was meant for so the mock can answer as that service.
  journal({ kind: "intercepted", host: url.host, url: url.href, method: init?.method ?? "GET" });
  const rewritten = `${MOCK_BASE}${url.pathname}${url.search}`;

  if (typeof input === "string" || input instanceof URL) {
    const headers = new Headers(init?.headers ?? {});
    headers.set("x-mock-origin-host", hostnameOf(url.host));
    return realFetch(rewritten, { ...init, headers });
  }

  // A Request object: rebuild it against the mock URL, keeping method, body
  // and headers.
  const request = new Request(rewritten, input);
  request.headers.set("x-mock-origin-host", hostnameOf(url.host));
  return realFetch(request, init);
};

// ---------------------------------------------------------------------------
// node:https — the transport web-push uses. Blocked rather than mocked: no
// test needs a push to actually be delivered, and letting one through would
// mean a real request to a browser vendor's push service.
// ---------------------------------------------------------------------------

function guardHttpsMethod(name) {
  const real = https[name];
  https[name] = function guarded(...args) {
    const first = args[0];
    let host = null;
    if (typeof first === "string") {
      try {
        host = new URL(first).host;
      } catch {
        host = null;
      }
    } else if (first instanceof URL) {
      host = first.host;
    } else if (first && typeof first === "object") {
      host = first.host ?? first.hostname ?? null;
    }

    if (host && classify(host) !== "allow") {
      throw blocked(host, `https.${name} ${host}`);
    }
    return real.apply(https, args);
  };
}

guardHttpsMethod("request");
guardHttpsMethod("get");

journal({ kind: "guard-installed", pid: process.pid, mockBase: MOCK_BASE || null, supabaseHost });
