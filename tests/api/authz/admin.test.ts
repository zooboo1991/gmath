/**
 * Admin roles — src/lib/session.ts (isAdmin / isFullAdmin / getAdminRole).
 *
 * There are two admin accounts: `full` and `viewer`. The viewer is read-only,
 * and the only thing that makes that true is every mutating endpoint checking
 * isFullAdmin() rather than isAdmin() — hiding buttons in the panel hides
 * nothing from a hand-written request.
 *
 * So the list below is every write endpoint under /api/admin, checked one by
 * one. A route added later without the check will fail here rather than ship
 * quietly.
 *
 * Ids in the paths are random UUIDs on purpose: a request that gets past the
 * auth gate then fails on a missing row proves the gate opened without
 * changing anything real.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, anonClient, signedInClient, TestClient } from "../../support/client";
import { cleanupTracked } from "../../support/db";
import { createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

type Route = { method: "GET" | "POST" | "PUT" | "DELETE"; path: string; body?: unknown };

const id = () => randomUUID();

/** Every mutating admin endpoint. Bodies are deliberately invalid. */
const WRITE_ROUTES: Route[] = [
  { method: "POST", path: "/api/admin/articles", body: {} },
  { method: "PUT", path: `/api/admin/articles/${id()}`, body: {} },
  { method: "DELETE", path: `/api/admin/articles/${id()}` },
  { method: "POST", path: "/api/admin/certificates", body: {} },
  { method: "PUT", path: `/api/admin/certificates/${id()}`, body: {} },
  { method: "DELETE", path: `/api/admin/certificates/${id()}` },
  { method: "PUT", path: `/api/admin/chat-issues/${id()}`, body: {} },
  { method: "POST", path: `/api/admin/chats/${id()}/messages`, body: {} },
  { method: "POST", path: `/api/admin/chats/${id()}/mode`, body: {} },
  { method: "POST", path: "/api/admin/courses", body: {} },
  { method: "POST", path: "/api/admin/lesson-note", body: { size: 1000 } },
  { method: "DELETE", path: "/api/admin/lesson-note", body: { path: `notes/${id()}.pdf` } },
  { method: "PUT", path: `/api/admin/courses/${id()}`, body: {} },
  { method: "POST", path: `/api/admin/courses/${id()}/lessons/0/zoom-meeting`, body: {} },
  { method: "PUT", path: `/api/admin/grading/${id()}/complete`, body: {} },
  { method: "PUT", path: `/api/admin/grading/${id()}/score`, body: {} },
  { method: "POST", path: `/api/admin/grading/${id()}/sheet`, body: {} },
  { method: "PUT", path: `/api/admin/levels/${id()}`, body: {} },
  { method: "POST", path: "/api/admin/messenger/profile", body: {} },
  { method: "POST", path: "/api/admin/notifications", body: {} },
  { method: "POST", path: "/api/admin/problems", body: {} },
  { method: "PUT", path: `/api/admin/problems/${id()}`, body: {} },
  { method: "DELETE", path: `/api/admin/problems/${id()}` },
  { method: "POST", path: "/api/admin/problems/upload", body: {} },
  { method: "POST", path: "/api/admin/quiz-questions", body: {} },
  { method: "PUT", path: `/api/admin/quiz-questions/${id()}`, body: {} },
  { method: "POST", path: "/api/admin/registrations", body: {} },
  { method: "PUT", path: `/api/admin/registrations/${id()}`, body: {} },
  { method: "DELETE", path: `/api/admin/registrations/${id()}` },
  { method: "POST", path: `/api/admin/registrations/${id()}/approve`, body: {} },
  { method: "POST", path: `/api/admin/registrations/${id()}/cancel`, body: {} },
  { method: "POST", path: `/api/admin/registrations/${id()}/payments`, body: {} },
  { method: "POST", path: `/api/admin/registrations/${id()}/qpay-check`, body: {} },
  { method: "POST", path: `/api/admin/registrations/${id()}/settle-manual`, body: {} },
  { method: "DELETE", path: `/api/admin/registrations/${id()}/payments/${id()}` },
  { method: "PUT", path: "/api/admin/settings", body: {} },
  { method: "POST", path: "/api/admin/upload", body: {} },
  { method: "POST", path: "/api/admin/users", body: {} },
  { method: "PUT", path: `/api/admin/yearly/${id()}`, body: {} },
];

