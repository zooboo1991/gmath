/**
 * Үлдэгдлээ сурагч өөрөө төлөх — POST /api/enroll/[id]/balance.
 *
 * Мөнгө хөдөлж байгаа тул асуултууд ижил: сурагч өөрийн оруулсан дүнгээр
 * системийг хуурч чадах уу, өөр хүний бүртгэл дээр ажиллаж чадах уу, нэг
 * төлөлт хоёр удаа бүртгэгдэх үү.
 */

import { afterAll, describe, expect, it } from "vitest";
import { anonClient, signedInClient, TestClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import {
  createTestCourse,
  createTestRegistration,
  createTestUser,
  trackNotificationsForCreatedUsers,
} from "../../support/factories";
import { findMockInvoice, payMockInvoice } from "../../support/mockControl";

afterAll(async () => {
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
});

/** Санаархлын sender_invoice_no — серверийнхтэй ижил дүрэм. */
function senderInvoiceNoForIntent(intentId: string): string {
  return `gm-i-${intentId.replace(/-/g, "")}`;
}

type BalanceResponse = {
  error?: string;
  paid?: boolean;
  method?: string;
  intent?: { id: string; amount: number; qpayQrImage?: string };
};

/** Хагасаа төлсөн, 600,000₮ үлдэгдэлтэй сурагч. */
async function studentWithBalance(totalDue = 1_200_000, alreadyPaid = 600_000) {
  const course = await createTestCourse({ price: "1,200,000₮" });
  const student = await createTestUser();
  const registration = await createTestRegistration({
    userId: student.id,
    programId: course.id,
    price: "1,200,000₮",
    payMethod: "qpay",
    status: "active",
  });
  await testDb()
    .from("registrations")
    .update({ total_due: totalDue, installment_due_date: "2026-09-30" })
    .eq("id", registration.id);
  if (alreadyPaid > 0) {
    const { data } = await testDb()
      .from("registration_payments")
      .insert({ registration_id: registration.id, amount: alreadyPaid, paid_at: "2026-08-20" })
      .select("id")
      .single();
    track("registration_payments", (data as { id: string }).id);
  }
  const client = await signedInClient(student.phone, student.password);
  return { course, student, registrationId: registration.id, client };
}

async function intentsOf(registrationId: string) {
  const { data } = await testDb()
    .from("registration_payment_intents")
    .select("id, amount, method, status")
    .eq("registration_id", registrationId);
  const rows = (data ?? []) as { id: string; amount: number; method: string; status: string }[];
  for (const row of rows) track("registration_payment_intents", row.id);
  return rows;
}

async function paymentsOf(registrationId: string) {
  const { data } = await testDb()
    .from("registration_payments")
    .select("id, amount")
    .eq("registration_id", registrationId);
  const rows = (data ?? []) as { id: string; amount: number }[];
  for (const row of rows) track("registration_payments", row.id);
  return rows.map((r) => r.amount).sort((a, b) => a - b);
}

async function pay(client: TestClient, id: string, body: Record<string, unknown>) {
  const res = await client.post<BalanceResponse>(`/api/enroll/${id}/balance`, body);
  if (res.body?.intent?.id) track("registration_payment_intents", res.body.intent.id);
  return res;
}

describe("хандах эрх", () => {
  it("нэвтрээгүй зочныг няцаана", async () => {
    const { registrationId } = await studentWithBalance();
    const res = await anonClient().post(`/api/enroll/${registrationId}/balance`, {
      amount: 600_000,
      method: "qpay",
    });
    expect(res.status).toBe(401);
  });

  it("өөр хүний бүртгэлийг олдсонгүй гэнэ", async () => {
    const { registrationId } = await studentWithBalance();
    const outsider = await createTestUser();
    const client = await signedInClient(outsider.phone, outsider.password);

    const res = await pay(client, registrationId, { amount: 600_000, method: "qpay" });

    // 403 биш 404: ямар бүртгэл байгааг мэдэгдэхгүй.
    expect(res.status).toBe(404);
    expect(await intentsOf(registrationId)).toEqual([]);
  });

  it("төлөвлөгөө тавиагүй бүртгэл дээр татгалзана", async () => {
    const course = await createTestCourse();
    const student = await createTestUser();
    const registration = await createTestRegistration({
      userId: student.id,
      programId: course.id,
      status: "active",
    });
    const client = await signedInClient(student.phone, student.password);

    const res = await pay(client, registration.id, { amount: 600_000, method: "qpay" });

    // Ийм бүртгэлийг систем бүтэн төлөгдсөнд тооцдог тул үлдэгдэл гэж юу
    // болохыг мэдэхгүй.
    expect(res.status).toBe(409);
  });
});

describe("дүнгийн шалгалт", () => {
  it("үлдэгдлээс их дүнг татгалзана", async () => {
    const { registrationId, client } = await studentWithBalance();
    const res = await pay(client, registrationId, { amount: 700_000, method: "qpay" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Үлдэгдлээс их");
    expect(await intentsOf(registrationId)).toEqual([]);
  });

  it("хамгийн бага дүнгээс доошийг татгалзана", async () => {
    const { registrationId, client } = await studentWithBalance();
    expect((await pay(client, registrationId, { amount: 49_999, method: "qpay" })).status).toBe(400);
    expect((await pay(client, registrationId, { amount: 0, method: "qpay" })).status).toBe(400);
  });

  it("сөрөг ба бутархай дүнг татгалзана", async () => {
    // parsePriceToNumber нь "-5"-ыг 5 болгодог тул оролт дээр хэрэглэдэггүй.
    const { registrationId, client } = await studentWithBalance();
    for (const amount of [-600_000, 600_000.5, NaN, "600000"]) {
      const res = await pay(client, registrationId, { amount, method: "qpay" });
      expect(res.status, String(amount)).toBe(400);
    }
    expect(await intentsOf(registrationId)).toEqual([]);
  });

  it("бүрэн төлөгдсөн бүртгэл дээр татгалзана", async () => {
    const { registrationId, client } = await studentWithBalance(1_200_000, 1_200_000);
    const res = await pay(client, registrationId, { amount: 600_000, method: "qpay" });
    expect(res.status).toBe(409);
  });
});

describe("QPay-ээр үлдэгдэл төлөх", () => {
  it("нэхэмжлэх үүсгэж, төлөгдмөгц дэвтэрт бичнэ", async () => {
    const { registrationId, client } = await studentWithBalance();

    const started = await pay(client, registrationId, { amount: 600_000, method: "qpay" });
    expect(started.status, started.text).toBe(200);
    const intentId = started.body.intent!.id;

    // Нэхэмжлэхийн дугаар нь САНААРХЛААС гардаг — бүртгэлийн id-гаас биш.
    // Ингэснээр нэг бүртгэлийг олон удаа нэхэмжилж болно.
    const invoice = await findMockInvoice(senderInvoiceNoForIntent(intentId));
    expect(invoice).toBeTruthy();
    expect(invoice!.amount).toBe(600_000);

    await payMockInvoice(invoice!.invoiceId);
    const checked = await client.post<{ paid: boolean; balance: number }>(
      `/api/enroll/${registrationId}/balance/${intentId}/check`
    );

    expect(checked.body.paid).toBe(true);
    expect(checked.body.balance).toBe(0);
    expect(await paymentsOf(registrationId)).toEqual([600_000, 600_000]);
  });

  it("хоёр удаа шалгахад төлбөр давхардахгүй", async () => {
    const { registrationId, client } = await studentWithBalance();
    const started = await pay(client, registrationId, { amount: 600_000, method: "qpay" });
    const intentId = started.body.intent!.id;
    const invoice = await findMockInvoice(senderInvoiceNoForIntent(intentId));
    await payMockInvoice(invoice!.invoiceId);

    // Callback болон сурагчийн poll зэрэг ирж болно.
    const [a, b] = await Promise.all([
      client.post<{ paid: boolean }>(`/api/enroll/${registrationId}/balance/${intentId}/check`),
      client.post<{ paid: boolean }>(`/api/enroll/${registrationId}/balance/${intentId}/check`),
    ]);
    expect([a.body.paid, b.body.paid]).toEqual([true, true]);

    // Нөхцөлт UPDATE-ийн ачаар дэвтэрт нэг л мөр нэмэгдсэн.
    expect(await paymentsOf(registrationId)).toEqual([600_000, 600_000]);
  });

  it("ижил дүнгээр дахин дарахад тэр л нэхэмжлэхийг буцаана", async () => {
    const { registrationId, client } = await studentWithBalance();
    const first = await pay(client, registrationId, { amount: 600_000, method: "qpay" });
    const second = await pay(client, registrationId, { amount: 600_000, method: "qpay" });

    expect(second.body.intent!.id).toBe(first.body.intent!.id);
    // Хоёр амьд нэхэмжлэх байвал гэр бүл хоёуланг нь төлж болно.
    const open = (await intentsOf(registrationId)).filter(
      (i) => i.method === "qpay" && i.status === "pending"
    );
    expect(open.length).toBe(1);
  });

  it("өөр дүнгээр дарахад хуучныг цуцалж шинийг үүсгэнэ", async () => {
    const { registrationId, client } = await studentWithBalance();
    const first = await pay(client, registrationId, { amount: 600_000, method: "qpay" });
    const second = await pay(client, registrationId, { amount: 300_000, method: "qpay" });

    expect(second.body.intent!.id).not.toBe(first.body.intent!.id);
    const rows = await intentsOf(registrationId);
    expect(rows.find((r) => r.id === first.body.intent!.id)!.status).toBe("cancelled");
    expect(rows.filter((r) => r.status === "pending").length).toBe(1);
  });

  it("өөр хүний санаархлыг шалгаж чадахгүй", async () => {
    const a = await studentWithBalance();
    const b = await studentWithBalance();
    const started = await pay(a.client, a.registrationId, { amount: 600_000, method: "qpay" });

    // B-ийн бүртгэлийн id-гаар A-ийн санаархлыг барагдуулах оролдлого.
    const res = await b.client.post(
      `/api/enroll/${b.registrationId}/balance/${started.body.intent!.id}/check`
    );
    expect(res.status).toBe(404);
  });
});

describe("дансаар үлдэгдэл төлөх", () => {
  it("санаархал үүсгэнэ, гэхдээ төлбөрийн мөр бичихгүй", async () => {
    const { registrationId, client } = await studentWithBalance();

    const res = await pay(client, registrationId, { amount: 600_000, method: "bank" });

    expect(res.status, res.text).toBe(200);
    expect(res.body.method).toBe("bank");
    const rows = await intentsOf(registrationId);
    expect(rows.filter((r) => r.method === "bank" && r.status === "pending").length).toBe(1);
    // Сурагчийн "төлсөн" гэсэн үгээр үлдэгдэл ХЭЗЭЭ Ч хасагдахгүй.
    expect(await paymentsOf(registrationId)).toEqual([600_000]);
  });

  it("QPay нэхэмжлэх үүсгэхгүй", async () => {
    const { registrationId, client } = await studentWithBalance();
    const res = await pay(client, registrationId, { amount: 600_000, method: "bank" });
    expect(res.body.intent).toBeTruthy();
    expect(await findMockInvoice(senderInvoiceNoForIntent(res.body.intent!.id))).toBeNull();
  });
});
