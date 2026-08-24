/**
 * A browser-ish HTTP client for the running test server: one cookie jar per
 * instance, so "another student", "the same student on a second device" and
 * "a signed-out visitor" are just separate clients.
 *
 * Each client also carries its own `x-forwarded-for`. Several endpoints rate
 * limit by IP (register 15/10min, admin login 8/5min, chat 15/min), and with
 * every test coming from 127.0.0.1 those counters would spill from one test
 * into the next and produce failures that have nothing to do with the code
 * under test. getClientIp() reads x-forwarded-for first, exactly as it does
 * behind Vercel's proxy.
 */

import { BASE_URL } from "./env";

export type TestResponse<T = unknown> = {
  status: number;
  body: T;
  text: string;
  headers: Headers;
};

let ipCounter = 0;

/**
 * The middle octets are randomised once per run so IP-keyed rate-limit rows
 * left in the database by an earlier run can never count against this one —
 * those counters live in Postgres and outlive the process that made them.
 */
const IP_RUN_PREFIX = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;

function nextIp(): string {
  ipCounter += 1;
  return `${IP_RUN_PREFIX}.${ipCounter % 254 || 1}`;
}

export class TestClient {
  private cookies = new Map<string, string>();
  readonly ip: string;

  constructor(options: { ip?: string } = {}) {
    this.ip = options.ip ?? nextIp();
  }

  /** Overwrites a cookie by hand — for forged/tampered cookie tests. */
  setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  clearCookies(): void {
    this.cookies.clear();
  }

  private cookieHeader(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private absorb(res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      // An expired/cleared cookie arrives as an empty value.
      if (value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request<T = unknown>(
    method: string,
    path: string,
    options: { body?: unknown; headers?: Record<string, string>; formData?: FormData } = {}
  ): Promise<TestResponse<T>> {
    const headers: Record<string, string> = {
      "x-forwarded-for": this.ip,
      ...options.headers,
    };
    const cookie = this.cookieHeader();
    if (cookie) headers.cookie = cookie;

    let body: BodyInit | undefined;
    if (options.formData) {
      body = options.formData;
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers["content-type"] = "application/json";
    }

    const res = await fetch(`${BASE_URL}${path}`, { method, headers, body, redirect: "manual" });
    this.absorb(res);

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    return { status: res.status, body: parsed as T, text, headers: res.headers };
  }

  get<T = unknown>(path: string, headers?: Record<string, string>) {
    return this.request<T>("GET", path, { headers });
  }

  post<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>("POST", path, { body, headers });
  }

  postForm<T = unknown>(path: string, formData: FormData, headers?: Record<string, string>) {
    return this.request<T>("POST", path, { formData, headers });
  }

  put<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>("PUT", path, { body, headers });
  }

  del<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>("DELETE", path, { body, headers });
  }
}

/** A signed-out visitor. */
export function anonClient(): TestClient {
  return new TestClient();
}

/** Signs in through the real login endpoint — no shortcut around the auth code. */
export async function signedInClient(phone: string, password: string): Promise<TestClient> {
  const client = new TestClient();
  const res = await client.post<{ ok: boolean; error?: string }>("/api/account/login", {
    phone,
    password,
  });
  if (res.status !== 200 || !res.body?.ok) {
    throw new Error(`login failed for ${phone}: ${res.status} ${res.text}`);
  }
  return client;
}

/** Signs in as one of the two admin accounts from .env.test. */
/**
 * Signs in as a named account from admin_users — the way a teacher gets in.
 * The account is created through the owner's own endpoint, so the test
 * exercises the same path the admin UI uses.
 */
export async function staffClient(
  owner: TestClient,
  input: { name: string; username: string; password: string; role: "full" | "viewer" | "teacher" }
): Promise<{ client: TestClient; id: string }> {
  const created = await owner.post<{ ok: boolean; staff?: { id: string } }>("/api/admin/staff", input);
  if (created.status !== 200 || !created.body.staff) {
    throw new Error(`staff create failed: ${created.status} ${created.text}`);
  }

  const client = new TestClient();
  const res = await client.post<{ ok: boolean; role?: string }>("/api/admin/login", {
    username: input.username,
    password: input.password,
  });
  if (res.status !== 200 || res.body?.role !== input.role) {
    throw new Error(`staff login failed for ${input.username}: ${res.status} ${res.text}`);
  }
  return { client, id: created.body.staff.id };
}

export async function adminClient(role: "full" | "viewer"): Promise<TestClient> {
  const client = new TestClient();
  const username =
    role === "full" ? process.env.ADMIN_USERNAME ?? "Admin" : process.env.ADMIN_VIEWER_USERNAME ?? "Ganbat";
  const password =
    role === "full" ? process.env.ADMIN_PASSWORD : process.env.ADMIN_VIEWER_PASSWORD;
  const res = await client.post<{ ok: boolean; role?: string }>("/api/admin/login", {
    username,
    password,
  });
  if (res.status !== 200 || res.body?.role !== role) {
    throw new Error(`admin login failed for ${role}: ${res.status} ${res.text}`);
  }
  return client;
}
