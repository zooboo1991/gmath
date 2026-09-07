import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, signedInClient } from "../../support/client";
import { mockCalls } from "../../support/mockControl";
import { notificationsFor } from "../../support/factories";
import { createTestUser } from "../../support/factories";
import { cleanupTracked, testDb, track } from "../../support/db";
import { trackNotificationsForCreatedUsers } from "../../support/factories";

/**
 * Хөтөлбөрийн хүлээлгийн дараалал.
 *
 * Гол амлалтууд: бүртгэл хаагдсан үед л дараалалд орно, нэг хүн нэг л удаа
 * орно, дугаар нь орсон дарааллаараа гарна, урд хүн гармагц ардчуудынх нь
 * дугаар урагшилна.
 */

// Тестийн сан хоосон эхэлдэг тул хөтөлбөрөө өөрөө үүсгэнэ — байгаа
// өгөгдлөөс хамаарахгүй, өөрийн үүсгэсэн мөрөө л устгана.
const PROGRAM_ID = "program-waitlist-test";

async function setClosed(closed: boolean) {
  await testDb().from("yearly_programs").update({ enrollment_closed: closed }).eq("id", PROGRAM_ID);
}

beforeAll(async () => {
  const { error } = await testDb().from("yearly_programs").upsert({
    id: PROGRAM_ID,
    tag: "ТЕСТ АНГИЛАЛ",
    title: "Тестийн жилийн хөтөлбөр",
    label: "Тестийн жилийн хөтөлбөр",
    topics: "Туршилт",
    price: "1,000,000₮",
    enrollment_closed: true,
  });
  if (error) throw new Error(`test programme seed failed: ${error.message}`);
});

afterAll(async () => {
  await testDb().from("program_waitlist").delete().eq("program_id", PROGRAM_ID);
  await testDb().from("yearly_programs").delete().eq("id", PROGRAM_ID);
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
});

afterEach(async () => {
  // Дарааллын мөрүүд хэрэглэгчтэйгээ хамт устдаг ч дараагийн тестийн
  // дугаарлалтыг бохирдуулахгүйн тулд эндээ цэвэрлэнэ.
  await testDb().from("program_waitlist").delete().eq("program_id", PROGRAM_ID);
  await setClosed(true);
});

async function joiner() {
  const user = await createTestUser();
  const client = await signedInClient(user.phone, user.password);
  return { user, client };
}

