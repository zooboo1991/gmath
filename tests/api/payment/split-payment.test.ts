/**
 * Хувааж төлөх — half the fee at enrollment, the rest by a promised date.
 *
 * Money moves here, so the questions are the same as everywhere else in this
 * folder: is the invoice for the amount the screen showed, can a request
 * split something that is not allowed to split, and does the roster end up
 * owing what it should.
 */

import { afterAll, describe, expect, it } from "vitest";
import { signedInClient, TestClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import {
  createTestCourse,
  createTestUser,
  readRegistration,
  trackNotificationsForCreatedUsers,
} from "../../support/factories";
import { findMockInvoice, payMockInvoice, senderInvoiceNoForRegistration } from "../../support/mockControl";

afterAll(async () => {
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
});

type EnrollResponse = {
  error?: string;
  registration?: { id: string; status: string };
  amountDue?: number;
  qrImage?: string;
};

/** A date the picker would allow: inside the window, before the deadline. */
const NEXT_PAYMENT = "2026-09-15";

async function enroll(client: TestClient, body: Record<string, unknown>) {
  const res = await client.post<EnrollResponse>("/api/enroll", body);
  if (res.body?.registration?.id) track("registrations", res.body.registration.id);
  return res;
}

async function paymentsFor(registrationId: string): Promise<number[]> {
  const { data } = await testDb()
    .from("registration_payments")
    .select("amount")
    .eq("registration_id", registrationId);
  return ((data ?? []) as { amount: number }[]).map((row) => row.amount);
}

describe("splitting a classroom group's fee", () => {
  it("invoices half and remembers the whole", async () => {
    const course = await createTestCourse({ price: "1,200,000₮", template: "songon" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    const res = await enroll(client, {
      programId: course.id,
      payMethod: "qpay",
      plan: "split",
      nextPaymentDate: NEXT_PAYMENT,
    });
    expect(res.status, res.text).toBe(200);
    const id = res.body.registration!.id;

    // The invoice is for what the screen said: half — and the screen is told
    // the same number, rather than quoting the course price back at the payer.
    const invoice = await findMockInvoice(senderInvoiceNoForRegistration(id));
    expect(invoice?.amount).toBe(600_000);
    expect(res.body.amountDue).toBe(600_000);

    const row = (await readRegistration(id))!;
    expect(row.total_due).toBe(1_200_000);
    expect(row.installment_due_date).toBe(NEXT_PAYMENT);
    // The price stays the course's price — the fee did not change, only when
    // it is paid.
    expect(row.price).toBe("1,200,000₮");
  });

  it("records the half QPay collected, so the roster owes the rest", async () => {
    const course = await createTestCourse({ price: "2,800,000₮", template: "songon" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    const res = await enroll(client, {
      programId: course.id,
      payMethod: "qpay",
      plan: "split",
      nextPaymentDate: NEXT_PAYMENT,
    });
    const id = res.body.registration!.id;

    const invoice = await findMockInvoice(senderInvoiceNoForRegistration(id));
    await payMockInvoice(invoice!.invoiceId);
    const settled = await client.post(`/api/enroll/${id}/check`);
    expect(settled.status, settled.text).toBe(200);

    const row = (await readRegistration(id))!;
    expect(row.status).toBe("active");
    expect(await paymentsFor(id)).toEqual([1_400_000]);
  });

  it("invoices the whole fee when the family pays in one go", async () => {
    const course = await createTestCourse({ price: "1,200,000₮", template: "songon" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    const res = await enroll(client, { programId: course.id, payMethod: "qpay", plan: "full" });
    const id = res.body.registration!.id;

    const invoice = await findMockInvoice(senderInvoiceNoForRegistration(id));
    expect(invoice?.amount).toBe(1_200_000);
    expect(res.body.amountDue).toBe(1_200_000);
    const row = (await readRegistration(id))!;
    expect(row.total_due).toBeNull();
    expect(row.installment_due_date).toBeNull();
  });

  it("quotes the same half when the payer reopens the QR", async () => {
    const course = await createTestCourse({ price: "1,200,000₮", template: "songon" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    const first = await enroll(client, {
      programId: course.id,
      payMethod: "qpay",
      plan: "split",
      nextPaymentDate: NEXT_PAYMENT,
    });
    // A reopened modal sends whatever the form currently holds — the stored
    // plan, not the fresh request, has to decide the amount.
    const again = await enroll(client, { programId: course.id, payMethod: "qpay", plan: "full" });

    expect(again.status, again.text).toBe(200);
    expect(again.body.registration!.id).toBe(first.body.registration!.id);
    expect(again.body.amountDue).toBe(600_000);
  });

  it("refuses to split an ordinary course", async () => {
    const course = await createTestCourse({ price: "350,000₮" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    const res = await enroll(client, {
      programId: course.id,
      payMethod: "qpay",
      plan: "split",
      nextPaymentDate: NEXT_PAYMENT,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("хувааж");
  });

  it("refuses a date outside the window", async () => {
    const course = await createTestCourse({ price: "1,200,000₮", template: "songon" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    for (const nextPaymentDate of ["", "2026-10-02", "2020-01-01", "маргааш"]) {
      const res = await enroll(client, {
        programId: course.id,
        payMethod: "qpay",
        plan: "split",
        nextPaymentDate,
      });
      expect(res.status, `date=${nextPaymentDate}`).toBe(400);
    }
  });

  it("tells a bank transfer what half to send", async () => {
    const course = await createTestCourse({ price: "1,200,000₮", template: "songon" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    const res = await enroll(client, {
      programId: course.id,
      payMethod: "bank",
      plan: "split",
      nextPaymentDate: NEXT_PAYMENT,
    });
    expect(res.status, res.text).toBe(200);
    expect(res.body.amountDue).toBe(600_000);

    const row = (await readRegistration(res.body.registration!.id))!;
    expect(row.status).toBe("pending");
    expect(row.total_due).toBe(1_200_000);
  });
});
