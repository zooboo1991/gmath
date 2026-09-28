/**
 * Багштай хийх ганцаарчилсан уулзалтын цаг.
 *
 * Гол амлалтууд: зөвхөн 1 жилийн хөтөлбөрийн сурагч захиална, нээгээгүй
 * өдөрт цаг байхгүй, нэг цагийг нэг л гэр бүл авна, нэг хүүхэд нэг л
 * уулзалттай, өөр хүний цагийг болиулж болохгүй, багш жагсаалтыг харж
 * тэмдэглэнэ.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, anonClient, signedInClient, staffClient, TestClient } from "../../support/client";
import { createTestRegistration, createTestUser } from "../../support/factories";
import { cleanupTracked, testDb, track } from "../../support/db";
import { mockCalls } from "../../support/mockControl";

const staffAccounts: string[] = [];
const openedDays: string[] = [];

afterAll(async () => {
  for (const id of staffAccounts) await testDb().from("admin_users").delete().eq("id", id);
  for (const date of openedDays) {
    await testDb().from("parent_meeting_days").delete().eq("meeting_date", date);
  }
  await cleanupTracked();
});

type Body = {
  eligible: boolean;
  days: { date: string; label: string; slots: string[]; full: boolean }[];
  meeting: { id: string; meetingDate: string; slot: string } | null;
};

/**
 * Тест бүр өөрийн өдрөө нээнэ.
 *
 * Хуваалцвал зэрэгцээ ажиллах тестүүд бие биенийхээ цагийг барьж аваад
 * "цаг дүүрсэн" гэж унана. Он нь хол ирээдүйд — бодит захиалгатай
 * мөргөлдөхгүй.
 */
let dayCounter = 0;
async function openDay(owner: TestClient): Promise<string> {
  dayCounter += 1;
  const date = new Date(Date.UTC(2031, 0, 1) + dayCounter * 86400000).toISOString().slice(0, 10);
  const res = await owner.post("/api/admin/parent-meeting-days", { date });
  if (res.status !== 200) throw new Error(`open day failed: ${res.text}`);
  openedDays.push(date);
  return date;
}

/** 1 жилийн хөтөлбөрт идэвхтэй бүртгэлтэй сурагч — уулзалт захиалах эрхтэй. */
async function yearlyStudent() {
  const user = await createTestUser();
  const reg = await createTestRegistration({
    userId: user.id,
    programId: "program-c",
    status: "active",
  });
  track("registrations", reg.id);
  const client = await signedInClient(user.phone, user.password);
  return { user, client };
}

describe("уулзалтын цаг харах эрх", () => {
  it("нэвтрээгүй хүнд цаг харагдахгүй", async () => {
    const res = await anonClient().get<Body>("/api/parent-meeting");
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
    expect(res.body.days).toEqual([]);
  });

  it("1 жилийн хөтөлбөрт байхгүй сурагчид харагдахгүй", async () => {
    const owner = await adminClient("full");
    await openDay(owner);

    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    const res = await client.get<Body>("/api/parent-meeting");
    expect(res.body.eligible).toBe(false);
    expect(res.body.days).toEqual([]);
  });

  it("эрхгүй хүн гараар хүсэлт илгээсэн ч захиалж чадахгүй", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);

    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);
    const res = await client.post("/api/parent-meeting", { date, slot: "09:00–09:20" });
    expect(res.status).toBe(403);
  });

  it("жилийн хөтөлбөрийн сурагчид нээсэн өдөр харагдана", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { client } = await yearlyStudent();

    const res = await client.get<Body>("/api/parent-meeting");
    expect(res.body.eligible).toBe(true);
    const day = res.body.days.find((one) => one.date === date);
    expect(day, `${date} өдөр жагсаалтад байх ёстой`).toBeDefined();
    // Өдөрт 16 цаг: 09:00–13:00, 14:00–18:00, 30 минутын алхамтай.
    expect(day!.slots).toHaveLength(16);
    expect(day!.slots[0]).toBe("09:00–09:20");
    expect(day!.slots).not.toContain("13:00–13:20");
  });
});

