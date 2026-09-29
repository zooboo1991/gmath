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
import { createTestAssessment, createTestRegistration, createTestUser } from "../../support/factories";
import { cleanupTracked, testDb, track } from "../../support/db";
import { listMockZoomMeetings, mockCalls } from "../../support/mockControl";
import { meetingRoomTopic } from "@/lib/parentMeeting";

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

/**
 * 1 жилийн хөтөлбөрт идэвхтэй бүртгэлтэй сурагч.
 *
 * Өгөгдмөлөөр түвшин тогтоох шалгалтын бодолтоо илгээсэн — уулзалт
 * захиалах бүрэн эрхтэй. `exam` нь шалгалтгүй, эсвэл эхлүүлсэн төлөвийг
 * шалгахад.
 */
async function yearlyStudent(
  opts: { exam?: "handed_in" | "none" | "started" | "cancelled" | "quiz_only" } = {}
) {
  const exam = opts.exam ?? "handed_in";
  const user = await createTestUser();
  const reg = await createTestRegistration({
    userId: user.id,
    programId: "program-c",
    status: "active",
  });
  track("registrations", reg.id);

  if (exam === "handed_in") {
    await createTestAssessment({ userId: user.id, track: "olympiad", status: "problems_submitted" });
  } else if (exam === "started") {
    await createTestAssessment({ userId: user.id, track: "olympiad", status: "questionnaire_done" });
  } else if (exam === "cancelled") {
    const made = await createTestAssessment({ userId: user.id, track: "olympiad", status: "completed" });
    await testDb().from("assessments").update({ status: "cancelled" }).eq("id", made.id);
  } else if (exam === "quiz_only") {
    // "Сонгон ангийн тест" — түвшин тогтоох шалгалт биш.
    await createTestAssessment({ userId: user.id, track: "advanced", status: "completed" });
  }

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

/**
 * Уулзалт шалгалтын дүнг ярилцах зорилготой тул шалгалтаа өгөөгүй хүнд цаг
 * биш, шалгалт руу чиглүүлэх мэдээлэл очно.
 */
describe("түвшин тогтоох шалгалт", () => {
  type Gate = Body & { examRequired?: boolean; examState?: string; examHref?: string; hasOpenDays?: boolean };

  it("шалгалт өгөөгүй бол цаг харуулахгүй, шалгалт руу чиглүүлнэ", async () => {
    const owner = await adminClient("full");
    await openDay(owner);
    const { client } = await yearlyStudent({ exam: "none" });

    const res = await client.get<Gate>("/api/parent-meeting");
    expect(res.body.eligible).toBe(true);
    expect(res.body.examRequired).toBe(true);
    expect(res.body.examState).toBe("none");
    expect(res.body.days).toEqual([]);
    expect(res.body.hasOpenDays).toBe(true);
    // Сургалтын хуудасны "Түвшин тогтоох" таб руу.
    expect(res.body.examHref).toBe("/profile/course/program-c?tab=assessment");
  });

  it("эхлүүлсэн ч илгээгээгүй бол үргэлжлүүлэхийг сануулна", async () => {
    const owner = await adminClient("full");
    await openDay(owner);
    const { client } = await yearlyStudent({ exam: "started" });

    const res = await client.get<Gate>("/api/parent-meeting");
    expect(res.body.examRequired).toBe(true);
    expect(res.body.examState).toBe("started");
  });

  it("шалгалтгүй хүн гараар хүсэлт илгээсэн ч захиалж чадахгүй", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { user, client } = await yearlyStudent({ exam: "none" });

    const res = await client.post<{ error: string; examHref: string }>("/api/parent-meeting", {
      date,
      slot: "09:00–09:20",
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("түвшин тогтоох шалгалт");
    expect(res.body.examHref).toBe("/profile/course/program-c?tab=assessment");

    const { data } = await testDb().from("parent_meetings").select("id").eq("user_id", user.id);
    expect(data).toEqual([]);
  });

  it("цуцлагдсан шалгалт тооцогдохгүй", async () => {
    const owner = await adminClient("full");
    await openDay(owner);
    const { client } = await yearlyStudent({ exam: "cancelled" });
    expect((await client.get<Gate>("/api/parent-meeting")).body.examRequired).toBe(true);
  });

  it("сонгон ангийн тест нь түвшин тогтоох шалгалтыг орлохгүй", async () => {
    const owner = await adminClient("full");
    await openDay(owner);
    const { client } = await yearlyStudent({ exam: "quiz_only" });
    expect((await client.get<Gate>("/api/parent-meeting")).body.examRequired).toBe(true);
  });

  it("багш дүгнээгүй ч бодолтоо илгээсэн бол цаг авна", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { client } = await yearlyStudent({ exam: "handed_in" });

    const list = await client.get<Gate>("/api/parent-meeting");
    expect(list.body.examRequired).toBe(false);
    expect(list.body.days.some((d) => d.date === date)).toBe(true);

    const res = await client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "16:30–16:50",
    });
    expect(res.status, res.text).toBe(200);
    track("parent_meetings", res.body.meeting.id);
  });

  it("дүрмээс өмнө захиалсан цаг шалгалтгүй ч хэвээр харагдана", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { user, client } = await yearlyStudent({ exam: "none" });
    const { data } = await testDb()
      .from("parent_meetings")
      .insert({ user_id: user.id, meeting_date: date, slot: "15:30–15:50" })
      .select("id")
      .single();
    track("parent_meetings", (data as { id: string }).id);

    const res = await client.get<Gate>("/api/parent-meeting");
    expect(res.body.meeting?.slot).toBe("15:30–15:50");
    expect(res.body.examRequired).toBe(false);
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

/**
 * Онлайн уулзалт — хичээлтэй адил систем Zoom өрөө үүсгэж, гэр бүл
 * сайтаас "Zoom-оор орох" дарж шууд орно. Холбоос хуудсанд ч, SMS-д ч
 * бичигдэхгүй.
 */
describe("онлайн уулзалт", () => {
  /** Захиалгын хариу, GET хоёрын аль алинд Zoom холбоос байх ёсгүй. */
  const ZOOM_URL = /zoom\.us/;

  async function bookOnline(client: TestClient, date: string, slot: string) {
    const res = await client.post<{ meeting: { id: string; mode: string } }>("/api/parent-meeting", {
      date,
      slot,
      mode: "online",
    });
    expect(res.status, res.text).toBe(200);
    track("parent_meetings", res.body.meeting.id);
    return res;
  }

  /** Өдрийн өрөөг тестийн дараа цэвэрлэнэ — Zoom дээр ч, санд ч. */
  const roomDates: string[] = [];
  afterAll(async () => {
    for (const date of roomDates) {
      await testDb().from("parent_meeting_rooms").delete().eq("meeting_date", date);
    }
  });

  it("онлайн сонголт харагдаж, захиалахад Zoom холбоос хаана ч гарахгүй", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    roomDates.push(date);
    const { user, client } = await yearlyStudent();

    const list = await client.get<Body & { onlineAvailable?: boolean }>("/api/parent-meeting");
    expect(list.body.onlineAvailable).toBe(true);

    const smsBefore = (await mockCalls("skytel")).filter((c) => c.query.sendto === user.phone).length;
    const res = await bookOnline(client, date, "10:30–10:50");
    expect(res.body.meeting.mode).toBe("online");
    expect(res.text).not.toMatch(ZOOM_URL);
    expect(JSON.stringify((await client.get("/api/parent-meeting")).body)).not.toMatch(ZOOM_URL);

    const sms = (await mockCalls("skytel")).filter((c) => c.query.sendto === user.phone);
    expect(sms.length).toBe(smsBefore + 1);
    const text = String(sms[sms.length - 1].query.message ?? "");
    expect(text).not.toMatch(ZOOM_URL);
    expect(text).toContain("gmath.mn");
  });

  it("'Zoom-оор орох' дарахад хувийн холбоос руу шууд шилжинэ", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    roomDates.push(date);
    const { client } = await yearlyStudent();
    await bookOnline(client, date, "11:00–11:20");

    const first = await client.get("/api/parent-meeting/join");
    expect(first.status).toBe(307);
    const joinUrl = first.headers.get("location") ?? "";
    expect(joinUrl).toMatch(/^https:\/\/zoom\.us\/w\/mock\?tk=/);

    // Дахин дарахад ижил холбоос — дахин бүртгэхгүй.
    const again = await client.get("/api/parent-meeting/join");
    expect(again.headers.get("location")).toBe(joinUrl);
  });

  it("нэг өдрийн гэр бүлүүд нэг өрөөнд, тус тусын холбоостой орно", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    roomDates.push(date);
    const a = await yearlyStudent();
    const b = await yearlyStudent();
    await bookOnline(a.client, date, "14:00–14:20");
    await bookOnline(b.client, date, "14:30–14:50");

    const linkA = (await a.client.get("/api/parent-meeting/join")).headers.get("location");
    const linkB = (await b.client.get("/api/parent-meeting/join")).headers.get("location");
    expect(linkA).toBeTruthy();
    expect(linkB).toBeTruthy();
    expect(linkA).not.toBe(linkB);

    // Өдөрт яг нэг өрөө, хүлээлгийн өрөөтэй.
    const { data } = await testDb()
      .from("parent_meeting_rooms")
      .select("zoom_meeting_id")
      .eq("meeting_date", date);
    expect(data).toHaveLength(1);
    const roomId = (data as { zoom_meeting_id: string }[])[0].zoom_meeting_id;
    const room = (await listMockZoomMeetings()).find((m) => m.id === roomId);
    expect(room?.waitingRoom).toBe(true);
  });

  it("хоёр гэр бүл яг зэрэг анх дарсан ч нэг л өрөө үүснэ", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    roomDates.push(date);
    const a = await yearlyStudent();
    const b = await yearlyStudent();
    await bookOnline(a.client, date, "15:00–15:20");
    await bookOnline(b.client, date, "15:30–15:50");

    const [ra, rb] = await Promise.all([
      a.client.get("/api/parent-meeting/join"),
      b.client.get("/api/parent-meeting/join"),
    ]);
    expect(ra.status).toBe(307);
    expect(rb.status).toBe(307);

    const { data } = await testDb()
      .from("parent_meeting_rooms")
      .select("zoom_meeting_id")
      .eq("meeting_date", date);
    expect(data).toHaveLength(1);
    const roomId = (data as { zoom_meeting_id: string }[])[0].zoom_meeting_id;

    // Гол аюул нь санд хоёр мөр биш — хоёр гэр бүл ӨӨР Zoom өрөөнд
    // бүртгэгдэх. Тэгвэл багш аль нэгэнд нь хэнийг ч хүлээхгүй сууна.
    // Бүртгэл бүр санд бичигдсэн нэг өрөөнд очсон байх ёстой.
    const registrations = (await mockCalls("zoom")).filter(
      (c) => c.method === "POST" && /\/registrants$/.test(c.path) && c.path.includes(roomId)
    );
    const allRegistrations = (await mockCalls("zoom")).filter(
      (c) =>
        c.method === "POST" &&
        /\/registrants$/.test(c.path) &&
        [a.user.email, b.user.email].includes(String((c.body as { email?: string })?.email))
    );
    expect(allRegistrations).toHaveLength(2);
    expect(registrations).toHaveLength(2);

    // Ялагдсан талын үүсгэсэн илүү өрөө Zoom дээр үлдэх ёсгүй.
    const sameDay = (await listMockZoomMeetings()).filter((m) => m.topic === meetingRoomTopic(date));
    expect(sameDay).toHaveLength(1);
  });

  it("танхимаар захиалсан хүн Zoom-оор орж чадахгүй", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { client } = await yearlyStudent();
    const res = await client.post<{ meeting: { id: string } }>("/api/parent-meeting", {
      date,
      slot: "16:00–16:20",
      mode: "in_person",
    });
    track("parent_meetings", res.body.meeting.id);

    const join = await client.get("/api/parent-meeting/join");
    expect(join.status).toBe(307);
    expect(join.headers.get("location")).toMatch(/\/profile$/);
  });

  it("нэвтрээгүй хүн профайл руу буцна", async () => {
    const join = await anonClient().get("/api/parent-meeting/join");
    expect(join.headers.get("location")).toMatch(/\/profile$/);
  });

  it("хэлбэр заагаагүй бол танхимаар, буруу утгыг татгалзана", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    const { client } = await yearlyStudent();

    const bad = await client.post("/api/parent-meeting", { date, slot: "11:30–11:50", mode: "phone" });
    expect(bad.status).toBe(400);

    const res = await client.post<{ meeting: { id: string; mode: string } }>("/api/parent-meeting", {
      date,
      slot: "11:30–11:50",
    });
    expect(res.status, res.text).toBe(200);
    track("parent_meetings", res.body.meeting.id);
    expect(res.body.meeting.mode).toBe("in_person");
  });

  it("багш өрөөгөө хостоор нээнэ, нэвтрээгүй хүн чадахгүй", async () => {
    const owner = await adminClient("full");
    const date = await openDay(owner);
    roomDates.push(date);

    const res = await owner.get(`/api/admin/parent-meetings/room?date=${date}`);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/^https:\/\/zoom\.us\/s\//);

    const anon = await anonClient().get(`/api/admin/parent-meetings/room?date=${date}`);
    expect(anon.headers.get("location")).not.toMatch(/zoom\.us/);
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
