import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { ContractDocxError, readTemplateTags, renderContract } from "@/lib/contracts/docx";

/**
 * Word файлыг таг-аар бөглөх механизм.
 *
 * Хамгийн чухал баталгаа нь ХУВААГДСАН таг: Word нь `{сурагч}` гэсэн бичвэрийг
 * үсэг шалгагч, форматаас болоод дотроо хэд хэдэн <w:t> болгон хуваачихдаг.
 * Энэ тест яг тэр хэлбэрийг гараар үүсгэж, зөв уншигдаж, зөв солигдож байгааг
 * шалгана — энгийн текст солилт энд унана.
 */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

/** `runs` бүр нэг <w:t> болно — тагийг санаатай хуваахад ашиглана. */
function makeDocx(runs: string[]): Buffer {
  const body = runs.map((text) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`).join("");
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>${body}</w:p></w:body></w:document>`;
  const zip = new PizZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", RELS);
  zip.folder("word")!.file("document.xml", document);
  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

/** Бөглөсөн файлаас уншигдах бүтэн текст. */
function textOf(buffer: Buffer): string {
  const xml = new PizZip(buffer).file("word/document.xml")!.asText();
  return xml.replace(/<[^>]+>/g, "").trim();
}

describe("Word загвараас таг унших", () => {
  it("нэг мөрөнд бичигдсэн тагуудыг олно", () => {
    const docx = makeDocx(["Сурагч: {student_name}, анги: {grade}"]);
    expect(readTemplateTags(docx)).toEqual(["student_name", "grade"]);
  });

  it("Word-ийн хуваасан тагийг нийлүүлж уншина", () => {
    // Яг ийм байдлаар Word файлыг хадгалдаг: нэг таг хоёр run болж хуваагдана.
    const docx = makeDocx(["Сурагч: {student", "_name}, төлбөр: {total}"]);
    expect(readTemplateTags(docx)).toEqual(["student_name", "total"]);
  });

  it("давхардсан тагийг нэг л удаа буцаана", () => {
    const docx = makeDocx(["{name} ... {name} ... {phone}"]);
    expect(readTemplateTags(docx)).toEqual(["name", "phone"]);
  });

  it("давталтын бүтцийн тагуудыг алгасна", () => {
    // {#...} {/...} нь утга биш, бүтэц — талбартай холбох боломжгүй.
    const docx = makeDocx(["{#lessons}{topic}{/lessons}"]);
    expect(readTemplateTags(docx)).toEqual(["topic"]);
  });

  it("Word биш файлыг ойлгомжтой алдаагаар няцаана", () => {
    expect(() => readTemplateTags(Buffer.from("энэ бол zip ч биш"))).toThrow(
      /\.docx хэлбэртэй эсэхийг шалгана уу/
    );
  });

  it("зөв .docx доторх тагийн алдааг «файл биш» гэж андуурахгүй", () => {
    // Түүхий тагийг догол мөрийн дунд тавихыг docxtemplater зөвшөөрдөггүй.
    // Ийм үед файл нь бүрэн бүтэн тул эзэнд тагийн алдаа гэж хэлэх ёстой.
    const docx = makeDocx(["Өмнөх текст {@raw} дараах текст"]);
    expect(() => readTemplateTags(docx)).toThrow(ContractDocxError);
    expect(() => readTemplateTags(docx)).not.toThrow(/\.docx хэлбэртэй/);
    expect(() => readTemplateTags(docx)).toThrow(/тагт алдаа байна/);
  });
});

describe("гэрээ бөглөх", () => {
  it("хуваагдсан тагийг ч зөв утгаар солино", () => {
    const docx = makeDocx(["Сурагч: {student", "_name}, анги: {grade}"]);
    const filled = renderContract(docx, { student_name: "Батсайхан Үлмэдэх", grade: "6-р анги" });
    expect(textOf(filled)).toBe("Сурагч: Батсайхан Үлмэдэх, анги: 6-р анги");
  });

  it("утга өгөөгүй тагийг хоосон үлдээнэ, алдаа шидэхгүй", () => {
    // Систем дээр байхгүй талбарыг гараар бөглөх мөр болгож үлдээнэ —
    // гэрээг огт үүсгэхгүй байхаас дээр.
    const docx = makeDocx(["Эцэг эх: {parent_name}. Утас: {phone}"]);
    const filled = renderContract(docx, { phone: "99001122" });
    expect(textOf(filled)).toBe("Эцэг эх: . Утас: 99001122");
  });

  it("гаралт нь дахин уншигдах бүрэн .docx хэвээр байна", () => {
    const filled = renderContract(makeDocx(["{a} ба {b}"]), { a: "нэг", b: "хоёр" });
    // Бөглөсний дараа таг үлдээгүй тул дахин уншихад хоосон жагсаалт гарна.
    expect(readTemplateTags(filled)).toEqual([]);
    expect(textOf(filled)).toBe("нэг ба хоёр");
  });
});