describe("цаг захиалах", () => {
  it("захиалсан цаг хадгалагдаж, дахин харагдана", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { user, client } = await yearlyStudent();

    const res = await client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "10:00–10:20",
    });
    expect(res.status, res.text).toBe(200);
    track("parent_meetings", res.body.meeting.id);

    const again = await client.get<Body>("/api/parent-meeting");
    expect(again.body.meeting?.meetingDate).toBe(date);
    expect(again.body.meeting?.slot).toBe("10:00–10:20");

    const { data } = await testDb()
      .from("parent_meetings")
      .select("user_id, status")
      .eq("id", res.body.meeting.id)
      .single();
    expect((data as { user_id: string }).user_id).toBe(user.id);
    expect((data as { status: string }).status).toBe("booked");
  });

  it("нэг цагийг хоёр гэр бүл авч чадахгүй", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const first = await yearlyStudent();
    const second = await yearlyStudent();

    const mine = await first.client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "11:00–11:20",
    });
    expect(mine.status, mine.text).toBe(200);
    track("parent_meetings", mine.body.meeting.id);

    const clash = await second.client.post("/api/parent-meeting", { date, slot: "11:00–11:20" });
    expect(clash.status).toBe(409);
    expect(clash.text).toContain("өөр хүн авчихлаа");

    // Авагдсан цаг бусдын жагсаалтаас алга болно.
    const list = await second.client.get<Body>("/api/parent-meeting");
    const day = list.body.days.find((one) => one.date === date);
    expect(day!.slots).not.toContain("11:00–11:20");
    expect(day!.slots).toHaveLength(15);
  });

  it("нэг хүүхэд хоёр уулзалт барьж чадахгүй", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { client } = await yearlyStudent();

    const first = await client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "09:00–09:20",
    });
    track("parent_meetings", first.body.meeting.id);

    const second = await client.post("/api/parent-meeting", { date, slot: "09:30–09:50" });
    expect(second.status).toBe(409);
    expect(second.text).toContain("аль хэдийн");
  });

  it("нээгээгүй өдөр, сүлжээнд байхгүй цагийг татгалзана", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { client } = await yearlyStudent();

    // Зөв өдөр, буруу цаг (цайны цаг).
    const badSlot = await client.post("/api/parent-meeting", { date, slot: "13:00–13:20" });
    expect(badSlot.status).toBe(400);

    // Зөв цаг, нээгээгүй өдөр.
    const badDay = await client.post("/api/parent-meeting", {
      date: "2035-06-01",
      slot: "09:00–09:20",
    });
    expect(badDay.status).toBe(400);
  });

  it("болисны дараа цаг нь бусдад сул болно", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const first = await yearlyStudent();
    const second = await yearlyStudent();

    const mine = await first.client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "14:00–14:20",
    });
    track("parent_meetings", mine.body.meeting.id);

    const cancelled = await first.client.del("/api/parent-meeting", { id: mine.body.meeting.id });
    expect(cancelled.status, cancelled.text).toBe(200);

    const taken = await second.client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "14:00–14:20",
    });
    expect(taken.status, taken.text).toBe(200);
    track("parent_meetings", taken.body.meeting.id);
  });

  it("өөр хүний цагийг болиулж чадахгүй", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const mine = await yearlyStudent();
    const stranger = await yearlyStudent();

    const made = await mine.client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "15:00–15:20",
    });
    track("parent_meetings", made.body.meeting.id);

    const res = await stranger.client.del("/api/parent-meeting", { id: made.body.meeting.id });
    expect(res.status).toBe(404);

    const { data } = await testDb()
      .from("parent_meetings")
      .select("status")
      .eq("id", made.body.meeting.id)
      .single();
    expect((data as { status: string }).status).toBe("booked");
  });
});

/**
 * Нэг ээлжид нэг уулзалт — гэхдээ дараагийн ээлжид дахин.
 *
 * Эзний шийдвэр: хүүхэд нэг удаад нэг л уулзалттай, админ шинэ өдрүүд
 * нээхэд бүгд дахин захиална. Өнгөрсөн уулзалт тэр захиалгад саад болох
 * ёсгүй — эхний хувилбарт болж байсан.
 */
