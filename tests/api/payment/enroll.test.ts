/**
 * POST /api/enroll and /api/enroll/[id]/cancel — course registration and the
 * QPay invoice behind it.
 *
 * Money moves here, so the questions are: can a hand-written request set its
 * own price, can a full class be over-filled, and can one attempt end up with
 * two invoices (QPay's sender_invoice_no can never be reused once issued, so
 * a second one for the same attempt is unrecoverable).
 *
 * Every QPay call goes to the mock, which reproduces the two real constraints
 * that matter: a sender_invoice_no cannot be reused, and a paid invoice
 * cannot be cancelled.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, signedInClient, TestClient } from "../../support/client";
import { cleanupTracked, track } from "../../support/db";
import {
  createTestCourse,
  createTestRegistration,
  createTestUser,
  makePhone,
  readRegistration,
  trackNotificationsForCreatedUsers,
} from "../../support/factories";
import {
  findMockInvoice,
  listMockInvoices,
  payMockInvoice,
  senderInvoiceNoForRegistration,
} from "../../support/mockControl";

afterAll(async () => {
  // A registration that settles notifies the student — see the same note in
  // callback.test.ts.
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
});

type EnrollResponse = {
  ok: boolean;
  error?: string;
  registration?: { id: string; status: string; price: string };
  paid?: boolean;
  qrImage?: string;
  shortUrl?: string;
};

async function enroll(client: TestClient, body: Record<string, unknown>) {
  const res = await client.post<EnrollResponse>("/api/enroll", body);
  if (res.body?.registration?.id) track("registrations", res.body.registration.id);
  return res;
}

describe("who may enrol", () => {
  it("refuses a signed-out visitor", async () => {
    const course = await createTestCourse();
    const res = await anonClient().post("/api/enroll", {
      programId: course.id,
      payMethod: "qpay",
    });
    expect(res.status).toBe(401);
  });

  it("refuses a course that does not exist", async () => {
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const res = await enroll(client, { programId: randomUUID(), payMethod: "qpay" });
    expect(res.status).toBe(404);
  });

  it("refuses a programId that is neither a course nor a yearly programme", async () => {
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const res = await enroll(client, { programId: "program-does-not-exist", payMethod: "qpay" });
    expect(res.status).toBe(404);
  });

  describe("malformed input", () => {
    const cases: [string, unknown][] = [
      ["no programId", { payMethod: "qpay" }],
      ["programId as a number", { programId: 42, payMethod: "qpay" }],
      ["no payMethod", { programId: randomUUID() }],
      ["unknown payMethod", { programId: randomUUID(), payMethod: "cash" }],
      ["payMethod as an object", { programId: randomUUID(), payMethod: { qpay: true } }],
    ];

    for (const [name, body] of cases) {
      it(`answers 400 for ${name}`, async () => {
        const student = await createTestUser();
        const client = await signedInClient(student.phone, student.password);
        const res = await enroll(client, body as Record<string, unknown>);
        expect(res.status).toBe(400);
      });
    }
  });
});

describe("the price always comes from the server", () => {
  it("ignores a price sent by the client", async () => {
    const course = await createTestCourse({ price: "350,000₮" });
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const res = await enroll(client, {
      programId: course.id,
      payMethod: "qpay",
      // Everything a crafted request might try.
      price: "1₮",
      amount: 1,
      amountMnt: 1,
      totalDue: 1,
      registration: { price: "1₮" },
    });

    expect(res.status).toBe(200);
    const registrationId = res.body.registration!.id;

    // The stored registration carries the course's price...
    expect(res.body.registration!.price).toBe("350,000₮");
    expect((await readRegistration(registrationId))?.price).toBe("350,000₮");

    // ...and, decisively, so does the invoice QPay was actually asked for.
    const invoice = await findMockInvoice(senderInvoiceNoForRegistration(registrationId));
    expect(invoice?.amount).toBe(350000);
  });

  it("bills the course's price even when the client sends none at all", async () => {
    const course = await createTestCourse({ price: "120,000₮" });
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const res = await enroll(client, { programId: course.id, payMethod: "qpay" });
    const invoice = await findMockInvoice(senderInvoiceNoForRegistration(res.body.registration!.id));
    expect(invoice?.amount).toBe(120000);
  });

  it("puts the student's own phone on the invoice, not one from the request", async () => {
    const course = await createTestCourse();
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const res = await enroll(client, {
      programId: course.id,
      payMethod: "qpay",
      phone: "99999999",
      description: "attacker supplied",
    });

    const invoice = await findMockInvoice(senderInvoiceNoForRegistration(res.body.registration!.id));
    expect(invoice?.description).toContain(student.phone);
    expect(invoice?.description).not.toContain("99999999");
    expect(invoice?.description).not.toContain("attacker supplied");
  });

  it("sends the callback URL to our own site, not one from the request", async () => {
    const course = await createTestCourse();
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const res = await enroll(client, {
      programId: course.id,
      payMethod: "qpay",
      callbackUrl: "https://attacker.example/collect",
    });

    const invoice = await findMockInvoice(senderInvoiceNoForRegistration(res.body.registration!.id));
    expect(invoice?.callbackUrl).toContain("/api/qpay/callback");
    expect(invoice?.callbackUrl).not.toContain("attacker.example");
  });
});

describe("seat limits", () => {
  it("refuses the nineteenth registration for an eighteen seat class", async () => {
    const course = await createTestCourse({ capacity: 18 });
    for (let seat = 0; seat < 18; seat += 1) {
      await createTestRegistration({
        phone: makePhone(),
        programId: course.id,
        payMethod: "manual",
        status: "active",
      });
    }

    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);
    const res = await enroll(client, { programId: course.id, payMethod: "qpay" });

    expect(res.status).toBe(409);
    expect(res.body.registration).toBeUndefined();
  });

  it("counts a pending registration against the capacity", async () => {
    const course = await createTestCourse({ capacity: 1 });
    await createTestRegistration({
      phone: makePhone(),
      programId: course.id,
      payMethod: "qpay",
      status: "pending",
    });

    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);
    const res = await enroll(client, { programId: course.id, payMethod: "qpay" });

    // Someone mid-checkout is holding the seat; handing it to a second
    // student would mean taking money for a place that doesn't exist.
    expect(res.status).toBe(409);
  });

  /**
   * A registration admin added by hand for a student who has no account yet
   * has user_id NULL and only a phone number (addManualRegistration). It
   * holds a seat like any other, and excluding the *caller's* row from the
   * count must not quietly drop these along with it — `user_id <> '<uuid>'`
   * is NULL, not true, for a NULL user_id.
   */
  it("counts a classmate who was added by hand and has no account yet", async () => {
    const course = await createTestCourse({ capacity: 1 });
    await createTestRegistration({
      phone: makePhone(),
      programId: course.id,
      payMethod: "manual",
      status: "active",
    });

    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);
    const res = await enroll(client, { programId: course.id, payMethod: "qpay" });

    expect(res.status).toBe(409);
  });

  it("creates no invoice when the class is full", async () => {
    const course = await createTestCourse({ capacity: 1 });
    await createTestRegistration({ phone: makePhone(), programId: course.id, status: "active" });

    const before = (await listMockInvoices()).length;
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);
    await enroll(client, { programId: course.id, payMethod: "qpay" });

    expect((await listMockInvoices()).length).toBe(before);
  });

  it("applies the limit to bank transfers too", async () => {
    const course = await createTestCourse({ capacity: 1 });
    await createTestRegistration({ phone: makePhone(), programId: course.id, status: "active" });

    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);
    const res = await enroll(client, { programId: course.id, payMethod: "bank" });
    expect(res.status).toBe(409);
  });

  it("lets the last seat go to exactly one student", async () => {
    const course = await createTestCourse({ capacity: 3 });
    await createTestRegistration({ phone: makePhone(), programId: course.id, status: "active" });
    await createTestRegistration({ phone: makePhone(), programId: course.id, status: "active" });

    const first = await createTestUser();
    const second = await createTestUser();
    const firstClient = await signedInClient(first.phone, first.password);
    const secondClient = await signedInClient(second.phone, second.password);

    const taken = await enroll(firstClient, { programId: course.id, payMethod: "bank" });
    expect(taken.status).toBe(200);

    const tooLate = await enroll(secondClient, { programId: course.id, payMethod: "bank" });
    expect(tooLate.status).toBe(409);
  });

  /**
   * A student's own held seat must not count against them — see BUGS.md #4,
   * fixed by excluding their row from the seat count.
   */
  it("lets a student who already holds a seat resume their own payment", async () => {
    const course = await createTestCourse({ capacity: 1 });
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const first = await enroll(client, { programId: course.id, payMethod: "qpay" });
    expect(first.status).toBe(200);

    // Same student, same course — reopening the payment modal.
    const resume = await enroll(client, { programId: course.id, payMethod: "qpay" });
    expect(resume.status).toBe(200);
  });
});

