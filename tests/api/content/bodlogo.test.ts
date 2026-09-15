/**
 * Бодлого хувилах системээс бодлого хүлээн авах зам.
 *
 * Гол амлалтууд: түлхүүргүй хүн орж чадахгүй, ижил бодлого хоёр удаа ирвэл
 * нэг л мөр үлдэнэ, ирсэн бодлого бодлогын банкинд ОРОХГҮЙ (багш татаж авах
 * хүртэл), татсаны дараа дахин татагдахгүй.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, anonClient } from "../../support/client";
import { cleanupTracked, testDb, track, trackBy } from "../../support/db";
import { loadTestEnv } from "../../support/env";

const BASE = "/api/bodlogo/problems";

/** Тестийн орчны түлхүүр. Кодод бичихгүй — .env.test-ээс уншина. */
let apiKey = "";

/** Энэ файлын үүсгэсэн мөрүүдийг нэг хүсэлтээр цэвэрлэх тэмдэг. */
const MARK = randomUUID().replace(/-/g, "").slice(0, 8);

/** `var_000123` хэлбэрийн дахин давтагдахгүй id. */
let counter = 0;
function externalId(): string {
  counter += 1;
  return `var_9${String(Date.now() % 100000).padStart(5, "0")}${counter}`;
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    external_id: externalId(),
    template_id: "tpl_000042",
    family_id: `fam_${String(counter).padStart(6, "0")}`,
    grade: 7,
    topic: `Хувилах тест ${MARK}`,
    level: 2,
    text: "Нэг ажилчин 1 цагт ажлын $\\frac{1}{10}$-ыг хийнэ. Хэдэн цагт дуусах вэ?",
    solution: "1 цагт 1/10 тул 10 цаг шаардагдана.",
    answer: { type: "integer", value: "10", display: "10", unit: "цаг", tolerance: null },
    tags: ["ажлын бодлого"],
    source: "generated",
    ...overrides,
  };
}

function send(body: unknown, key: string | null = apiKey) {
  return anonClient().post<{ id?: string; detail?: string }>(
    BASE,
    body,
    key === null ? {} : { Authorization: `Bearer ${key}` }
  );
}

beforeAll(() => {
  apiKey = loadTestEnv().BODLOGO_API_KEY ?? "";
  if (!apiKey) throw new Error(".env.test-д BODLOGO_API_KEY тохируулаагүй байна");
  // Мөрүүдийг topic-оороо цэвэрлэнэ: 422 буцсан хүсэлт ч мөр үлдээхгүй ч
  // амжилттай нь олон байх тул нэг нэгээр нь бүртгэх нь утгагүй.
  trackBy("bodlogo_problems", "topic", `Хувилах тест ${MARK}`);
});

afterAll(async () => {
  await cleanupTracked();
});