describe("дараагийн ээлж", () => {
  /** Өнгөрсөн уулзалтыг шууд суулгана — тест бүр өөр огноотой, мөргөлдөхгүй. */
  let pastCounter = 0;
  async function pastMeeting(userId: string, status: "booked" | "came" | "missed") {
    pastCounter += 1;
    const date = new Date(Date.UTC(2019, 0, 1) + pastCounter * 86400000).toISOString().slice(0, 10);
    const { data, error } = await testDb()
      .from("parent_meetings")
      .insert({ user_id: userId, meeting_date: date, slot: "09:00–09:20", status })
      .select("id")
      .single();
    if (error) throw new Error(`past meeting seed failed: ${error.message}`);
    track("parent_meetings", (data as { id: string }).id);
  }

  it("өнгөрсөн уулзалт шинэ захиалгад саад болохгүй", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { user, client } = await yearlyStudent();
    await pastMeeting(user.id, "came");

    const res = await client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "12:00–12:20",
    });
    expect(res.status, res.text).toBe(200);
    track("parent_meetings", res.body.meeting.id);
  });

  it("багш тэмдэглээгүй өнгөрсөн уулзалт ч саад болохгүй", async () => {
    // Багш "ирсэн" гэж дарахаа мартвал мөр 'booked' хэвээр үлддэг — тэр нь
    // хүүхдийг үүрд түгжих ёсгүй.
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { user, client } = await yearlyStudent();
    await pastMeeting(user.id, "booked");

    const res = await client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "12:30–12:50",
    });
    expect(res.status, res.text).toBe(200);
    track("parent_meetings", res.body.meeting.id);
  });

  it("өнгөрсөн уулзалтыг картан дээр харуулахгүй", async () => {
    const owner = await adminClient("full");
    await openDay(owner);
    const { user, client } = await yearlyStudent();
    await pastMeeting(user.id, "booked");

    const res = await client.get<Body>("/api/parent-meeting");
    expect(res.body.meeting).toBeNull();
  });

  it("хоёр таб зэрэг дарахад нэг л уулзалт үлдэнэ", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { user, client } = await yearlyStudent();

    const [a, b] = await Promise.all([
      client.post<{ meeting?: { id: string } }>("/api/parent-meeting", { date, slot: "09:30–09:50" }),
      client.post<{ meeting?: { id: string } }>("/api/parent-meeting", { date, slot: "10:30–10:50" }),
    ]);
    for (const res of [a, b]) if (res.body.meeting?.id) track("parent_meetings", res.body.meeting.id);

    // Нэг нь амжилттай, нөгөө нь 409 — хоёулаа унах ч, хоёулаа амжих ч ёсгүй.
    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const { data } = await testDb()
      .from("parent_meetings")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "booked");
    expect(data).toHaveLength(1);
  });
});