/** Admin reads. All require `full` except analytics, which the viewer's dashboard needs. */
const READ_ROUTES: Route[] = [
  { method: "GET", path: "/api/admin/articles" },
  { method: "GET", path: "/api/admin/certificates" },
  { method: "GET", path: "/api/admin/chats" },
  { method: "GET", path: `/api/admin/chats/${id()}` },
  { method: "GET", path: "/api/admin/courses" },
  { method: "GET", path: `/api/admin/courses/${id()}/lessons/0/attendance` },
  { method: "GET", path: "/api/admin/grading" },
  { method: "GET", path: `/api/admin/grading/${id()}` },
  { method: "GET", path: `/api/admin/lesson-note?path=notes/${id()}.pdf` },
  { method: "GET", path: "/api/admin/logs" },
  { method: "GET", path: "/api/admin/messenger/profile" },
  { method: "GET", path: "/api/admin/notifications" },
  { method: "GET", path: "/api/admin/problems" },
  { method: "GET", path: "/api/admin/quiz-questions" },
  { method: "GET", path: "/api/admin/registrations" },
  { method: "GET", path: "/api/admin/settings" },
  { method: "GET", path: "/api/admin/users/lookup?q=test" },
];

function send(client: TestClient, route: Route) {
  switch (route.method) {
    case "GET":
      return client.get(route.path);
    case "POST":
      return client.post(route.path, route.body);
    case "PUT":
      return client.put(route.path, route.body);
    case "DELETE":
      return client.del(route.path, route.body);
  }
}

describe("the read-only admin cannot write", () => {
  for (const route of WRITE_ROUTES) {
    it(`${route.method} ${route.path.replace(/[0-9a-f-]{36}/g, ":id")} refuses the viewer`, async () => {
      const viewer = await adminClient("viewer");
      const res = await send(viewer, route);
      expect(res.status).toBe(401);
    });
  }

  it("but the full admin is not blocked by the same check", async () => {
    // Same requests as above: if the full admin were also refused, the tests
    // above would prove nothing about roles — only that the routes are broken.
    const full = await adminClient("full");
    const blocked: string[] = [];

    for (const route of WRITE_ROUTES) {
      const res = await send(full, route);
      if (res.status === 401 || res.status === 403) {
        blocked.push(`${route.method} ${route.path} -> ${res.status}`);
      }
    }

    expect(blocked).toEqual([]);
  });
});

describe("upload endpoints", () => {
  /**
   * The upload half of BUGS.md #3: a JSON body made `formData()` throw. A
   * request with no file in it now gets the same 400 as a request with a
   * missing file, which is what it is.
   */
  it("answer 400 rather than 500 for a body that is not multipart", async () => {
    const full = await adminClient("full");
    for (const path of ["/api/admin/upload", "/api/admin/problems/upload"]) {
      const res = await full.post(path, {});
      expect(res.status, path).toBe(400);
    }
  });
});

describe("admin reads", () => {
  for (const route of READ_ROUTES) {
    it(`${route.path.replace(/[0-9a-f-]{36}/g, ":id")} refuses the viewer`, async () => {
      const viewer = await adminClient("viewer");
      const res = await send(viewer, route);
      expect(res.status).toBe(401);
    });
  }

  it("lets the viewer read analytics, which its dashboard needs", async () => {
    const viewer = await adminClient("viewer");
    const res = await viewer.get("/api/admin/analytics?from=2026-01-01&to=2026-01-31");
    expect(res.status).toBe(200);
  });

  it("refuses analytics to a signed-out visitor", async () => {
    const res = await anonClient().get("/api/admin/analytics?from=2026-01-01&to=2026-01-31");
    expect(res.status).toBe(401);
  });
});

describe("non-admins", () => {
  it("a signed-out visitor is refused everywhere", async () => {
    const anon = anonClient();
    const allowed: string[] = [];

    for (const route of [...WRITE_ROUTES, ...READ_ROUTES]) {
      const res = await send(anon, route);
      if (res.status !== 401) allowed.push(`${route.method} ${route.path} -> ${res.status}`);
    }

    expect(allowed).toEqual([]);
  });

  it("a signed-in student is not an admin", async () => {
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);
    const allowed: string[] = [];

    for (const route of [...WRITE_ROUTES, ...READ_ROUTES]) {
      const res = await send(client, route);
      if (res.status !== 401) allowed.push(`${route.method} ${route.path} -> ${res.status}`);
    }

    // A student session cookie is a different cookie entirely; carrying one
    // must not open the admin API even a crack.
    expect(allowed).toEqual([]);
  });
});

