/**
 * GET /api/qpay/callback — the payment webhook.
 *
 * It has no signature check, and that is deliberate: the query string is
 * never treated as proof of anything. It only says *which* row to re-check,
 * and settle*Payment then asks QPay itself about the invoice id we stored.
 * So the properties worth testing are not "is the signature valid" but:
 *
 *   - a forged or replayed hit cannot mark anything paid while QPay says it
 *     is unpaid
 *   - one real payment is processed exactly once, however many times the
 *     callback arrives (or arrives twice at once)
 *   - the answer is always HTTP 200 with the body "SUCCESS", because QPay
 *     retries anything else — including when our own side has failed
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, signedInClient, TestClient } from "../../support/client";
import { cleanupTracked, track, testDb } from "../../support/db";
import {
  createTestAssessment,
  createTestCourse,
  createTestRegistration,
  createTestUser,
  notificationsFor,
  readRegistration,
  trackNotificationsForCreatedUsers,
} from "../../support/factories";
import {
  failMockInvoiceCheck,
  findMockInvoice,
  mockCalls,
  payMockInvoice,
  resetMockCalls,
  senderInvoiceNoForAssessment,
  senderInvoiceNoForRegistration,
} from "../../support/mockControl";

afterAll(async () => {
  // Activating a registration notifies the student; those rows outlive the
  // user unless they are registered too.
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
});

beforeEach(async () => {
  await resetMockCalls();
});

function callback(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return anonClient().get(`/api/qpay/callback?${query}`);
}

/** Enrols a student and returns the registration plus the invoice QPay issued. */
async function pendingEnrolment(price = "100,000₮") {
  const course = await createTestCourse({ price });
  const student = await createTestUser();
  const client = await signedInClient(student.phone, student.password);

  const res = await client.post<{ registration: { id: string } }>("/api/enroll", {
    programId: course.id,
    payMethod: "qpay",
  });
  const registrationId = res.body.registration.id;
  track("registrations", registrationId);

  const invoice = await findMockInvoice(senderInvoiceNoForRegistration(registrationId));
  return { course, student, client, registrationId, invoice: invoice! };
}

async function smsTo(phone: string): Promise<number> {
  const calls = await mockCalls("skytel");
  return calls.filter((c) => c.query.sendto === phone).length;
}

describe("the callback always answers 200 SUCCESS", () => {
  const cases: [string, Record<string, string>][] = [
    ["a real pending registration", {}], // filled in below
    ["no parameters at all", {}],
    ["an unknown type", { type: "banana", ref: randomUUID() }],
    ["a type with no ref", { type: "registration" }],
    ["a ref that is not a UUID", { type: "registration", ref: "not-a-uuid" }],
    ["a ref that exists for a different kind of row", { type: "assessment", ref: randomUUID() }],
    ["an injection-shaped ref", { type: "registration", ref: "' or 1=1 --" }],
    ["extra parameters QPay never sends", { type: "registration", ref: randomUUID(), admin: "true" }],
  ];

  for (const [name, params] of cases.slice(1)) {
    it(`for ${name}`, async () => {
      const res = await callback(params);
      expect(res.status).toBe(200);
      // Exactly this, nothing else: QPay treats any other answer as a
      // delivery failure and keeps retrying.
      expect(res.text).toBe("SUCCESS");
    });
  }

  it("for a genuine settlement", async () => {
    const { registrationId, invoice } = await pendingEnrolment();
    await payMockInvoice(invoice.invoiceId);

    const res = await callback({ type: "registration", ref: registrationId });
    expect(res.status).toBe(200);
    expect(res.text).toBe("SUCCESS");
  });

  it("even when QPay's own check is failing", async () => {
    const { registrationId, invoice } = await pendingEnrolment();
    await failMockInvoiceCheck(invoice.invoiceId);

    const res = await callback({ type: "registration", ref: registrationId });
    expect(res.status).toBe(200);
    expect(res.text).toBe("SUCCESS");
    // And the registration is left alone rather than guessed at.
    expect((await readRegistration(registrationId))?.status).toBe("pending");
  });
});