describe("эцэг эхэд SMS", () => {
  /** Тухайн дугаар руу явсан SMS-үүд. */
  async function smsTo(phone: string) {
    return (await mockCalls("skytel")).filter((c) => c.query.sendto === phone);
  }

  it("цаг захиалахад аккаунтын утас руу SMS очно", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { user, client } = await yearlyStudent();
    const before = (await smsTo(user.phone)).length;

    const res = await client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "11:30–11:50",
    });
    expect(res.status, res.text).toBe(200);
    track("parent_meetings", res.body.meeting.id);

    const sent = await smsTo(user.phone);
    expect(sent.length).toBe(before + 1);
    const message = String(sent[sent.length - 1].query.message ?? "");
    // Цаг нь энгийн зураастай, латинаар.
    expect(message).toContain("11:30-11:50");
    expect(message).toContain("Bagshtai uulzah");
  });

  it("эцэг эхийн утас бөглөсөн бол тийшээ очно, аккаунтын утас руу биш", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { user, client } = await yearlyStudent();
    // Тестийн дугаар — factory-ийн 70-аас тусдаа мужид.
    const parentPhone = `72${String(Date.now()).slice(-6)}`;
    await testDb().from("users").update({ parent_phone: parentPhone }).eq("id", user.id);

    const ownBefore = (await smsTo(user.phone)).length;
    const parentBefore = (await smsTo(parentPhone)).length;

    const res = await client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "12:00–12:20",
    });
    expect(res.status, res.text).toBe(200);
    track("parent_meetings", res.body.meeting.id);

    expect((await smsTo(parentPhone)).length).toBe(parentBefore + 1);
    expect((await smsTo(user.phone)).length).toBe(ownBefore);
  });

  it("захиалга амжилтгүй бол SMS очихгүй", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const first = await yearlyStudent();
    const second = await yearlyStudent();

    const made = await first.client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "14:30–14:50",
    });
    track("parent_meetings", made.body.meeting.id);

    const before = (await smsTo(second.user.phone)).length;
    const clash = await second.client.post("/api/parent-meeting", { date, slot: "14:30–14:50" });
    expect(clash.status).toBe(409);
    // Цаг авч чадаагүй хүнд "баталгаажлаа" гэсэн SMS очих ёсгүй.
    expect((await smsTo(second.user.phone)).length).toBe(before);
  });
});

describe("админ, багшийн тал", () => {
  it("нээгээгүй өдөр сурагчдад огт харагдахгүй", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { client } = await yearlyStudent();

    expect((await client.get<Body>("/api/parent-meeting")).body.days.map((d) => d.date)).toContain(
      date
    );

    const closed = await owner.del("/api/admin/parent-meeting-days", { date });
    expect(closed.status, closed.text).toBe(200);
    openedDays.splice(openedDays.indexOf(date), 1);

    expect(
      (await client.get<Body>("/api/parent-meeting")).body.days.map((d) => d.date)
    ).not.toContain(date);
  });

  it("өдөр хаахад захиалсан цаг устахгүй", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { client } = await yearlyStudent();

    const made = await client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "16:00–16:20",
    });
    track("parent_meetings", made.body.meeting.id);

    await owner.del("/api/admin/parent-meeting-days", { date });
    openedDays.splice(openedDays.indexOf(date), 1);

    // Эцэг эх аль хэдийн төлөвлөчихсөн — захиалга нь хэвээрээ.
    const again = await client.get<Body>("/api/parent-meeting");
    expect(again.body.meeting?.slot).toBe("16:00–16:20");
  });

  it("багш жагсаалтыг харж, ирсэн гэж тэмдэглэнэ", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { client } = await yearlyStudent();
    const made = await client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "17:00–17:20",
    });
    track("parent_meetings", made.body.meeting.id);

    const { client: teacher, id } = await staffClient(owner, {
      name: "Тест багш",
      username: `meeting-teacher-${randomUUID().slice(0, 8)}`,
      password: "TeacherPass-2026",
      role: "teacher",
    });
    staffAccounts.push(id);

    const res = await teacher.put(`/api/admin/parent-meetings/${made.body.meeting.id}`, {
      status: "came",
    });
    expect(res.status, res.text).toBe(200);

    const { data } = await testDb()
      .from("parent_meetings")
      .select("status")
      .eq("id", made.body.meeting.id)
      .single();
    expect((data as { status: string }).status).toBe("came");
  });

  it("нэвтрээгүй хүн өдөр нээж ч, тэмдэглэж ч чадахгүй", async () => {
    const day = await anonClient().post("/api/admin/parent-meeting-days", { date: "2031-05-05" });
    expect(day.status).toBe(401);

    const mark = await anonClient().put(
      "/api/admin/parent-meetings/00000000-0000-4000-8000-000000000000",
      { status: "came" }
    );
    expect(mark.status).toBe(401);
  });

  it("өнгөрсөн өдрийг нээхгүй", async () => {
    const owner = await adminClient("full");
    const res = await owner.post("/api/admin/parent-meeting-days", { date: "2020-01-01" });
    expect(res.status).toBe(400);
  });
});