describe("the admin cookie cannot be forged or upgraded", () => {
  it("an unsigned admin cookie does not authenticate", async () => {
    for (const value of ["admin-ok", "admin-ok:full", "admin-ok:viewer"]) {
      const client = anonClient();
      client.setCookie("admin_session", value);
      const res = await client.get("/api/admin/registrations");
      expect(res.status, `cookie=${value}`).toBe(401);
    }
  });

  it("a viewer cannot rewrite their own cookie into a full admin one", async () => {
    const viewer = await adminClient("viewer");
    const cookie = viewer.getCookie("admin_session")!;
    // The cookie is URL-encoded on the wire, so the role reads as
    // "admin-ok%3Aviewer" here.
    expect(decodeURIComponent(cookie)).toContain("admin-ok:viewer");

    // The role is inside the signed value, so editing it invalidates the MAC.
    const forged = cookie.replace("viewer", "full");
    const attacker = anonClient();
    attacker.setCookie("admin_session", forged);

    const res = await attacker.post("/api/admin/articles", {});
    expect(res.status).toBe(401);
  });

  it("a viewer's signature does not carry over to a different role string", async () => {
    const viewer = await adminClient("viewer");
    const cookie = viewer.getCookie("admin_session")!;
    const mac = cookie.slice(cookie.lastIndexOf(".") + 1);

    const attacker = anonClient();
    attacker.setCookie("admin_session", `${encodeURIComponent("admin-ok:full")}.${mac}`);

    const res = await attacker.get("/api/admin/users/lookup?q=test");
    expect(res.status).toBe(401);
  });

  it("a student session cookie in the admin cookie slot does nothing", async () => {
    const student = await createTestUser();
    const studentClient = await signedInClient(student.phone, student.password);
    const sessionCookie = studentClient.getCookie("session_user_id")!;

    const attacker = anonClient();
    attacker.setCookie("admin_session", sessionCookie);

    const res = await attacker.get("/api/admin/registrations");
    expect(res.status).toBe(401);
  });
});

describe("admin login", () => {
  it("refuses a wrong password without saying which half was wrong", async () => {
    const wrongPassword = await anonClient().post<{ error: string }>("/api/admin/login", {
      username: process.env.ADMIN_USERNAME ?? "Admin",
      password: "not-the-password",
    });
    const wrongUser = await anonClient().post<{ error: string }>("/api/admin/login", {
      username: "no-such-admin",
      password: "not-the-password",
    });

    expect(wrongPassword.status).toBe(401);
    expect(wrongUser.status).toBe(401);
    expect(wrongUser.body.error).toBe(wrongPassword.body.error);
  });

  it("refuses a viewer password given with the full admin's username", async () => {
    const res = await anonClient().post("/api/admin/login", {
      username: process.env.ADMIN_USERNAME ?? "Admin",
      password: process.env.ADMIN_VIEWER_PASSWORD,
    });
    expect(res.status).toBe(401);
  });

  it("logs the viewer in as viewer, never as full", async () => {
    const res = await anonClient().post<{ role: string }>("/api/admin/login", {
      username: process.env.ADMIN_VIEWER_USERNAME ?? "Ganbat",
      password: process.env.ADMIN_VIEWER_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("viewer");
  });

  it("stops guessing after 8 attempts from one address", async () => {
    const client = anonClient();
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const res = await client.post("/api/admin/login", {
        username: "Admin",
        password: `guess-${attempt}`,
      });
      expect(res.status, `attempt ${attempt}`).toBe(401);
    }

    const blocked = await client.post("/api/admin/login", { username: "Admin", password: "guess-9" });
    expect(blocked.status).toBe(429);
  });

  /**
   * BUGS.md #1 was fixed in /api/account/login, but /api/admin/login still
   * calls checkRateLimit, which counts every call rather than every failure —
   * so the same lockout applies to an admin whose password is right. The key
   * is the IP, and both admin accounts share it, so the two of them working
   * from one office spend one budget between them.
   */
  it.fails("does not lock out an admin who signs in correctly every time", async () => {
    // One client, so all nine requests share an IP the way a real office does.
    const client = anonClient();
    const credentials = {
      username: process.env.ADMIN_USERNAME ?? "Admin",
      password: process.env.ADMIN_PASSWORD,
    };

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const res = await client.post("/api/admin/login", credentials);
      expect(res.status, `login ${attempt}`).toBe(200);
    }

    const ninth = await client.post("/api/admin/login", credentials);
    expect(ninth.status).toBe(200);
  });

  it("logging out drops the admin cookie", async () => {
    const admin = await adminClient("full");
    expect((await admin.get("/api/admin/registrations")).status).toBe(200);

    await admin.post("/api/admin/logout");
    expect((await admin.get("/api/admin/registrations")).status).toBe(401);
  });
});