describe("one attempt, one invoice", () => {
  it("hands back the same invoice instead of issuing a second one", async () => {
    const course = await createTestCourse();
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const first = await enroll(client, { programId: course.id, payMethod: "qpay" });
    expect(first.status).toBe(200);
    const registrationId = first.body.registration!.id;
    const invoiceCount = (await listMockInvoices()).length;

    const second = await enroll(client, { programId: course.id, payMethod: "qpay" });

    expect(second.status).toBe(200);
    expect(second.body.registration!.id).toBe(registrationId);
    expect(second.body.shortUrl).toBe(first.body.shortUrl);
    // A second invoice would mean a second sender_invoice_no burned for one
    // registration — and QPay never lets the first one be reused.
    expect((await listMockInvoices()).length).toBe(invoiceCount);
  });

  it("refuses to enrol twice once the registration is active", async () => {
    const course = await createTestCourse();
    const student = await createTestUser();
    await createTestRegistration({
      userId: student.id,
      programId: course.id,
      status: "active",
      payMethod: "qpay",
    });

    const client = await signedInClient(student.phone, student.password);
    const res = await enroll(client, { programId: course.id, payMethod: "qpay" });
    expect(res.status).toBe(409);
  });

  it("gives a fresh attempt its own sender_invoice_no after a cancellation", async () => {
    const course = await createTestCourse();
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const first = await enroll(client, { programId: course.id, payMethod: "qpay" });
    const firstId = first.body.registration!.id;

    const cancelled = await client.post(`/api/enroll/${firstId}/cancel`);
    expect(cancelled.status).toBe(200);

    const second = await enroll(client, { programId: course.id, payMethod: "qpay" });
    expect(second.status).toBe(200);
    const secondId = second.body.registration!.id;

    expect(secondId).not.toBe(firstId);
    expect(senderInvoiceNoForRegistration(secondId)).not.toBe(
      senderInvoiceNoForRegistration(firstId)
    );
    // The second invoice really was issued — which it could not have been if
    // the app had reused the first number, since the mock rejects that the
    // same way QPay does.
    expect(await findMockInvoice(senderInvoiceNoForRegistration(secondId))).not.toBeNull();
  });
});

