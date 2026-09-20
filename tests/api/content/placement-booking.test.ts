/**
 * Танхимд ирж түвшин тогтоолгох цаг захиалах.
 *
 * Гол амлалтууд: цагийн жагсаалт нь ангиудын хуваариас гардаг, хуваарьт
 * байхгүй цаг захиалагдахгүй, нэг хүүхэд нэг л цагтай, өөр хүний цагийг
 * болиулж болохгүй, багш жагсаалтыг харж тэмдэглэнэ.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, anonClient, signedInClient, staffClient } from "../../support/client";
import { createTestUser } from "../../support/factories";
import { cleanupTracked, testDb, track } from "../../support/db";
import { findMockInvoice, payMockInvoice, senderInvoiceNoForPlacement } from "../../support/mockControl";

const staffAccounts: string[] = [];

afterAll(async () => {
  for (const id of staffAccounts) await testDb().from("admin_users").delete().eq("id", id);
  await cleanupTracked();
});

type Days = { days: { date: string; day: string; label: string; slots: string[] }[] };
type BookingBody = {
  booking: { id: string; bookedDate: string; slot: string; feeAmount: number; paid: boolean };
};

/** "Эцэг эх QR-аа уншуулж төлөв" — дараа нь сервер өөрөө шалгана. */
async function payFor(bookingId: string) {
  const invoice = await findMockInvoice(senderInvoiceNoForPlacement(bookingId));
  if (!invoice) throw new Error(`placement invoice missing for ${bookingId}`);
  await payMockInvoice(invoice.invoiceId);
  return invoice;
}

/** Сонгоны анги байхгүй орчинд цаг гарахгүй тул нэгийг үүсгэнэ. */
async function songonClass(schedule: string) {
  const { data, error } = await testDb()
    .from("courses")
    .insert({
      kind: "upcoming",
      tag: "ТАНХИМ",
      title: `Сонгон тест ${randomUUID().slice(0, 8)}`,
      topics: "Туршилт",
      price: "1,200,000₮",
      period: "/ улирал",
      status: "published",
      template: "songon",
      weekly_schedule: schedule,
      capacity: 15,
    })
    .select("id")
    .single();
  if (error) throw new Error(`songon seed failed: ${error.message}`);
  const id = (data as { id: string }).id;
  track("courses", id);
  return id;
}

async function booker() {
  const user = await createTestUser();
  const client = await signedInClient(user.phone, user.password);
  return { user, client };
}

describe("түвшин тогтоох цаг санал болгох", () => {
  it("хуваарийг нэг цагийн нүд болгож хуваана", async () => {
    await songonClass("Даваа 10:30–12:30\nБаасан 09:00–11:00");

    const res = await anonClient().get<Days>("/api/placement-booking");
    expect(res.status, res.text).toBe(200);

    const monday = res.body.days.find((one) => one.day === "Даваа");
    expect(monday?.slots).toEqual(expect.arrayContaining(["10:30–11:30", "11:30–12:30"]));
    const friday = res.body.days.find((one) => one.day === "Баасан");
    expect(friday?.slots).toEqual(expect.arrayContaining(["09:00–10:00", "10:00–11:00"]));
    // Бүтэн цаг багтахгүй үлдэгдэл хаягдана: 10:30–12:30 нь хоёр нүд, гурав биш.
    expect(monday?.slots.filter((s) => s.startsWith("10:30") || s.startsWith("11:30"))).toHaveLength(2);
  });

  it("зөвхөн ирээдүйн өдрүүд гарна", async () => {
    await songonClass("Даваа 10:30–12:30");
    const res = await anonClient().get<Days>("/api/placement-booking");
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const one of res.body.days) {
      expect(one.date > today, `${one.date} нь ${today}-аас хойш байх ёстой`).toBe(true);
    }
  });
});

