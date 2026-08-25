/**
 * Хүлээлгийн жагсаалт — the queue for a class that has not opened yet.
 *
 * The rule that matters: only a signed-in family can join, because the whole
 * point is being able to tell them when their class opens.
 */

import { afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, signedInClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

type Request = { id: string; grade: string; note: string; status: string };

async function join(phone: string, password: string, body: Record<string, unknown>) {
  const client = await signedInClient(phone, password);
  const res = await client.post<{ request: Request }>("/api/waitlist", body);
  if (res.body?.request?.id) track("waitlist_requests", res.body.request.id);
  return { client, res };
}

describe("joining the waiting list", () => {
  it("refuses a visitor who is not signed in", async () => {
    const res = await anonClient().post("/api/waitlist", { note: "Оройн цаг" });
    expect(res.status).toBe(401);
  });

  it("takes the grade from the profile when the form sends none", async () => {
    const user = await createTestUser({ grade: "6-р анги" });
    const { res } = await join(user.phone, user.password, { note: "Ажлын өдрийн орой" });

    expect(res.status, res.text).toBe(200);
    expect(res.body.request.grade).toBe("6-р анги");
    expect(res.body.request.note).toBe("Ажлын өдрийн орой");
    expect(res.body.request.status).toBe("waiting");
  });

  it("asks for a grade when the profile has none", async () => {
    const user = await createTestUser({ grade: "" });
    const client = await signedInClient(user.phone, user.password);

    const res = await client.post<{ error: string }>("/api/waitlist", { note: "Орой" });
    expect(res.status).toBe(400);
  });

  it("updates the note instead of queueing the same family twice", async () => {
    const user = await createTestUser({ grade: "7-р анги" });
    await join(user.phone, user.password, { note: "Эхний бодол" });
    const { client, res } = await join(user.phone, user.password, { note: "Амралтын өдөр дээр" });

    expect(res.status, res.text).toBe(200);
    const mine = await client.get<{ requests: Request[] }>("/api/waitlist");
    expect(mine.body.requests).toHaveLength(1);
    expect(mine.body.requests[0].note).toBe("Амралтын өдөр дээр");
  });

  it("lets a family leave, and only their own row", async () => {
    const user = await createTestUser({ grade: "8-р анги" });
    const other = await createTestUser({ grade: "8-р анги" });
    const { res } = await join(user.phone, user.password, { note: "Орой" });
    const id = res.body.request.id;

    const stranger = await signedInClient(other.phone, other.password);
    expect((await stranger.del(`/api/waitlist?id=${id}`)).status).toBe(404);

    const owner = await signedInClient(user.phone, user.password);
    expect((await owner.del(`/api/waitlist?id=${id}`)).status).toBe(200);
    const mine = await owner.get<{ requests: Request[] }>("/api/waitlist");
    expect(mine.body.requests).toHaveLength(0);
  });
});

describe("the admin's side of the queue", () => {
  it("lists who is waiting and marks them told", async () => {
    const admin = await adminClient("full");
    const user = await createTestUser({ grade: "9-р анги" });
    const { res } = await join(user.phone, user.password, { note: "Өглөө" });
    const id = res.body.request.id;

    const list = await admin.get<{ requests: { id: string; user?: { phone: string } }[] }>(
      "/api/admin/waitlist"
    );
    expect(list.status, list.text).toBe(200);
    const row = list.body.requests.find((r) => r.id === id);
    expect(row?.user?.phone).toBe(user.phone);

    const marked = await admin.put(`/api/admin/waitlist`, { ids: [id], status: "notified" });
    expect(marked.status, marked.text).toBe(200);

    const { data } = await testDb()
      .from("waitlist_requests")
      .select("status, notified_at")
      .eq("id", id)
      .single();
    expect((data as { status: string }).status).toBe("notified");
    expect((data as { notified_at: string | null }).notified_at).not.toBeNull();
  });

  it("is closed to a student and to the read-only admin", async () => {
    const user = await createTestUser({ grade: "5-р анги" });
    const client = await signedInClient(user.phone, user.password);
    expect((await client.get("/api/admin/waitlist")).status).toBe(401);

    const viewer = await adminClient("viewer");
    expect((await viewer.put("/api/admin/waitlist", { ids: ["x"], status: "closed" })).status).toBe(401);
  });
});
