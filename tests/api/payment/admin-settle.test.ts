/**
 * The two admin answers to a pending QPay registration:
 *
 *   POST /api/admin/registrations/[id]/qpay-check   — ask QPay
 *   POST /api/admin/registrations/[id]/settle-manual — "it came by transfer"
 *
 * Both exist because the old UI offered one button, `approve`, on every
 * pending row regardless of payment method — and on a QPay row that button
 * handed out a paid seat on the admin's word alone.
 *
 * So the properties worth holding down are the ones that cost money if they
 * break: qpay-check must never confirm a row QPay says is unpaid, and
 * settle-manual must never leave a live invoice behind (double payment) nor
 * fire on a row QPay has in fact already collected.
 */

import { afterAll, describe, expect, it } from "vitest";
import { adminClient, signedInClient, TestClient } from "../../support/client";
import { cleanupTracked, track, testDb } from "../../support/db";
import {
  createTestCourse,
  createTestRegistration,
  createTestUser,
  readRegistration,
  trackNotificationsForCreatedUsers,
} from "../../support/factories";
import {
  failMockInvoiceCheck,
  findMockInvoice,
  payMockInvoice,
  senderInvoiceNoForRegistration,
} from "../../support/mockControl";

afterAll(async () => {
  // Settling notifies the student — same reason as enroll.test.ts.
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
});

/** A pending QPay registration with a real invoice behind it, made the way a parent makes one. */
async function pendingQpayRegistration(): Promise<{
  registrationId: string;
  invoiceId: string;
  student: TestClient;
}> {
  const course = await createTestCourse();
  const user = await createTestUser();
  const student = await signedInClient(user.phone, user.password);

  const created = await student.post<{ registration?: { id: string } }>("/api/enroll", {
    programId: course.id,
    payMethod: "qpay",
  });
  const registrationId = created.body.registration!.id;
  track("registrations", registrationId);

  const invoice = await findMockInvoice(senderInvoiceNoForRegistration(registrationId));
  return { registrationId, invoiceId: invoice!.invoiceId, student };
}

async function paymentsFor(registrationId: string) {
  const { data, error } = await testDb()
    .from("registration_payments")
    .select("*")
    .eq("registration_id", registrationId);
  if (error) throw new Error(`paymentsFor failed: ${error.message}`);
  return (data ?? []) as { amount: number; paid_at: string }[];
}

describe("asking QPay about a pending registration", () => {
  it("confirms nothing when QPay has no record of a payment", async () => {
    const { registrationId } = await pendingQpayRegistration();
    const admin = await adminClient("full");

    const res = await admin.post<{ paid: boolean }>(
      `/api/admin/registrations/${registrationId}/qpay-check`
    );

    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(false);
    // The whole point: an unpaid row is still unpaid after an admin asks.
    expect((await readRegistration(registrationId))?.status).toBe("pending");
  });

  it("confirms the registration once QPay reports the payment", async () => {
    const { registrationId, invoiceId } = await pendingQpayRegistration();
    await payMockInvoice(invoiceId);
    const admin = await adminClient("full");

    const res = await admin.post<{ paid: boolean }>(
      `/api/admin/registrations/${registrationId}/qpay-check`
    );

    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);
    expect((await readRegistration(registrationId))?.status).toBe("active");
  });

  it("reports a QPay outage instead of guessing", async () => {
    const { registrationId, invoiceId } = await pendingQpayRegistration();
    await failMockInvoiceCheck(invoiceId);
    const admin = await adminClient("full");

    const res = await admin.post(`/api/admin/registrations/${registrationId}/qpay-check`);

    expect(res.status).toBe(502);
    expect((await readRegistration(registrationId))?.status).toBe("pending");
    await failMockInvoiceCheck(invoiceId, false);
  });

  it("refuses a row that has no QPay invoice at all", async () => {
    const course = await createTestCourse();
    const registration = await createTestRegistration({
      programId: course.id,
      payMethod: "bank",
      status: "pending",
    });
    const admin = await adminClient("full");

    const res = await admin.post(`/api/admin/registrations/${registration.id}/qpay-check`);

    expect(res.status).toBe(400);
    expect((await readRegistration(registration.id))?.status).toBe("pending");
  });
});

