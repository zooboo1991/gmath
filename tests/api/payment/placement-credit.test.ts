/**
 * Түвшин тогтоох 20,000₮ нь сургалтын эхний төлөлтөөс хасагдах нь.
 *
 * Мөнгөний дүрэм тул асуулт нь хатуу: нэхэмжлэх яг хэдэн төгрөгөөр гарав,
 * хөнгөлөлт хоёр удаа орж чадах уу, хаана орохгүй ёстой вэ.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { signedInClient, TestClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import {
  createTestCourse,
  createTestUser,
  trackNotificationsForCreatedUsers,
} from "../../support/factories";
import {
  findMockInvoice,
  payMockInvoice,
  senderInvoiceNoForPlacement,
  senderInvoiceNoForRegistration,
} from "../../support/mockControl";

afterAll(async () => {
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
});

const NEXT_PAYMENT = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

type Days = { days: { date: string; slots: string[] }[] };
type BookingBody = { booking: { id: string; paid: boolean } };
type EnrollResponse = {
  error?: string;
  registration?: { id: string };
  amountDue?: number;
  placementCredit?: number;
};

/** Захиалгын цаг гарахын тулд сонгоны анги хуваарьтай байх ёстой. */
async function songonClass(schedule: string) {
  const { data, error } = await testDb()
    .from("courses")
    .insert({
      kind: "upcoming",
      tag: "ТАНХИМ",
      title: `Сонгон хөнгөлөлт ${randomUUID().slice(0, 8)}`,
      topics: "Туршилт",
      price: "1,200,000₮",
      period: "/ улирал",
      status: "published",
      template: "songon",
      weekly_schedule: schedule,
    })
    .select("id")
    .single();
  if (error) throw new Error(`songon seed failed: ${error.message}`);
  track("courses", (data as { id: string }).id);
}

/** Цаг захиалж, 20,000₮-ээ төлнө — хөнгөлөлт эндээс үүснэ. */
async function payPlacement(client: TestClient) {
  const days = (await client.get<Days>("/api/placement-booking")).body.days;
  const made = await client.post<BookingBody>("/api/placement-booking", {
    date: days[0].date,
    slot: days[0].slots[0],
  });
  if (made.status !== 200) throw new Error(`booking failed: ${made.text}`);
  track("placement_bookings", made.body.booking.id);

  const invoice = await findMockInvoice(senderInvoiceNoForPlacement(made.body.booking.id));
  if (!invoice) throw new Error("placement invoice missing");
  expect(invoice.amount).toBe(20000);
  await payMockInvoice(invoice.invoiceId);
  // Серверт "төлөгдсөн"-ийг мэдэгдэнэ — webhook-ийн оронд.
  await client.get("/api/placement-booking");
  return made.body.booking.id;
}

async function enroll(client: TestClient, body: Record<string, unknown>) {
  const res = await client.post<EnrollResponse>("/api/enroll", body);
  if (res.body?.registration?.id) track("registrations", res.body.registration.id);
  return res;
}

describe("түвшин тогтоох төлбөр сургалтаас хасагдах", () => {
  it("хувааж төлөхөд урьдчилгаа 580,000₮ болно", async () => {
    await songonClass("Даваа 10:30–12:30");
    const course = await createTestCourse({ price: "1,200,000₮", template: "songon" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    await payPlacement(client);

    const res = await enroll(client, {
      programId: course.id,
      payMethod: "qpay",
      plan: "split",
      nextPaymentDate: NEXT_PAYMENT,
    });
    expect(res.status, res.text).toBe(200);
    expect(res.body.amountDue).toBe(580_000);
    expect(res.body.placementCredit).toBe(20_000);

    // Дэлгэц дээрх тоо биш, QPay-д очсон нэхэмжлэх нь мөнгө.
    const invoice = await findMockInvoice(senderInvoiceNoForRegistration(res.body.registration!.id));
    expect(invoice?.amount).toBe(580_000);

    // Нийт төлөх дүн 1,200,000 хэвээр, хөнгөлөлт нь тусдаа баганад.
    const { data } = await testDb()
      .from("registrations")
      .select("total_due, placement_credit")
      .eq("id", res.body.registration!.id)
      .single();
    expect((data as { total_due: number }).total_due).toBe(1_200_000);
    expect((data as { placement_credit: number }).placement_credit).toBe(20_000);
  });

  it("бүтнээр төлөхөд 1,180,000₮ нэхэмжилнэ", async () => {
    await songonClass("Даваа 10:30–12:30");
    const course = await createTestCourse({ price: "1,200,000₮", template: "songon" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    await payPlacement(client);

    const res = await enroll(client, { programId: course.id, payMethod: "qpay", plan: "full" });
    expect(res.status, res.text).toBe(200);
    expect(res.body.amountDue).toBe(1_180_000);

    const invoice = await findMockInvoice(senderInvoiceNoForRegistration(res.body.registration!.id));
    expect(invoice?.amount).toBe(1_180_000);
  });

  it("хөнгөлөлт нэг л удаа ордог", async () => {
    await songonClass("Даваа 10:30–12:30");
    const first = await createTestCourse({ price: "1,200,000₮", template: "songon" });
    const second = await createTestCourse({ price: "1,200,000₮", template: "songon" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    await payPlacement(client);

    const one = await enroll(client, { programId: first.id, payMethod: "qpay", plan: "full" });
    expect(one.body.amountDue).toBe(1_180_000);

    // Эхний бүртгэлд нэхэмжлэх үүссэн тул хөнгөлөлт тэндээ үлдэнэ —
    // хоёр дахь анги бүтэн үнээрээ.
    const two = await enroll(client, { programId: second.id, payMethod: "qpay", plan: "full" });
    expect(two.status, two.text).toBe(200);
    expect(two.body.amountDue).toBe(1_200_000);
    expect(two.body.placementCredit).toBe(0);
  });

  it("төлөөгүй бол хөнгөлөлт байхгүй", async () => {
    await songonClass("Даваа 10:30–12:30");
    const course = await createTestCourse({ price: "1,200,000₮", template: "songon" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    // Цагаа захиалсан ч төлөөгүй.
    const days = (await client.get<Days>("/api/placement-booking")).body.days;
    const made = await client.post<BookingBody>("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[0],
    });
    track("placement_bookings", made.body.booking.id);

    const res = await enroll(client, { programId: course.id, payMethod: "qpay", plan: "full" });
    expect(res.body.amountDue).toBe(1_200_000);
    expect(res.body.placementCredit).toBe(0);
  });

  it("сонгоны анги биш сургалтад хөнгөлөлт орохгүй", async () => {
    await songonClass("Даваа 10:30–12:30");
    const course = await createTestCourse({ price: "350,000₮" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    await payPlacement(client);

    const res = await enroll(client, { programId: course.id, payMethod: "qpay", plan: "full" });
    expect(res.status, res.text).toBe(200);
    expect(res.body.amountDue).toBe(350_000);
    expect(res.body.placementCredit).toBe(0);
  });

  it("цагаа болиулсан ч хөнгөлөлт хэвээр үлдэнэ", async () => {
    await songonClass("Даваа 10:30–12:30");
    const course = await createTestCourse({ price: "1,200,000₮", template: "songon" });
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    const bookingId = await payPlacement(client);

    const cancelled = await client.del("/api/placement-booking", { id: bookingId });
    expect(cancelled.status, cancelled.text).toBe(200);

    const res = await enroll(client, { programId: course.id, payMethod: "qpay", plan: "full" });
    expect(res.body.amountDue).toBe(1_180_000);
  });
});