describe("цаг захиалах", () => {
  it("нэвтрээгүй хүн захиалж чадахгүй", async () => {
    await songonClass("Даваа 10:30–12:30");
    const days = (await anonClient().get<Days>("/api/placement-booking")).body.days;
    const res = await anonClient().post("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[0],
    });
    expect(res.status).toBe(401);
  });

  it("хуваарьт байхгүй цагийг татгалзана", async () => {
    await songonClass("Даваа 10:30–12:30");
    const { client } = await booker();
    const days = (await client.get<Days>("/api/placement-booking")).body.days;

    // Зөв өдөр, буруу цаг.
    const wrongSlot = await client.post("/api/placement-booking", {
      date: days[0].date,
      slot: "03:00–04:00",
    });
    expect(wrongSlot.status, wrongSlot.text).toBe(400);

    // Зөв цаг, хуваарьт байхгүй өдөр (хол ирээдүй).
    const wrongDay = await client.post("/api/placement-booking", {
      date: "2030-01-01",
      slot: days[0].slots[0],
    });
    expect(wrongDay.status).toBe(400);
  });

  it("төлөх хүртэл захиалга баталгаажихгүй", async () => {
    await songonClass("Даваа 10:30–12:30");
    const { user, client } = await booker();
    const days = (await client.get<Days>("/api/placement-booking")).body.days;
    const pick = { date: days[0].date, slot: days[0].slots[0] };

    const res = await client.post<BookingBody>("/api/placement-booking", pick);
    expect(res.status, res.text).toBe(200);
    track("placement_bookings", res.body.booking.id);
    expect(res.body.booking.paid).toBe(false);
    expect(res.body.booking.feeAmount).toBe(20000);

    const { data: before } = await testDb()
      .from("placement_bookings")
      .select("user_id, status, paid_at, fee_amount")
      .eq("id", res.body.booking.id)
      .single();
    expect((before as { user_id: string }).user_id).toBe(user.id);
    expect((before as { status: string }).status).toBe("awaiting_payment");
    expect((before as { paid_at: string | null }).paid_at).toBeNull();

    // Нэхэмжлэх нь яг 20,000₮.
    const invoice = await payFor(res.body.booking.id);
    expect(invoice.amount).toBe(20000);

    const again = await client.get<{ booking: { bookedDate: string; slot: string; paid: boolean } | null }>(
      "/api/placement-booking"
    );
    expect(again.body.booking?.paid).toBe(true);
    expect(again.body.booking?.bookedDate).toBe(pick.date);
    expect(again.body.booking?.slot).toBe(pick.slot);

    const { data: after } = await testDb()
      .from("placement_bookings")
      .select("status")
      .eq("id", res.body.booking.id)
      .single();
    expect((after as { status: string }).status).toBe("booked");
  });

  it("ижил цагийг дахин сонгоход шинэ нэхэмжлэх үүсгэхгүй", async () => {
    await songonClass("Даваа 10:30–12:30");
    const { client } = await booker();
    const days = (await client.get<Days>("/api/placement-booking")).body.days;
    const pick = { date: days[0].date, slot: days[0].slots[0] };

    const first = await client.post<BookingBody>("/api/placement-booking", pick);
    track("placement_bookings", first.body.booking.id);
    const second = await client.post<BookingBody>("/api/placement-booking", pick);
    expect(second.status, second.text).toBe(200);
    // QPay-ийн sender_invoice_no дахин ашиглагдаж болохгүй тул мөр нь ч нэг.
    expect(second.body.booking.id).toBe(first.body.booking.id);
  });

  it("төлсөн хүн хоёр цаг барьж чадахгүй", async () => {
    await songonClass("Даваа 10:30–12:30");
    const { client } = await booker();
    const days = (await client.get<Days>("/api/placement-booking")).body.days;

    const first = await client.post<BookingBody>("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[0],
    });
    expect(first.status, first.text).toBe(200);
    track("placement_bookings", first.body.booking.id);
    await payFor(first.body.booking.id);
    await client.get("/api/placement-booking");

    const second = await client.post("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[1] ?? days[0].slots[0],
    });
    expect(second.status).toBe(409);
  });

  it("төлөхөөсөө өмнө өөр цаг сонгож болно", async () => {
    await songonClass("Даваа 10:30–12:30");
    const { client } = await booker();
    const days = (await client.get<Days>("/api/placement-booking")).body.days;

    const first = await client.post<BookingBody>("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[0],
    });
    track("placement_bookings", first.body.booking.id);

    const second = await client.post<BookingBody>("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[1],
    });
    expect(second.status, second.text).toBe(200);
    track("placement_bookings", second.body.booking.id);
    expect(second.body.booking.slot).toBe(days[0].slots[1]);

    // Хуучин мөр нь болисон — нэг хүн нэг идэвхтэй захиалгатай.
    const { data } = await testDb()
      .from("placement_bookings")
      .select("status")
      .eq("id", first.body.booking.id)
      .single();
    expect((data as { status: string }).status).toBe("cancelled");
  });

  it("болисны дараа дахин захиалж болно", async () => {
    await songonClass("Даваа 10:30–12:30");
    const { client } = await booker();
    const days = (await client.get<Days>("/api/placement-booking")).body.days;

    const first = await client.post<{ booking: { id: string } }>("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[0],
    });
    track("placement_bookings", first.body.booking.id);

    await payFor(first.body.booking.id);
    await client.get("/api/placement-booking");
    const cancelled = await client.del(`/api/placement-booking`, { id: first.body.booking.id });
    expect(cancelled.status, cancelled.text).toBe(200);

    const again = await client.post<{ booking: { id: string } }>("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[0],
    });
    expect(again.status, again.text).toBe(200);
    track("placement_bookings", again.body.booking.id);
  });

  it("өөр хүний цагийг болиулж чадахгүй", async () => {
    await songonClass("Даваа 10:30–12:30");
    const owner = await booker();
    const stranger = await booker();
    const days = (await owner.client.get<Days>("/api/placement-booking")).body.days;

    const mine = await owner.client.post<BookingBody>("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[0],
    });
    track("placement_bookings", mine.body.booking.id);
    await payFor(mine.body.booking.id);
    await owner.client.get("/api/placement-booking");

    const res = await stranger.client.del("/api/placement-booking", { id: mine.body.booking.id });
    expect(res.status).toBe(404);

    // Мөр хэвээрээ.
    const { data } = await testDb()
      .from("placement_bookings")
      .select("status")
      .eq("id", mine.body.booking.id)
      .single();
    expect((data as { status: string }).status).toBe("booked");
  });
});