describe("confirming a bank transfer against a QPay row", () => {
  it("records the payment, rewrites the method and voids the invoice", async () => {
    const { registrationId } = await pendingQpayRegistration();
    const admin = await adminClient("full");

    const res = await admin.post(`/api/admin/registrations/${registrationId}/settle-manual`, {
      amount: 350000,
      paidAt: "2026-08-11",
      reference: "972591449007",
    });

    expect(res.status).toBe(200);
    const row = await readRegistration(registrationId);
    expect(row?.status).toBe("active");
    // The books have to describe the transfer that really happened.
    expect(row?.pay_method).toBe("bank");
    expect(await paymentsFor(registrationId)).toEqual([
      expect.objectContaining({ amount: 350000, paid_at: "2026-08-11" }),
    ]);
    // The parent still has the QR in their banking app history.
    expect((await findMockInvoice(senderInvoiceNoForRegistration(registrationId)))?.cancelled).toBe(
      true
    );
  });

  it("refuses when QPay has in fact already collected the money", async () => {
    const { registrationId, invoiceId } = await pendingQpayRegistration();
    // A paid invoice cannot be voided, and this is why that matters: the
    // "transfer" the admin is about to record is the QPay payment itself.
    await payMockInvoice(invoiceId);
    const admin = await adminClient("full");

    const res = await admin.post(`/api/admin/registrations/${registrationId}/settle-manual`, {
      amount: 350000,
      paidAt: "2026-08-11",
    });

    expect(res.status).toBe(502);
    expect((await readRegistration(registrationId))?.status).toBe("pending");
    expect(await paymentsFor(registrationId)).toEqual([]);
  });

  it("will not double-confirm a registration that is already active", async () => {
    const course = await createTestCourse();
    const registration = await createTestRegistration({
      programId: course.id,
      payMethod: "qpay",
      status: "active",
    });
    const admin = await adminClient("full");

    const res = await admin.post(`/api/admin/registrations/${registration.id}/settle-manual`, {
      amount: 350000,
      paidAt: "2026-08-11",
    });

    expect(res.status).toBe(409);
    expect(await paymentsFor(registration.id)).toEqual([]);
  });

  it("insists on a real amount and a real date", async () => {
    const { registrationId } = await pendingQpayRegistration();
    const admin = await adminClient("full");

    const bad = [
      { amount: 0, paidAt: "2026-08-11" },
      { amount: -350000, paidAt: "2026-08-11" },
      { amount: 350000, paidAt: "" },
      { amount: 350000, paidAt: "11.08.2026" },
      {},
    ];

    for (const body of bad) {
      const res = await admin.post(
        `/api/admin/registrations/${registrationId}/settle-manual`,
        body
      );
      expect(res.status, JSON.stringify(body)).toBe(400);
    }

    // Nothing above touched the row or its invoice.
    expect((await readRegistration(registrationId))?.status).toBe("pending");
    expect(await paymentsFor(registrationId)).toEqual([]);
  });
});

describe("a row that says bank while holding a QPay invoice", () => {
  /**
   * The shape the pay_method bug left in the database: pay_method "bank", a
   * live QPay invoice attached, and the money already collected. Nothing used
   * to check such a row, so the seat was never granted. QPay's answer decides,
   * and pay_method is corrected to say where the money came from.
   */
  it("is settled by asking QPay, and the books are corrected", async () => {
    const { registrationId, invoiceId } = await pendingQpayRegistration();
    const { error } = await testDb()
      .from("registrations")
      .update({ pay_method: "bank" })
      .eq("id", registrationId);
    expect(error).toBeNull();
    await payMockInvoice(invoiceId);

    const admin = await adminClient("full");
    const res = await admin.post<{ paid: boolean }>(
      `/api/admin/registrations/${registrationId}/qpay-check`
    );

    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);
    const row = await readRegistration(registrationId);
    expect(row?.status).toBe("active");
    expect(row?.pay_method).toBe("qpay");
  });
});