describe("bank transfers", () => {
  it("creates a pending registration and contacts QPay not at all", async () => {
    const course = await createTestCourse({ price: "200,000₮" });
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const before = (await listMockInvoices()).length;
    const res = await enroll(client, { programId: course.id, payMethod: "bank" });

    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(false);
    expect(res.body.registration!.status).toBe("pending");
    expect((await listMockInvoices()).length).toBe(before);
  });

  /**
   * The expensive one. A parent opened the bank-transfer option (which creates
   * the row), then changed their mind and paid the QR. /api/enroll reused the
   * row and attached the invoice but left pay_method reading "bank", and every
   * settle path — including QPay's own callback — skipped rows that did not say
   * "qpay". QPay collected 1,200,000₮ and the registration sat pending with
   * nothing anywhere to notice.
   */
  it("switching from bank to QPay leaves the row payable, and payable rows settle", async () => {
    const course = await createTestCourse({ price: "1,200,000₮" });
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const bank = await enroll(client, { programId: course.id, payMethod: "bank" });
    const registrationId = bank.body.registration!.id;
    expect(bank.status).toBe(200);

    const qpay = await enroll(client, { programId: course.id, payMethod: "qpay" });
    expect(qpay.status).toBe(200);
    // Same row — that reuse is deliberate, since one attempt must not end up
    // with two invoices.
    expect(qpay.body.registration!.id).toBe(registrationId);

    const attached = await readRegistration(registrationId);
    expect(attached?.qpay_invoice_id).toBeTruthy();
    expect(attached?.pay_method).toBe("qpay");

    const invoice = await findMockInvoice(senderInvoiceNoForRegistration(registrationId));
    await payMockInvoice(invoice!.invoiceId);
    const check = await client.post<{ paid: boolean }>(`/api/enroll/${registrationId}/check`);

    expect(check.body.paid).toBe(true);
    expect((await readRegistration(registrationId))?.status).toBe("active");
  });

  it("does not hand out the Facebook group before an admin confirms", async () => {
    const course = await createTestCourse();
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const res = await enroll(client, { programId: course.id, payMethod: "bank" });
    expect(res.status).toBe(200);
    expect((res.body as { facebookGroup?: string }).facebookGroup).toBeUndefined();
  });
});

