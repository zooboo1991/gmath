/**
 * Шаталсан түвшин тогтоолт — бүтэн урсгал.
 *
 * Мөнгө, эрх, шатлалын гурван асуулт: төлөөгүй хүн бодлого авч чадах уу,
 * зөв хариулт клиент рүү алдагдах уу, шатлал "2 → зөв бол 3, буруу бол 1"
 * гэсэн тохиролцоог дагаж байна уу.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { anonClient, signedInClient, TestClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { createTestUser, trackNotificationsForCreatedUsers } from "../../support/factories";

/** Тестийн бүх бодлого энэ ангид — бусад тесттэй мөргөлдөхгүй байх үүднээс 11. */
const GRADE = 11;

beforeAll(async () => {
  await testDb()
    .from("app_settings")
    .upsert({ key: "placement_grades", value: String(GRADE) }, { onConflict: "key" });
});

afterAll(async () => {
  await testDb().from("app_settings").delete().eq("key", "placement_grades");
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
});

afterEach(async () => {
  // Сэдвүүд тест бүрд шинээр бүтээгддэг тул энд шууд устгана — track()
  // зөвхөн бүртгэдэг, цэвэрлэгээ нь afterAll-д л явдаг тул хоёр тестийн
  // хооронд unique түлхүүр мөргөлдчихнө.
  const { data } = await testDb().from("placement_problems").select("id").eq("grade", GRADE);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length > 0) {
    await testDb().from("placement_steps").delete().in("problem_id", ids);
    await testDb().from("placement_problems").delete().in("id", ids);
  }
});

/** Гурван түвшин бүрэн, хариулттай нэг сэдэв. */
async function seedTopic(topicOrder: number, topic = `Сэдэв ${topicOrder}`) {
  const rows = [1, 2, 3].map((level) => ({
    grade: GRADE,
    topic,
    topic_order: topicOrder,
    level,
    body_latex: `${topic} — ${level}-р түвшний бодлого`,
    answers: [`${topicOrder}${level}`], // хариулт нь "21" маягийн тоо
    active: true,
  }));
  const { error } = await testDb().from("placement_problems").insert(rows);
  if (error) throw new Error(`seedTopic failed: ${error.message}`);
}

/** Төлбөрөө төлсөн, эхлэхэд бэлэн шалгалт. */
async function paidPlacement(): Promise<{ client: TestClient; id: string }> {
  const student = await createTestUser();
  const client = await signedInClient(student.phone, student.password);
  const started = await client.post<{ assessment: { id: string } }>("/api/assessment", {
    track: "placement",
    grade: GRADE,
  });
  expect(started.status, started.text).toBe(200);
  const id = started.body.assessment.id;
  track("assessments", id);
  // Тест орчинд QPay тохируулаагүй үед stub провайдер шууд төлнө; эс бөгөөс
  // туршилтын хялбарын тулд статусыг нь гараар paid болгоно.
  await testDb().from("assessments").update({ status: "paid" }).eq("id", id);
  return { client, id };
}

type View =
  | { done: false; problem: { bodyLatex: string; level: number; topicOrder: number }; position: number; total: number; remainingSeconds: number }
  | { done: true; result: { level: number; topics: { topic: string; score: number }[] } };

async function state(client: TestClient, id: string): Promise<View> {
  const res = await client.get<{ view: View }>(`/api/assessment/${id}/placement`);
  expect(res.status, res.text).toBe(200);
  return res.body.view;
}

async function answer(client: TestClient, id: string, value: string): Promise<View> {
  const res = await client.post<{ view: View }>(`/api/assessment/${id}/placement/answer`, {
    answer: value,
  });
  expect(res.status, res.text).toBe(200);
  return res.body.view;
}

describe("хандах эрх", () => {
  it("нэвтрээгүй болон өөр хүнийг няцаана", async () => {
    await seedTopic(1);
    const { id } = await paidPlacement();
    expect((await anonClient().get(`/api/assessment/${id}/placement`)).status).toBe(401);

    const outsider = await createTestUser();
    const other = await signedInClient(outsider.phone, outsider.password);
    expect((await other.get(`/api/assessment/${id}/placement`)).status).toBe(404);
  });

  it("төлөөгүй шалгалтад бодлого өгөхгүй", async () => {
    await seedTopic(1);
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);
    const started = await client.post<{ assessment: { id: string; status: string } }>("/api/assessment", {
      track: "placement",
      grade: GRADE,
    });
    track("assessments", started.body.assessment.id);
    if (started.body.assessment.status !== "awaiting_payment") {
      // Stub провайдер шууд төлдөг орчинд энэ тест утгагүй.
      return;
    }
    const res = await client.get(`/api/assessment/${started.body.assessment.id}/placement`);
    expect(res.status).toBe(409);
  });

  it("нээгдээгүй ангид шалгалт эхлэхгүй", async () => {
    const student = await createTestUser();
    const client = await signedInClient(student.phone, student.password);
    const res = await client.post("/api/assessment", { track: "placement", grade: 4 });
    expect(res.status).toBe(503);
  });
});