describe("хүлээлгийн жагсаалтад орох", () => {
  it("нэвтрээгүй хүнийг оруулахгүй", async () => {
    const res = await anonClient().post(`/api/programs/${PROGRAM_ID}/waitlist`, {});
    expect(res.status).toBe(401);
  });

  it("орсон дарааллаараа дугаарлана", async () => {
    const a = await joiner();
    const b = await joiner();

    const first = await a.client.post<{ position: number }>(`/api/programs/${PROGRAM_ID}/waitlist`, {});
    expect(first.status, first.text).toBe(200);
    expect(first.body.position).toBe(1);

    const second = await b.client.post<{ position: number }>(`/api/programs/${PROGRAM_ID}/waitlist`, {});
    expect(second.status, second.text).toBe(200);
    expect(second.body.position).toBe(2);
  });

  it("давхар дарахад хоёр дахь мөр үүсэхгүй, дугаар нь ч урагшлахгүй", async () => {
    const a = await joiner();
    const b = await joiner();
    await a.client.post(`/api/programs/${PROGRAM_ID}/waitlist`, {});
    await b.client.post(`/api/programs/${PROGRAM_ID}/waitlist`, {});

    const again = await b.client.post<{ position: number }>(`/api/programs/${PROGRAM_ID}/waitlist`, {});
    expect(again.body.position).toBe(2);

    const { count } = await testDb()
      .from("program_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("program_id", PROGRAM_ID);
    expect(count).toBe(2);
  });

  it("бүртгэл нээлттэй бол дараалал утгагүй", async () => {
    await setClosed(false);
    const a = await joiner();
    const res = await a.client.post(`/api/programs/${PROGRAM_ID}/waitlist`, {});
    expect(res.status).toBe(409);
  });

  it("өөрийн байрыг дахин уншиж чадна", async () => {
    const a = await joiner();
    await a.client.post(`/api/programs/${PROGRAM_ID}/waitlist`, {});
    const mine = await a.client.get<{ joined: boolean; position: number }>(
      `/api/programs/${PROGRAM_ID}/waitlist`
    );
    expect(mine.body.joined).toBe(true);
    expect(mine.body.position).toBe(1);
  });

  it("гарсан хүний ард байсан нь урагшилна", async () => {
    const a = await joiner();
    const b = await joiner();
    await a.client.post(`/api/programs/${PROGRAM_ID}/waitlist`, {});
    await b.client.post(`/api/programs/${PROGRAM_ID}/waitlist`, {});

    expect((await a.client.del(`/api/programs/${PROGRAM_ID}/waitlist`)).status).toBe(200);

    const moved = await b.client.get<{ position: number }>(`/api/programs/${PROGRAM_ID}/waitlist`);
    expect(moved.body.position).toBe(1);
  });
});

describe("хаагдсан бүртгэл", () => {
  it("хаалттай хөтөлбөрт шууд бүртгүүлэхийг сервер няцаана", async () => {
    const a = await joiner();
    const res = await a.client.post("/api/enroll", {
      programId: PROGRAM_ID,
      payMethod: "bank",
    });
    expect(res.status).toBe(409);
    expect(res.text).toContain("Хүлээлгийн жагсаалт");
  });

  it("дараалалд зүгээр хүлээж байгаа хүн ч орж чадахгүй", async () => {
    const a = await joiner();
    await a.client.post(`/api/programs/${PROGRAM_ID}/waitlist`, {});
    const res = await a.client.post("/api/enroll", { programId: PROGRAM_ID, payMethod: "bank" });
    expect(res.status).toBe(409);
  });

  it("Холбогдсон гэж тэмдэглэгдсэн хүн бүртгүүлж чадна, мөр нь хаагдана", async () => {
    const a = await joiner();
    await a.client.post(`/api/programs/${PROGRAM_ID}/waitlist`, {});
    // Админ "Холбогдсон" дарсныг дуурайна.
    await testDb()
      .from("program_waitlist")
      .update({ status: "notified" })
      .eq("user_id", a.user.id)
      .eq("program_id", PROGRAM_ID);

    const res = await a.client.post<{ registration: { id: string } }>("/api/enroll", {
      programId: PROGRAM_ID,
      payMethod: "bank",
    });
    expect(res.status, res.text).toBe(200);
    track("registrations", res.body.registration.id);

    // Бүртгэл үүсмэгц дарааллын мөр байр эзлэхээ болино — ардынх нь
    // дугаар урагшилж, админ дахин залгахгүй.
    const { data } = await testDb()
      .from("program_waitlist")
      .select("status")
      .eq("user_id", a.user.id)
      .eq("program_id", PROGRAM_ID)
      .single();
    expect((data as { status: string }).status).toBe("closed");
  });
});


describe("Холбогдсон гэж тэмдэглэхэд мэдэгдэнэ", () => {
  it("SMS болон мэдэгдэл нэг л удаа очно", async () => {
    const a = await joiner();
    await a.client.post(`/api/programs/${PROGRAM_ID}/waitlist`, {});
    const { data } = await testDb()
      .from("program_waitlist")
      .select("id")
      .eq("user_id", a.user.id)
      .eq("program_id", PROGRAM_ID)
      .single();
    const entryId = (data as { id: string }).id;

    const admin = await adminClient("full");
    const smsBefore = (await mockCalls("skytel")).filter((c) => c.query.sendto === a.user.phone).length;

    const res = await admin.put(`/api/admin/program-waitlist`, { id: entryId, status: "notified" });
    expect(res.status, res.text).toBe(200);

    // Утасны амлалтын баталгаа: SMS латинаар, бүртгүүлэх газраа заасан байна.
    const smsCalls = (await mockCalls("skytel")).filter((c) => c.query.sendto === a.user.phone);
    expect(smsCalls.length).toBe(smsBefore + 1);
    expect(String(smsCalls[smsCalls.length - 1].query.message ?? "")).toContain("burtguuleh");

    const titles = (await notificationsFor(a.user.id)).map((n) => n.title);
    expect(titles).toContain("Танд сул орон тоо гарлаа");

    // Давхар дарахад дахин илгээхгүй — төлөв аль хэдийн notified.
    await admin.put(`/api/admin/program-waitlist`, { id: entryId, status: "notified" });
    const smsAgain = (await mockCalls("skytel")).filter((c) => c.query.sendto === a.user.phone).length;
    expect(smsAgain).toBe(smsBefore + 1);
  });

  it("Хаах дарахад SMS очихгүй", async () => {
    const a = await joiner();
    await a.client.post(`/api/programs/${PROGRAM_ID}/waitlist`, {});
    const { data } = await testDb()
      .from("program_waitlist")
      .select("id")
      .eq("user_id", a.user.id)
      .eq("program_id", PROGRAM_ID)
      .single();

    const admin = await adminClient("full");
    const before = (await mockCalls("skytel")).filter((c) => c.query.sendto === a.user.phone).length;
    await admin.put(`/api/admin/program-waitlist`, { id: (data as { id: string }).id, status: "closed" });
    const after = (await mockCalls("skytel")).filter((c) => c.query.sendto === a.user.phone).length;
    expect(after).toBe(before);
  });
});