describe("a callback cannot make anything paid on its own", () => {
  it("leaves an unpaid registration pending", async () => {
    const { registrationId } = await pendingEnrolment();

    const res = await callback({ type: "registration", ref: registrationId });
    expect(res.text).toBe("SUCCESS");

    // QPay says the invoice is unpaid, so nothing moves — this is the whole
    // reason the query string needs no signature.
    const row = await readRegistration(registrationId);
    expect(row?.status).toBe("pending");
    expect(row?.qpay_payment_id).toBeNull();
  });

  it("ignores a payment id supplied in the query string", async () => {
    const { registrationId } = await pendingEnrolment();

    await callback({
      type: "registration",
      ref: registrationId,
      qpay_payment_id: "attacker-supplied-payment-id",
      payment_status: "PAID",
      status: "PAID",
      amount: "350000",
    });

    const row = await readRegistration(registrationId);
    expect(row?.status).toBe("pending");
    expect(row?.qpay_payment_id).toBeNull();
    expect(JSON.stringify(row)).not.toContain("attacker-supplied-payment-id");
  });

  it("cannot be replayed into a payment by hitting it repeatedly", async () => {
    const { registrationId } = await pendingEnrolment();

    for (let i = 0; i < 5; i += 1) {
      await callback({ type: "registration", ref: registrationId });
    }

    expect((await readRegistration(registrationId))?.status).toBe("pending");
  });

  it("does not settle a bank-transfer registration", async () => {
    const course = await createTestCourse();
    const student = await createTestUser();
    const registration = await createTestRegistration({
      userId: student.id,
      programId: course.id,
      payMethod: "bank",
      status: "pending",
    });

    await callback({ type: "registration", ref: registration.id });

    // A bank transfer is confirmed by an admin, never by this webhook.
    expect((await readRegistration(registration.id))?.status).toBe("pending");
  });

  it("does not touch a registration belonging to a different ref", async () => {
    const first = await pendingEnrolment();
    const second = await pendingEnrolment();
    await payMockInvoice(first.invoice.invoiceId);

    await callback({ type: "registration", ref: first.registrationId });

    expect((await readRegistration(first.registrationId))?.status).toBe("active");
    expect((await readRegistration(second.registrationId))?.status).toBe("pending");
  });
});

describe("a real payment is processed exactly once", () => {
  it("activates on the first callback and does nothing on the next four", async () => {
    const { student, registrationId, invoice } = await pendingEnrolment();
    await payMockInvoice(invoice.invoiceId, "qpay-payment-0001");
    await resetMockCalls();

    await callback({ type: "registration", ref: registrationId });
    const afterFirst = await readRegistration(registrationId);
    expect(afterFirst?.status).toBe("active");
    expect(afterFirst?.qpay_payment_id).toBe("qpay-payment-0001");

    for (let i = 0; i < 4; i += 1) {
      const res = await callback({ type: "registration", ref: registrationId });
      expect(res.text).toBe("SUCCESS");
    }

    // The row is unchanged, and — the part that actually costs money and
    // annoys people — the student was told once, not five times.
    expect(await readRegistration(registrationId)).toEqual(afterFirst);
    expect(await smsTo(student.phone)).toBe(1);
    expect(await notificationsFor(student.id)).toHaveLength(1);
  });

  it("survives two callbacks landing at the same moment", async () => {
    const { student, registrationId, invoice } = await pendingEnrolment();
    await payMockInvoice(invoice.invoiceId);
    await resetMockCalls();

    // The webhook and the client's own poll genuinely do arrive together.
    const results = await Promise.all([
      callback({ type: "registration", ref: registrationId }),
      callback({ type: "registration", ref: registrationId }),
      callback({ type: "registration", ref: registrationId }),
    ]);
    for (const res of results) expect(res.text).toBe("SUCCESS");

    expect((await readRegistration(registrationId))?.status).toBe("active");
    // The conditional UPDATE (`.eq("status", "pending")`) is what makes this
    // hold: only one caller can win the transition, so only one notifies.
    expect(await smsTo(student.phone)).toBe(1);
    expect(await notificationsFor(student.id)).toHaveLength(1);
  });

  it("does not re-notify when the client poll settles it first", async () => {
    const { client, student, registrationId, invoice } = await pendingEnrolment();
    await payMockInvoice(invoice.invoiceId);
    await resetMockCalls();

    const polled = await client.post<{ paid: boolean }>(`/api/enroll/${registrationId}/check`);
    expect(polled.status).toBe(200);
    expect(polled.body.paid).toBe(true);

    await callback({ type: "registration", ref: registrationId });

    expect(await smsTo(student.phone)).toBe(1);
    expect(await notificationsFor(student.id)).toHaveLength(1);
  });
});