describe("шатлал ба дүгнэлт", () => {
  it("2-оос эхэлж, зөв бол 3 руу гарна; хариулт хэзээ ч задрахгүй", async () => {
    await seedTopic(1);
    const { client, id } = await paidPlacement();

    const first = await state(client, id);
    expect(first.done).toBe(false);
    if (first.done) return;
    expect(first.problem.level).toBe(2);
    expect(first.total).toBe(2);
    // Зөв хариулт хариултын биед хаана ч байхгүй.
    const raw = await client.get(`/api/assessment/${id}/placement`);
    expect(raw.text).not.toContain('"answers"');
    expect(raw.text).not.toContain('"12"');

    const second = await answer(client, id, "12"); // level 2-ийн зөв хариулт
    expect(second.done).toBe(false);
    if (second.done) return;
    expect(second.problem.level).toBe(3);

    const finished = await answer(client, id, "13"); // level 3 зөв
    expect(finished.done).toBe(true);
    if (!finished.done) return;
    expect(finished.result.topics[0].score).toBe(3);
    expect(finished.result.level).toBe(3);
  });

  it("2-т буруу бол 1 рүү буудаг, оноо нь мөчрөө дагана", async () => {
    await seedTopic(1);
    const { client, id } = await paidPlacement();

    await state(client, id);
    const afterWrong = await answer(client, id, "999");
    expect(afterWrong.done).toBe(false);
    if (afterWrong.done) return;
    expect(afterWrong.problem.level).toBe(1);

    const finished = await answer(client, id, "11"); // level 1 зөв
    expect(finished.done).toBe(true);
    if (!finished.done) return;
    expect(finished.result.topics[0].score).toBe(1);
    expect(finished.result.level).toBe(1);
  });

  it("олон сэдэв дарааллаараа асуугдаж, оноонууд тусдаа гарна", async () => {
    await seedTopic(1, "Бутархай");
    await seedTopic(2, "Тэгшитгэл");
    const { client, id } = await paidPlacement();

    await state(client, id);
    await answer(client, id, "12"); // сэдэв 1, түвшин 2 — зөв
    await answer(client, id, "999"); // сэдэв 1, түвшин 3 — буруу
    const third = await answer(client, id, "22"); // сэдэв 2, түвшин 2 — зөв
    expect(third.done).toBe(false);
    if (third.done) return;
    expect(third.problem.topicOrder).toBe(2);
    expect(third.problem.level).toBe(3);

    const finished = await answer(client, id, "999"); // сэдэв 2, түвшин 3 — буруу
    expect(finished.done).toBe(true);
    if (!finished.done) return;
    expect(finished.result.topics.map((t) => t.score)).toEqual([2, 2]);
    expect(finished.result.level).toBe(2);
  });

  it("бутархай хариултыг аравтын хэлбэрээр бичсэн ч зөвд тооцно", async () => {
    await seedTopic(1);
    await testDb()
      .from("placement_problems")
      .update({ answers: ["13/20"] })
      .eq("grade", GRADE)
      .eq("level", 2);
    const { client, id } = await paidPlacement();

    await state(client, id);
    const next = await answer(client, id, "0,65");
    expect(next.done).toBe(false);
    if (next.done) return;
    expect(next.problem.level).toBe(3);
  });

  it("refresh хийхэд ижил бодлогоо дахин авна — давхар мөр үүсэхгүй", async () => {
    await seedTopic(1);
    const { client, id } = await paidPlacement();

    const a = await state(client, id);
    const b = await state(client, id);
    if (a.done || b.done) return;
    expect(b.problem.bodyLatex).toBe(a.problem.bodyLatex);

    const { data } = await testDb().from("placement_steps").select("id").eq("assessment_id", id);
    expect((data ?? []).length).toBe(1);
  });

  it("идэвхгүй болон дутуу сэдэв шалгалтад орохгүй", async () => {
    await seedTopic(1);
    // 2-р сэдэв: зөвхөн хоёр түвшин — бүрэн биш тул орох ёсгүй.
    await testDb().from("placement_problems").insert([
      { grade: GRADE, topic: "Дутуу", topic_order: 2, level: 1, body_latex: "x", answers: ["1"], active: true },
      { grade: GRADE, topic: "Дутуу", topic_order: 2, level: 2, body_latex: "y", answers: ["2"], active: true },
    ]);
    const { client, id } = await paidPlacement();

    const first = await state(client, id);
    if (first.done) return;
    expect(first.total).toBe(2); // ганц бүрэн сэдэв × 2
  });
});
