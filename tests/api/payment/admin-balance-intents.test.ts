/**
 * The admin's answers to a balance payment a family started from their
 * profile («Үлдэгдэл төлөх»), shown in «Бүртгэл» beside the registrations:
 *
 *   POST /api/admin/payment-intents/[id]/confirm    — "it arrived on the statement"
 *   POST /api/admin/payment-intents/[id]/qpay-check — ask QPay
 *   POST /api/admin/payment-intents/[id]/cancel     — "they never paid"
 *
 * Money moves, so the properties held down are the ones that cost money when
 * they break: a payment is booked once and only on the admin's figure or
 * QPay's word, a QPay invoice is voided before anything is decided by hand,
 * and a payment QPay did collect is booked rather than cancelled.
 */

import { afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, signedInClient, TestClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import {
  createTestCourse,
  createTestRegistration,
  createTestUser,
  notificationsFor,
  trackNotificationsForCreatedUsers,
} from "../../support/factories";
import { findMockInvoice, payMockInvoice } from "../../support/mockControl";

afterAll(async () => {
  // The family's own «I paid» and the admin's confirmation both notify them.
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
});

/** The intent's sender_invoice_no — the server's rule. */
function senderInvoiceNoForIntent(intentId: string): string {
  return `gm-i-${intentId.replace(/-/g, "")}`;
}

type Reply = {
  ok?: boolean;
  error?: string;
  paid?: boolean;
  intent?: { id: string; status: string; method: string; amount: number };
  payments?: { registrationId: string; amount: number }[];
};

/**
 * A family half-way through a 1,200,000₮ course who has just pressed
 * «Үлдэгдэл төлөх» for the other 600,000₮ — the way the profile page does it.
 */
async function familyStartedBalance(method: "bank" | "qpay") {
  const course = await createTestCourse({ price: "1,200,000₮" });
  const student = await createTestUser();
  const registration = await createTestRegistration({
    userId: student.id,
    programId: course.id,
    price: "1,200,000₮",
    payMethod: "bank",
    status: "active",
  });
  await testDb()
    .from("registrations")
    .update({ total_due: 1_200_000, installment_due_date: "2026-09-30" })
    .eq("id", registration.id);
  const { data } = await testDb()
    .from("registration_payments")
    .insert({ registration_id: registration.id, amount: 600_000, paid_at: "2026-08-20" })
    .select("id")
    .single();
  track("registration_payments", (data as { id: string }).id);

  const family = await signedInClient(student.phone, student.password);
  const started = await family.post<Reply>(`/api/enroll/${registration.id}/balance`, { amount: 600_000, method });
  if (started.status !== 200 || !started.body.intent) {
    throw new Error(`balance start failed: ${started.status} ${started.text}`);
  }
  const intentId = started.body.intent.id;
  track("registration_payment_intents", intentId);
  return { studentId: student.id, registrationId: registration.id, intentId };
}

async function intentRow(id: string) {
  const { data } = await testDb()
    .from("registration_payment_intents")
    .select("status, method, paid_at")
    .eq("id", id)
    .maybeSingle();
  return data as { status: string; method: string; paid_at: string | null } | null;
}

/** Amounts in the books for a registration, smallest first; new rows are tracked for cleanup. */
async function bookedAmounts(registrationId: string) {
  const { data } = await testDb()
    .from("registration_payments")
    .select("id, amount, paid_at")
    .eq("registration_id", registrationId);
  const rows = (data ?? []) as { id: string; amount: number; paid_at: string }[];
  for (const row of rows) track("registration_payments", row.id);
  return rows.map((r) => r.amount).sort((a, b) => a - b);
}

function confirm(admin: TestClient, intentId: string, body: Record<string, unknown>) {
  return admin.post<Reply>(`/api/admin/payment-intents/${intentId}/confirm`, body);
}

describe("who may act", () => {
  it("turns away a read-only admin and a visitor from all three actions", async () => {
    const { intentId, registrationId } = await familyStartedBalance("bank");
    const viewer = await adminClient("viewer");
    for (const client of [viewer, anonClient()]) {
      expect((await confirm(client, intentId, { amount: 600_000, paidAt: "2026-11-01" })).status).toBe(401);
      expect((await client.post(`/api/admin/payment-intents/${intentId}/qpay-check`)).status).toBe(401);
      expect((await client.post(`/api/admin/payment-intents/${intentId}/cancel`)).status).toBe(401);
    }
    expect((await intentRow(intentId))?.status).toBe("pending");
    expect(await bookedAmounts(registrationId)).toEqual([600_000]);
  });

  it("says not found for an id that is not a payment", async () => {
    const admin = await adminClient("full");
    expect((await confirm(admin, "not-a-uuid", { amount: 1, paidAt: "2026-11-01" })).status).toBe(404);
    const missing = "00000000-0000-4000-8000-000000000000";
    expect((await confirm(admin, missing, { amount: 600_000, paidAt: "2026-11-01" })).status).toBe(404);
  });
});

describe("confirming a transfer the family announced", () => {
  it("books the admin's figure and date, closes the payment and tells the family", async () => {
    const { intentId, registrationId, studentId } = await familyStartedBalance("bank");
    const admin = await adminClient("full");

    // The family said 600,000₮; the statement shows 500,000₮. The statement wins.
    const res = await confirm(admin, intentId, { amount: 500_000, paidAt: "2026-11-02" });

    expect(res.status, res.text).toBe(200);
    expect(res.body.intent?.status).toBe("paid");
    expect(res.body.payments?.map((p) => p.amount).sort((a, b) => a - b)).toEqual([500_000, 600_000]);
    expect(await bookedAmounts(registrationId)).toEqual([500_000, 600_000]);
    const { data } = await testDb()
      .from("registration_payments")
      .select("paid_at")
      .eq("registration_id", registrationId)
      .eq("amount", 500_000)
      .single();
    expect((data as { paid_at: string }).paid_at).toBe("2026-11-02");
    expect((await notificationsFor(studentId)).some((n) => n.title === "Төлбөр хүлээн авлаа")).toBe(true);
  });

  it("books it once, however many times it is pressed", async () => {
    const { intentId, registrationId } = await familyStartedBalance("bank");
    const admin = await adminClient("full");

    // A double click, or two admins on the same row.
    const [a, b] = await Promise.all([
      confirm(admin, intentId, { amount: 600_000, paidAt: "2026-11-02" }),
      confirm(admin, intentId, { amount: 600_000, paidAt: "2026-11-02" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const again = await confirm(admin, intentId, { amount: 600_000, paidAt: "2026-11-02" });
    expect(again.status).toBe(409);

    expect(await bookedAmounts(registrationId)).toEqual([600_000, 600_000]);
  });

  it("refuses more than the balance, and figures or dates that are not real", async () => {
    const { intentId, registrationId } = await familyStartedBalance("bank");
    const admin = await adminClient("full");

    const over = await confirm(admin, intentId, { amount: 700_000, paidAt: "2026-11-02" });
    expect(over.status).toBe(400);
    expect(over.body.error).toContain("Үлдэгдлээс их");

    for (const amount of [0, -600_000, 600_000.5, "600000", null]) {
      expect((await confirm(admin, intentId, { amount, paidAt: "2026-11-02" })).status, String(amount)).toBe(400);
    }
    for (const paidAt of ["", "02.11.2026", "2026-13-45", "2999-01-01"]) {
      expect((await confirm(admin, intentId, { amount: 600_000, paidAt })).status, paidAt).toBe(400);
    }

    expect((await intentRow(intentId))?.status).toBe("pending");
    expect(await bookedAmounts(registrationId)).toEqual([600_000]);
  });
});

describe("cancelling a payment that never came", () => {
  it("keeps the row as cancelled, books nothing, and cannot then be confirmed", async () => {
    const { intentId, registrationId } = await familyStartedBalance("bank");
    const admin = await adminClient("full");

    const res = await admin.post<Reply>(`/api/admin/payment-intents/${intentId}/cancel`);

    expect(res.status, res.text).toBe(200);
    expect((await intentRow(intentId))?.status).toBe("cancelled");
    expect((await confirm(admin, intentId, { amount: 600_000, paidAt: "2026-11-02" })).status).toBe(409);
    expect(await bookedAmounts(registrationId)).toEqual([600_000]);
  });

  it("will not cancel one that is already booked", async () => {
    const { intentId, registrationId } = await familyStartedBalance("bank");
    const admin = await adminClient("full");
    expect((await confirm(admin, intentId, { amount: 600_000, paidAt: "2026-11-02" })).status).toBe(200);

    const res = await admin.post<Reply>(`/api/admin/payment-intents/${intentId}/cancel`);

    expect(res.status).toBe(409);
    expect(res.body.paid).toBe(true);
    expect((await intentRow(intentId))?.status).toBe("paid");
    expect(await bookedAmounts(registrationId)).toEqual([600_000, 600_000]);
  });
});

describe("a QPay balance payment", () => {
  it("books nothing while QPay has no record of the money", async () => {
    const { intentId, registrationId } = await familyStartedBalance("qpay");
    const admin = await adminClient("full");

    const res = await admin.post<Reply>(`/api/admin/payment-intents/${intentId}/qpay-check`);

    expect(res.status, res.text).toBe(200);
    expect(res.body.paid).toBe(false);
    expect((await intentRow(intentId))?.status).toBe("pending");
    expect(await bookedAmounts(registrationId)).toEqual([600_000]);
  });

  it("books it once QPay reports the payment, and only once", async () => {
    const { intentId, registrationId } = await familyStartedBalance("qpay");
    const invoice = await findMockInvoice(senderInvoiceNoForIntent(intentId));
    await payMockInvoice(invoice!.invoiceId);
    const admin = await adminClient("full");

    const first = await admin.post<Reply>(`/api/admin/payment-intents/${intentId}/qpay-check`);
    const second = await admin.post<Reply>(`/api/admin/payment-intents/${intentId}/qpay-check`);

    expect(first.body.paid).toBe(true);
    expect(first.body.intent?.status).toBe("paid");
    expect(second.body.paid).toBe(true);
    expect(await bookedAmounts(registrationId)).toEqual([600_000, 600_000]);
  });

  it("refuses to ask QPay about a bank payment", async () => {
    const { intentId } = await familyStartedBalance("bank");
    const admin = await adminClient("full");
    expect((await admin.post(`/api/admin/payment-intents/${intentId}/qpay-check`)).status).toBe(400);
  });

  it("paid by transfer instead: voids the invoice, then books the admin's figure as a bank payment", async () => {
    const { intentId, registrationId } = await familyStartedBalance("qpay");
    const admin = await adminClient("full");

    const res = await confirm(admin, intentId, { amount: 600_000, paidAt: "2026-11-03" });

    expect(res.status, res.text).toBe(200);
    // A live QR left in the family's history could take the money a second time.
    expect((await findMockInvoice(senderInvoiceNoForIntent(intentId)))?.cancelled).toBe(true);
    const row = await intentRow(intentId);
    expect(row?.status).toBe("paid");
    expect(row?.method).toBe("bank");
    expect(await bookedAmounts(registrationId)).toEqual([600_000, 600_000]);
  });

  it("books QPay's payment, not the admin's figure, when QPay had collected after all", async () => {
    const { intentId, registrationId } = await familyStartedBalance("qpay");
    const invoice = await findMockInvoice(senderInvoiceNoForIntent(intentId));
    await payMockInvoice(invoice!.invoiceId);
    const admin = await adminClient("full");

    const res = await confirm(admin, intentId, { amount: 500_000, paidAt: "2026-11-03" });

    expect(res.status).toBe(409);
    expect(res.body.paid).toBe(true);
    expect((await findMockInvoice(senderInvoiceNoForIntent(intentId)))?.cancelled).toBe(false);
    expect(await bookedAmounts(registrationId)).toEqual([600_000, 600_000]);
  });

  it("cancelling voids the invoice", async () => {
    const { intentId, registrationId } = await familyStartedBalance("qpay");
    const admin = await adminClient("full");

    const res = await admin.post<Reply>(`/api/admin/payment-intents/${intentId}/cancel`);

    expect(res.status, res.text).toBe(200);
    expect((await intentRow(intentId))?.status).toBe("cancelled");
    expect((await findMockInvoice(senderInvoiceNoForIntent(intentId)))?.cancelled).toBe(true);
    expect(await bookedAmounts(registrationId)).toEqual([600_000]);
  });

  it("cancelling one QPay had collected books it instead", async () => {
    const { intentId, registrationId } = await familyStartedBalance("qpay");
    const invoice = await findMockInvoice(senderInvoiceNoForIntent(intentId));
    await payMockInvoice(invoice!.invoiceId);
    const admin = await adminClient("full");

    const res = await admin.post<Reply>(`/api/admin/payment-intents/${intentId}/cancel`);

    expect(res.status).toBe(409);
    expect(res.body.paid).toBe(true);
    expect(res.body.payments?.length).toBe(2);
    expect((await intentRow(intentId))?.status).toBe("paid");
    expect(await bookedAmounts(registrationId)).toEqual([600_000, 600_000]);
  });
});
