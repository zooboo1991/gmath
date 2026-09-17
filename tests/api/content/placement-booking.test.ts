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

const staffAccounts: string[] = [];

afterAll(async () => {
  for (const id of staffAccounts) await testDb().from("admin_users").delete().eq("id", id);
  await cleanupTracked();
});

type Days = { days: { date: string; day: string; label: string; slots: string[] }[] };

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

  it("захиалсан цаг хадгалагдаж, дахин харагдана", async () => {
    await songonClass("Даваа 10:30–12:30");
    const { user, client } = await booker();
    const days = (await client.get<Days>("/api/placement-booking")).body.days;
    const pick = { date: days[0].date, slot: days[0].slots[0] };

    const res = await client.post<{ booking: { id: string } }>("/api/placement-booking", pick);
    expect(res.status, res.text).toBe(200);
    track("placement_bookings", res.body.booking.id);

    const again = await client.get<{ booking: { bookedDate: string; slot: string } | null }>(
      "/api/placement-booking"
    );
    expect(again.body.booking?.bookedDate).toBe(pick.date);
    expect(again.body.booking?.slot).toBe(pick.slot);

    const { data } = await testDb()
      .from("placement_bookings")
      .select("user_id, status")
      .eq("id", res.body.booking.id)
      .single();
    expect((data as { user_id: string; status: string }).user_id).toBe(user.id);
    expect((data as { status: string }).status).toBe("booked");
  });

  it("нэг хүүхэд хоёр цаг барьж чадахгүй", async () => {
    await songonClass("Даваа 10:30–12:30");
    const { client } = await booker();
    const days = (await client.get<Days>("/api/placement-booking")).body.days;

    const first = await client.post<{ booking: { id: string } }>("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[0],
    });
    expect(first.status, first.text).toBe(200);
    track("placement_bookings", first.body.booking.id);

    const second = await client.post("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[1] ?? days[0].slots[0],
    });
    expect(second.status).toBe(409);
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

    const mine = await owner.client.post<{ booking: { id: string } }>("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[0],
    });
    track("placement_bookings", mine.body.booking.id);

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
    const made = await client.post<{ booking: { id: string } }>("/api/placement-booking", {
      date: days[0].date,
      slot: days[0].slots[0],
    });
    track("placement_bookings", made.body.booking.id);

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