describe("assessment payments settle the same way", () => {
  async function pendingAssessment() {
    const student = await createTestUser();
    const assessment = await createTestAssessment({
      userId: student.id,
      status: "awaiting_payment",
      amount: "50,000₮",
    });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.post(`/api/assessment/${assessment.id}/pay`);
    expect(res.status).toBe(200);

    const invoice = await findMockInvoice(senderInvoiceNoForAssessment(assessment.id));
    return { student, client, assessmentId: assessment.id, invoice: invoice! };
  }

  async function readAssessment(id: string) {
    const { data } = await testDb().from("assessments").select("*").eq("id", id).maybeSingle();
    return data as Record<string, unknown> | null;
  }

  it("bills the amount stored on the assessment", async () => {
    const { invoice } = await pendingAssessment();
    expect(invoice.amount).toBe(50000);
  });

  it("leaves an unpaid assessment awaiting payment", async () => {
    const { assessmentId } = await pendingAssessment();

    const res = await callback({ type: "assessment", ref: assessmentId });
    expect(res.text).toBe("SUCCESS");
    expect((await readAssessment(assessmentId))?.status).toBe("awaiting_payment");
  });

  it("marks it paid once and does not rewrite it afterwards", async () => {
    const { assessmentId, invoice } = await pendingAssessment();
    await payMockInvoice(invoice.invoiceId, "qpay-assessment-0001");

    await callback({ type: "assessment", ref: assessmentId });
    const afterFirst = await readAssessment(assessmentId);
    expect(afterFirst?.status).toBe("paid");
    expect(afterFirst?.payment_ref).toBe("qpay-assessment-0001");

    await callback({ type: "assessment", ref: assessmentId });
    const afterSecond = await readAssessment(assessmentId);

    // paid_at is an audit trail — a second callback must not move it.
    expect(afterSecond?.paid_at).toBe(afterFirst?.paid_at);
    expect(afterSecond?.payment_ref).toBe(afterFirst?.payment_ref);
  });

  it("does not let a registration callback settle an assessment", async () => {
    const { assessmentId, invoice } = await pendingAssessment();
    await payMockInvoice(invoice.invoiceId);

    await callback({ type: "registration", ref: assessmentId });

    expect((await readAssessment(assessmentId))?.status).toBe("awaiting_payment");
  });
});

describe("POST /api/enroll/[id]/check", () => {
  it("refuses a signed-out visitor", async () => {
    const res = await anonClient().post(`/api/enroll/${randomUUID()}/check`);
    expect(res.status).toBe(401);
  });

  it("refuses to check another student's registration", async () => {
    const { registrationId, invoice } = await pendingEnrolment();
    await payMockInvoice(invoice.invoiceId);

    const stranger = await createTestUser();
    const client: TestClient = await signedInClient(stranger.phone, stranger.password);
    const res = await client.post(`/api/enroll/${registrationId}/check`);

    expect(res.status).toBe(404);
    // And the refusal is not a side door: the row is untouched by it.
    expect((await readRegistration(registrationId))?.status).toBe("pending");
  });

  it("reports an unpaid invoice as unpaid", async () => {
    const { client, registrationId } = await pendingEnrolment();

    const res = await client.post<{ paid: boolean }>(`/api/enroll/${registrationId}/check`);
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(false);
  });

  it("answers 502 rather than guessing when QPay is unreachable", async () => {
    const { client, registrationId, invoice } = await pendingEnrolment();
    await failMockInvoiceCheck(invoice.invoiceId);

    const res = await client.post(`/api/enroll/${registrationId}/check`);
    expect(res.status).toBe(502);
    expect((await readRegistration(registrationId))?.status).toBe("pending");
  });
});
