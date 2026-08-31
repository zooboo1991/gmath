/**
 * Гэрээний загвар: Word байршуулах, тагийг талбартай холбох, бөглөсөн гэрээ
 * татах бүтэн урсгал.
 *
 * Гэрээ бол сургуулийн нэрийн өмнөөс байгуулах баримт тул зөвхөн эзний эрх
 * хүрнэ — багш, зөвхөн харах эрх, нэвтрээгүй зочин бүгд няцаагдана.
 */

import { afterAll, describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { adminClient, anonClient, staffClient, type TestClient } from "../../support/client";
import { BASE_URL } from "../../support/env";
import { cleanupTracked, testDb, track, trackStorageObject } from "../../support/db";
import { createTestCourse, createTestRegistration, createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

/** Word-ийн хуваасан тагийг дуурайсан жижиг .docx. */
function makeDocx(runs: string[]): Buffer {
  const body = runs.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join("");
  const zip = new PizZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", RELS);
  zip
    .folder("word")!
    .file(
      "document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>${body}</w:p></w:body></w:document>`
    );
  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

function textOf(buffer: Buffer): string {
  return new PizZip(buffer).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "").trim();
}

type Template = {
  id: string;
  title: string;
  tags: { tag: string; field?: string }[];
  programIds: string[];
  status: string;
  fileName?: string;
};

async function createTemplate(admin: TestClient, title = "Сургалтын гэрээ"): Promise<Template> {
  const res = await admin.post<{ template: Template }>("/api/admin/contracts", { title });
  expect(res.status, res.text).toBe(200);
  track("contract_templates", res.body.template.id);
  return res.body.template;
}

/** Бодит урсгалаар: байршуулах хаяг аваад, байтуудаа PUT-ээр тавина. */
async function uploadDocx(admin: TestClient, id: string, docx: Buffer): Promise<Template> {
  const ask = await admin.post<{ path: string; signedUrl: string }>("/api/admin/contracts/upload", {
    size: docx.length,
  });
  expect(ask.status, ask.text).toBe(200);
  trackStorageObject("contracts", ask.body.path);

  const put = await fetch(ask.body.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    body: new Uint8Array(docx),
  });
  expect(put.ok, `storage PUT ${put.status}`).toBe(true);

  const saved = await admin.put<{ template: Template }>(`/api/admin/contracts/${id}`, {
    filePath: ask.body.path,
    fileName: "гэрээ.docx",
    fileSize: docx.length,
  });
  expect(saved.status, saved.text).toBe(200);
  return saved.body.template;
}

describe("гэрээний загвар — хандах эрх", () => {
  it("нэвтрээгүй зочин, багш, зөвхөн харах эрхийг няцаана", async () => {
    const anon = anonClient();
    expect((await anon.get("/api/admin/contracts")).status).toBe(401);
    expect((await anon.post("/api/admin/contracts", { title: "x" })).status).toBe(401);

    const viewer = await adminClient("viewer");
    expect((await viewer.post("/api/admin/contracts", { title: "x" })).status).toBe(401);

    const owner = await adminClient("full");
    const teacher = await staffClient(owner, {
      name: "Тест багш",
      username: `contract-teacher-${Date.now()}`,
      password: "Test1234!",
      role: "teacher",
    });
    track("admin_users", teacher.id);
    expect((await teacher.client.post("/api/admin/contracts", { title: "x" })).status).toBe(401);
    expect((await teacher.client.post("/api/admin/contracts/upload", { size: 100 })).status).toBe(401);
  });

  it("нэргүй гэрээ үүсгэхгүй", async () => {
    const admin = await adminClient("full");
    expect((await admin.post("/api/admin/contracts", { title: "   " })).status).toBe(400);
  });
});

describe("Word загвар байршуулах", () => {
  it("файл доторх тагуудыг өөрөө олж жагсаана", async () => {
    const admin = await adminClient("full");
    const template = await createTemplate(admin);
    // Тагийг Word шиг хоёр хуваасан — сервер нийлүүлж уншиж чадах ёстой.
    const saved = await uploadDocx(admin, template.id, makeDocx(["Сурагч: {сурагчийн", "_нэр}, {анги}"]));

    expect(saved.tags.map((t) => t.tag)).toEqual(["сурагчийн_нэр", "анги"]);
    expect(saved.fileName).toBe("гэрээ.docx");
  });

  it("өөрсдийн үүсгээгүй замыг хүлээж авахгүй", async () => {
    const admin = await adminClient("full");
    const template = await createTemplate(admin);
    const res = await admin.put(`/api/admin/contracts/${template.id}`, {
      filePath: "../../lesson-notes/notes/whatever.pdf",
    });
    expect(res.status).toBe(400);
  });

  it("файлаа солиход өмнөх зураглал хадгалагдана", async () => {
    const admin = await adminClient("full");
    const template = await createTemplate(admin);
    await uploadDocx(admin, template.id, makeDocx(["{нэр} {утас}"]));
    await admin.put(`/api/admin/contracts/${template.id}`, {
      tags: [
        { tag: "нэр", field: "student.fullName" },
        { tag: "утас", field: "student.phone" },
      ],
    });

    // Шинэ файлд "утас" алга болж, "хаяг" нэмэгдлээ.
    const saved = await uploadDocx(admin, template.id, makeDocx(["{нэр} {хаяг}"]));
    expect(saved.tags).toEqual([
      { tag: "нэр", field: "student.fullName" },
      { tag: "хаяг" },
    ]);
  });
});

describe("гэрээ бөглөх", () => {
  it("сонгосон сурагчийн мэдээллээр бөглөгдсөн Word буцаана", async () => {
    const admin = await adminClient("full");
    const course = await createTestCourse({ title: "C ангилал сургалт", price: "1,200,000₮" });
    const student = await createTestUser();
    const registration = await createTestRegistration({
      userId: student.id,
      programId: course.id,
      programLabel: course.title,
      price: "1,200,000₮",
      status: "active",
    });
    // Эцэг эхийн нэрийг админ бөглөсөн гэж үзье.
    await testDb().from("users").update({ parent_name: "Дорж" }).eq("id", student.id);

    const template = await createTemplate(admin, "1 жилийн гэрээ");
    await uploadDocx(admin, template.id, makeDocx(["{сурагч} / {эцэг} / {төлбөр} / {дугаар} / {дутуу}"]));
    await admin.put(`/api/admin/contracts/${template.id}`, {
      programIds: [course.id],
      tags: [
        { tag: "сурагч", field: "student.fullName" },
        { tag: "эцэг", field: "parent.name" },
        { tag: "төлбөр", field: "registration.totalDue" },
        { tag: "дугаар", field: "system.contractNumber" },
        // "дутуу" нь зориуд холбоогүй — хоосон үлдэх ёстой.
      ],
    });

    // TestClient нь хариуг текстээр уншдаг тул хоёртын файлыг түүхий fetch-ээр
    // авна — cookie-г нь зээлээд.
    const res = await fetch(`${BASE_URL}/api/admin/contracts/${template.id}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `admin_session=${admin.getCookie("admin_session")}`,
      },
      body: JSON.stringify({ registrationId: registration.id }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(res.headers.get("content-type")).toContain("wordprocessingml");

    const filled = Buffer.from(await res.arrayBuffer());
    const text = textOf(filled);
    expect(text).toContain(`${student.lastName} ${student.firstName}`);
    expect(text).toContain("Дорж");
    expect(text).toContain("1,200,000₮");
    expect(text).toContain(registration.id.replace(/-/g, "").slice(0, 8).toUpperCase());
    // Холбоогүй таг нь "undefined" биш, хоосон.
    expect(text).not.toContain("undefined");
  });

  it("файл байршуулаагүй загвараас гэрээ үүсгэхгүй", async () => {
    const admin = await adminClient("full");
    const template = await createTemplate(admin);
    const res = await admin.post(`/api/admin/contracts/${template.id}/generate`, {
      registrationId: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBe(404);
  });
});