describe("cancelling a pending registration", () => {
  it("keeps the row, marks it cancelled and voids the invoice", async () => {
    const { registrationId } = await pendingQpayRegistration();
    const admin = await adminClient("full");

    const res = await admin.post(`/api/admin/registrations/${registrationId}/cancel`);

    expect(res.status).toBe(200);
    // Deleting it was the old behaviour: the admin list then showed nothing at
    // all, so nobody could see what had been cancelled or for how much.
    const row = await readRegistration(registrationId);
    expect(row?.status).toBe("cancelled");
    expect((await findMockInvoice(senderInvoiceNoForRegistration(registrationId)))?.cancelled).toBe(
      true
    );
  });

  it("gives the seat back", async () => {
    const course = await createTestCourse({ capacity: 1 });
    const first = await createTestUser();
    const firstClient = await signedInClient(first.phone, first.password);
    const created = await firstClient.post<{ registration?: { id: string } }>("/api/enroll", {
      programId: course.id,
      payMethod: "bank",
    });
    track("registrations", created.body.registration!.id);

    const second = await createTestUser();
    const secondClient = await signedInClient(second.phone, second.password);
    const full = await secondClient.post("/api/enroll", { programId: course.id, payMethod: "bank" });
    expect(full.status).toBe(409);

    const admin = await adminClient("full");
    expect((await admin.post(`/api/admin/registrations/${created.body.registration!.id}/cancel`)).status).toBe(200);

    const afterCancel = await secondClient.post<{ registration?: { id: string } }>("/api/enroll", {
      programId: course.id,
      payMethod: "bank",
    });
    if (afterCancel.body.registration?.id) track("registrations", afterCancel.body.registration.id);
    expect(afterCancel.status).toBe(200);
  });

  it("lets the same student register for that course again", async () => {
    const course = await createTestCourse();
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);
    const created = await client.post<{ registration?: { id: string } }>("/api/enroll", {
      programId: course.id,
      payMethod: "bank",
    });
    const firstId = created.body.registration!.id;
    track("registrations", firstId);

    const admin = await adminClient("full");
    expect((await admin.post(`/api/admin/registrations/${firstId}/cancel`)).status).toBe(200);

    // A new row, not the cancelled one revived: the QPay sender_invoice_no is
    // derived from the row id and can never be reused.
    const again = await client.post<{ registration?: { id: string } }>("/api/enroll", {
      programId: course.id,
      payMethod: "bank",
    });
    if (again.body.registration?.id) track("registrations", again.body.registration.id);
    expect(again.status).toBe(200);
    expect(again.body.registration!.id).not.toBe(firstId);
    // The cancelled row is still there — that is the whole point.
    expect((await readRegistration(firstId))?.status).toBe("cancelled");
  });

  it("refuses to cancel a registration QPay has collected on", async () => {
    const { registrationId, invoiceId } = await pendingQpayRegistration();
    await payMockInvoice(invoiceId);
    const admin = await adminClient("full");

    const res = await admin.post<{ paid: boolean }>(
      `/api/admin/registrations/${registrationId}/cancel`
    );

    expect(res.status).toBe(409);
    expect(res.body.paid).toBe(true);
    // The click landed on money that had arrived — the student gets the seat,
    // not a cancellation.
    expect((await readRegistration(registrationId))?.status).toBe("active");
  });
});

describe("confirming by hand a row that still holds a QPay invoice", () => {
  /**
   * How a seat gets granted while the QR stays payable: the student opened the
   * QPay option, transferred from their banking app instead, and the admin
   * pressed the plain "Баталгаажуулах". The invoice was never voided, so the QR
   * sitting in the parent's app history could still take the fee a second time.
   */
  it("voids the invoice before granting the seat", async () => {
    const { registrationId } = await pendingQpayRegistration();
    const admin = await adminClient("full");

    const res = await admin.post(`/api/admin/registrations/${registrationId}/approve`);

    expect(res.status).toBe(200);
    expect((await readRegistration(registrationId))?.status).toBe("active");
    expect((await findMockInvoice(senderInvoiceNoForRegistration(registrationId)))?.cancelled).toBe(
      true
    );
  });

  it("settles from QPay instead when the money did come through", async () => {
    const { registrationId, invoiceId } = await pendingQpayRegistration();
    await payMockInvoice(invoiceId);
    const admin = await adminClient("full");

    const res = await admin.post<{ paid: boolean }>(
      `/api/admin/registrations/${registrationId}/approve`
    );

    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);
    const row = await readRegistration(registrationId);
    expect(row?.status).toBe("active");
    // QPay's record decides what the books say, not the button that was pressed.
    expect(row?.pay_method).toBe("qpay");
  });

  it("leaves an ordinary bank registration alone", async () => {
    const course = await createTestCourse();
    const registration = await createTestRegistration({
      programId: course.id,
      payMethod: "bank",
      status: "pending",
    });
    const admin = await adminClient("full");

    const res = await admin.post(`/api/admin/registrations/${registration.id}/approve`);

    expect(res.status).toBe(200);
    expect((await readRegistration(registration.id))?.status).toBe("active");
  });
});
