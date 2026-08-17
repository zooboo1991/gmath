/**
 * Chat transcripts — /api/chat and /api/chat/messages.
 *
 * A conversation is addressed by a UUID the client sends back, and the
 * transcripts contain whatever a parent typed into the widget: phone numbers,
 * their child's name, payment complaints. Ownership is the `vid` visitor
 * cookie, and findChatConversation matches on it as well as the id — these
 * tests are about that match actually being enforced on both endpoints.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { createTestChat, createTestUser } from "../../support/factories";

const SECRET = "Миний хүүхдийн нэр Болд, утас 99887766";

afterAll(async () => {
  await cleanupTracked();
});

async function messagesIn(conversationId: string): Promise<string[]> {
  const { data, error } = await testDb()
    .from("chat_messages")
    .select("content")
    .eq("conversation_id", conversationId);
  if (error) throw error;
  return (data as { content: string }[]).map((r) => r.content);
}

describe("GET /api/chat/messages", () => {
  it("refuses a visitor with no cookie at all", async () => {
    const victim = await createTestChat({
      visitorId: randomUUID(),
      messages: [{ role: "user", content: SECRET }],
    });

    const res = await anonClient().get(`/api/chat/messages?conversationId=${victim.id}`);
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("99887766");
  });

  it("refuses another visitor's conversation id", async () => {
    const victimVisitorId = randomUUID();
    const victim = await createTestChat({
      visitorId: victimVisitorId,
      messages: [{ role: "user", content: SECRET }],
    });

    // A different visitor, with a perfectly valid cookie of their own.
    const attacker = anonClient();
    attacker.setCookie("vid", randomUUID());

    const res = await attacker.get(`/api/chat/messages?conversationId=${victim.id}`);
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("99887766");
  });

  it("lets the visitor who owns the conversation read it", async () => {
    const visitorId = randomUUID();
    const conversation = await createTestChat({
      visitorId,
      messages: [{ role: "user", content: "Сайн байна уу" }],
    });

    const client = anonClient();
    client.setCookie("vid", visitorId);
    const res = await client.get<{ ok: boolean; messages: { content: string }[] }>(
      `/api/chat/messages?conversationId=${conversation.id}`
    );

    expect(res.status).toBe(200);
    expect(res.body.messages.map((m) => m.content)).toContain("Сайн байна уу");
  });

  it("refuses a request with no conversation id", async () => {
    const client = anonClient();
    client.setCookie("vid", randomUUID());
    const res = await client.get("/api/chat/messages");
    expect(res.status).toBe(400);
  });

  it("does not crash on an id that is not a UUID", async () => {
    const client = anonClient();
    client.setCookie("vid", randomUUID());
    const res = await client.get("/api/chat/messages?conversationId=not-a-uuid");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/chat", () => {
  it("does not append to another visitor's conversation", async () => {
    const victim = await createTestChat({
      visitorId: randomUUID(),
      messages: [{ role: "user", content: SECRET }],
    });

    const attacker = anonClient();
    attacker.setCookie("vid", randomUUID());
    const res = await attacker.post<{ ok: boolean; conversationId: string }>("/api/chat", {
      message: "Энэ ярианд нэвтэрч байна",
      conversationId: victim.id,
    });

    expect(res.status).toBe(200);
    // The reply comes back on a *different* conversation — the attacker's own.
    expect(res.body.conversationId).not.toBe(victim.id);
    track("chat_conversations", res.body.conversationId);

    // The victim's transcript is untouched: no injected message, and no
    // assistant reply that the victim would see appear out of nowhere.
    expect(await messagesIn(victim.id)).toEqual([SECRET]);
  });

  it("does not hand back another visitor's history in the reply", async () => {
    const victim = await createTestChat({
      visitorId: randomUUID(),
      messages: [{ role: "user", content: SECRET }],
    });

    const attacker = anonClient();
    attacker.setCookie("vid", randomUUID());
    const res = await attacker.post<{ conversationId: string }>("/api/chat", {
      message: "Сайн уу",
      conversationId: victim.id,
    });
    track("chat_conversations", res.body.conversationId);

    expect(res.text).not.toContain("99887766");
    expect(res.text).not.toContain("Болд");
  });

  it("refuses an empty message", async () => {
    const res = await anonClient().post("/api/chat", { message: "   " });
    expect(res.status).toBe(400);
  });

  it("refuses a message over MAX_LEN.chatMessage", async () => {
    const res = await anonClient().post("/api/chat", { message: "х".repeat(2001) });
    expect(res.status).toBe(400);
  });

  it("keeps a signed-in student's conversation attached to their account", async () => {
    const student = await createTestUser();
    const client = anonClient();
    const login = await client.post("/api/account/login", {
      phone: student.phone,
      password: student.password,
    });
    expect(login.status).toBe(200);

    const res = await client.post<{ conversationId: string }>("/api/chat", {
      message: "Хичээл хэзээ эхлэх вэ?",
    });
    expect(res.status).toBe(200);
    track("chat_conversations", res.body.conversationId);

    const { data } = await testDb()
      .from("chat_conversations")
      .select("user_id")
      .eq("id", res.body.conversationId)
      .maybeSingle();
    expect((data as { user_id: string }).user_id).toBe(student.id);
  });
});