describe("багшийн жагсаалт", () => {
  it("багш ирсэн гэж тэмдэглэж чадна", async () => {
    await songonClass("Даваа 10:30–12:30");
    const { client } = await booker();
    const days = (await client.get<Days>("/api/placement-booking")).body.days;
    const made = await client.post<BookingBody>("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[0],
    });
    track("placement_bookings", made.body.booking.id);
    await payFor(made.body.booking.id);
    await client.get("/api/placement-booking");

    const owner = await adminClient("full");
    const { client: teacher, id } = await staffClient(owner, {
      name: "Тест багш",
      username: `booking-teacher-${randomUUID().slice(0, 8)}`,
      password: "TeacherPass-2026",
      role: "teacher",
    });
    staffAccounts.push(id);

    const res = await teacher.put(`/api/admin/placement-bookings/${made.body.booking.id}`, {
      status: "came",
    });
    expect(res.status, res.text).toBe(200);

    const { data } = await testDb()
      .from("placement_bookings")
      .select("status")
      .eq("id", made.body.booking.id)
      .single();
    expect((data as { status: string }).status).toBe("came");
  });

  it("нэвтрээгүй хүн тэмдэглэж чадахгүй", async () => {
    const res = await anonClient().put(
      "/api/admin/placement-bookings/00000000-0000-4000-8000-000000000000",
      { status: "came" }
    );
    expect(res.status).toBe(401);
  });
});
