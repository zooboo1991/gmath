/**
 * The tests that have to hold before any other test means anything:
 *
 *   - the server under test cannot see the production database
 *   - no test can reach a live third party (QPay, Skytel, Zoom, Facebook, AI)
 *
 * Both are properties of the harness rather than of the app, which is exactly
 * why they need tests: a harness that quietly stops isolating is invisible
 * until it has already written to real data or spent real SMS credit.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { anonClient } from "../support/client";
import { MOCK_BASE, WEB_ROOT, loadTestEnv } from "../support/env";
import { readNetworkJournal } from "../support/mockControl";

function productionSupabaseHost(): string | null {
  const path = resolve(WEB_ROOT, ".env.local");
  if (!existsSync(path)) return null;
  const line = readFileSync(path, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith("NEXT_PUBLIC_SUPABASE_URL="));
  if (!line) return null;
  try {
    return new URL(line.slice(line.indexOf("=") + 1).trim()).host;
  } catch {
    return null;
  }
}

describe("database isolation", () => {
  it("the test database is not the one .env.local points at", () => {
    const testUrl = loadTestEnv().NEXT_PUBLIC_SUPABASE_URL;
    const prodHost = productionSupabaseHost();
    if (!prodHost) return; // no .env.local on this machine — nothing to collide with
    expect(new URL(testUrl).host).not.toBe(prodHost);
  });

  it("the server never sends a request to the production database host", async () => {
    // Touches a database-backed endpoint so that, if the server had somehow
    // resolved the production credentials, the request would show up in the
    // guard's journal as a blocked call to that host.
    await anonClient().get("/api/account/schools?q=test");

    const prodHost = productionSupabaseHost();
    const journal = readNetworkJournal();
    const hosts = journal.filter((e) => e.host).map((e) => e.host);
    if (prodHost) expect(hosts).not.toContain(prodHost);
    expect(journal.some((e) => e.kind === "guard-installed")).toBe(true);
  });
});

describe("outbound network guard", () => {
  it("refuses a request to a host with no mock", async () => {
    await expect(fetch("https://example.com/anything")).rejects.toThrow(/blocked a real outbound request/);
  });

  it("refuses a request to a real third party even when its host is known to the app", async () => {
    // graph.facebook.com is intercepted rather than blocked, so prove the
    // interception actually goes to the mock instead of Facebook.
    const res = await fetch("https://graph.facebook.com/v21.0/me/messages", { method: "POST" });
    const body = (await res.json()) as { message_id?: string };
    expect(body.message_id).toBe("mock-message-id");
  });

  it("routes Skytel SMS to the mock, never to web2sms.skytel.mn", async () => {
    const res = await fetch("http://web2sms.skytel.mn/apiSend?token=x&sendto=99999999&message=hi");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("SUCCESS");

    const journal = readNetworkJournal();
    const skytel = journal.filter((e) => e.host === "web2sms.skytel.mn");
    expect(skytel.length).toBeGreaterThan(0);
    expect(skytel.every((e) => e.kind === "intercepted")).toBe(true);
  });

  it("answers QPay from the mock", async () => {
    const res = await fetch(`${MOCK_BASE}/v2/auth/token`, { method: "POST" });
    const body = (await res.json()) as { access_token: string };
    expect(body.access_token).toBe("mock-qpay-token");
  });
});

describe("payment provider selection", () => {
  it("the test environment has QPay credentials, so the free stub provider is never chosen", async () => {
    const env = loadTestEnv();
    expect(env.QPAY_USERNAME).toBeTruthy();
    expect(env.QPAY_PASSWORD).toBeTruthy();
    expect(env.QPAY_INVOICE_CODE).toBeTruthy();
    // Left unset on purpose: with it on, StubPaymentProvider would settle
    // every payment for free and every payment test would pass for the wrong
    // reason.
    expect(env.ALLOW_STUB_PAYMENTS).toBeUndefined();
  });

  it("web-push has no VAPID keys, so nothing is sent over node:https", () => {
    const env = loadTestEnv();
    expect(env.VAPID_PRIVATE_KEY).toBeUndefined();
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
  });
});