describe("POST /api/enroll/[id]/cancel", () => {
  it("refuses a signed-out visitor", async () => {
    const res = await anonClient().post(`/api/enroll/${randomUUID()}/cancel`);
    expect(res.status).toBe(401);
  });

  it("refuses to cancel another student's registration", async () => {
    const course = await createTestCourse();
    const owner = await createTestUser();
    const registration = await createTestRegistration({
      userId: owner.id,
      programId: course.id,
      status: "pending",
    });

    const stranger = await createTestUser();
    const client = await signedInClient(stranger.phone, stranger.password);
    const res = await client.post(`/api/enroll/${registration.id}/cancel`);

    expect(res.status).toBe(404);
    expect(await readRegistration(registration.id)).not.toBeNull();
  });

  it("refuses to cancel a registration that is already active", async () => {
    const course = await createTestCourse();
    const student = await createTestUser();
    const registration = await createTestRegistration({
      userId: student.id,
      programId: course.id,
      status: "active",
    });

    const client = await signedInClient(student.phone, student.password);
    const res = await client.post(`/api/enroll/${registration.id}/cancel`);

    expect(res.status).toBe(409);
    expect(await readRegistration(registration.id)).not.toBeNull();
  });

  it("does not delete a registration whose payment landed a moment ago", async () => {
    const course = await createTestCourse();
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);

    const created = await enroll(client, { programId: course.id, payMethod: "qpay" });
    const registrationId = created.body.registration!.id;
    const invoice = await findMockInvoice(senderInvoiceNoForRegistration(registrationId));

    // The student pays, then clicks "cancel" before the page catches up.
    await payMockInvoice(invoice!.invoiceId);
    const res = await client.post<{ paid: boolean }>(`/api/enroll/${registrationId}/cancel`);

    // QPay's record of a paid invoice wins over the cancel click.
    expect(res.status).toBe(409);
    expect(res.body.paid).toBe(true);
    const row = await readRegistration(registrationId);
    expect(row).not.toBeNull();
    expect(row?.status).toBe("active");
  });
});