describe("bodlogo бодлого хүлээн авах", () => {
  it("түлхүүргүй хүнийг оруулахгүй", async () => {
    const res = await send(payload(), null);
    expect(res.status).toBe(401);
  });

  it("буруу түлхүүрийг оруулахгүй", async () => {
    const res = await send(payload(), `${apiKey}x`);
    expect(res.status).toBe(401);
  });

  it("зөв түлхүүртэй бодлогыг хүлээж авна", async () => {
    const body = payload();
    const res = await send(body);
    expect(res.status, res.text).toBe(200);
    expect(res.body.id).toBeTruthy();

    const { data } = await testDb()
      .from("bodlogo_problems")
      .select("*")
      .eq("external_id", body.external_id)
      .single();
    const row = data as {
      solution_mn: string;
      answer_value: string;
      answer_unit: string;
      taken_problem_id: string | null;
    };
    expect(row.solution_mn).toBe(body.solution);
    expect(row.answer_value).toBe("10");
    expect(row.answer_unit).toBe("цаг");
    // Хамгийн чухал амлалт: ирсэн бодлого банкинд ОРООГҮЙ.
    expect(row.taken_problem_id).toBeNull();
  });

  it("ижил external_id хоёр удаа ирвэл нэг л мөр үлдэнэ", async () => {
    const body = payload();
    expect((await send(body)).status).toBe(200);
    const again = await send({ ...body, text: "Засварласан эх" });
    expect(again.status, again.text).toBe(200);

    const { data } = await testDb()
      .from("bodlogo_problems")
      .select("id, body_latex")
      .eq("external_id", body.external_id);
    const rows = (data ?? []) as { body_latex: string }[];
    expect(rows).toHaveLength(1);
    // Дахин илгээлт нь шинэчилнэ — publish командыг дахин ажиллуулж болно.
    expect(rows[0].body_latex).toBe("Засварласан эх");
  });

  it("танихгүй талбартай payload-ыг татгалзана", async () => {
    // Номын нэр, хуудас зэрэг гарал үүслийн мэдээлэл gmath тал руу гарах ёсгүй.
    const res = await send(payload({ book_title: "7-р ангийн бодлогын ном" }));
    expect(res.status).toBe(422);
    expect(res.body.detail).toContain("book_title");
  });

  it("дутуу талбартай payload-ыг татгалзана", async () => {
    const body = payload();
    delete (body as Record<string, unknown>).solution;
    const res = await send(body);
    expect(res.status).toBe(422);
    expect(res.body.detail).toContain("solution");
  });

  it("AI багшийн өгөгдөлтэй бодлогыг хүлээж авна", async () => {
    const body = payload({
      tutor: {
        steps: [{ title: "1-р алхам", text: "Нэгж ажлыг ол", value_key: "rate" }],
        hints: null,
        common_errors: [
          { value: "20", display: "20", diagnosis: "Хоёр дахин авсан", nudge: "Дахин уншаарай" },
        ],
      },
    });
    const res = await send(body);
    expect(res.status, res.text).toBe(200);

    const { data } = await testDb()
      .from("bodlogo_problems")
      .select("tutor")
      .eq("external_id", body.external_id)
      .single();
    const tutor = (data as { tutor: { steps: unknown[] } }).tutor;
    expect(tutor.steps).toHaveLength(1);
  });
});

describe("банкандаа татах", () => {
  async function arrive() {
    const body = payload();
    const res = await send(body);
    expect(res.status, res.text).toBe(200);
    const { data } = await testDb()
      .from("bodlogo_problems")
      .select("id")
      .eq("external_id", body.external_id)
      .single();
    return { id: (data as { id: string }).id, externalId: body.external_id };
  }

  it("нэвтрээгүй хүн татаж чадахгүй", async () => {
    const { id } = await arrive();
    const res = await anonClient().post(`/api/admin/bodlogo/${id}/take`, { category: "D" });
    expect(res.status).toBe(401);
  });

  it("зөвхөн харах эрхтэй админ татаж чадахгүй", async () => {
    const { id } = await arrive();
    const viewer = await adminClient("viewer");
    const res = await viewer.post(`/api/admin/bodlogo/${id}/take`, { category: "D" });
    expect(res.status).toBe(401);
  });

  it("эзэн татахад банкинд бодлого үүсч, мөр тэмдэглэгдэнэ", async () => {
    const { id, externalId: ext } = await arrive();
    const admin = await adminClient("full");
    const res = await admin.post<{ problem: { id: string; category: string; answerKey: string } }>(
      `/api/admin/bodlogo/${id}/take`,
      { category: "D", active: true }
    );
    expect(res.status, res.text).toBe(200);
    track("problems", res.body.problem.id);
    expect(res.body.problem.category).toBe("D");
    // Нэгж хариултын түлхүүрт ОРДОГГҮЙ: "10 цаг" гэж бичвэл 10 гэж бичсэн
    // хүүхэд буруу гэж үнэлэгдэнэ.
    expect(res.body.problem.answerKey).toBe("10");

    const { data } = await testDb()
      .from("bodlogo_problems")
      .select("taken_problem_id")
      .eq("external_id", ext)
      .single();
    expect((data as { taken_problem_id: string }).taken_problem_id).toBe(res.body.problem.id);
  });

  it("хоёр дахь удаа татахыг зөвшөөрөхгүй", async () => {
    const { id } = await arrive();
    const admin = await adminClient("full");
    const first = await admin.post<{ problem: { id: string } }>(`/api/admin/bodlogo/${id}/take`, {
      category: "D",
    });
    expect(first.status, first.text).toBe(200);
    track("problems", first.body.problem.id);

    const second = await admin.post(`/api/admin/bodlogo/${id}/take`, { category: "D" });
    expect(second.status).toBe(409);
  });

  it("ангилалгүй татахыг зөвшөөрөхгүй", async () => {
    const { id } = await arrive();
    const admin = await adminClient("full");
    const res = await admin.post(`/api/admin/bodlogo/${id}/take`, {});
    expect(res.status).toBe(400);
  });
});
