import { describe, expect, it } from "vitest";
import {
  filledTemplate,
  parseAnswerTemplate,
  validateAnswerTemplate,
} from "@/lib/assessment/answerTemplate";

/**
 * Загварын задлал. Гол амлалт: хаалтан доторх зөв утга сурагчид харагдах
 * хэлбэрт хэзээ ч үлдэхгүй.
 */

describe("загвар задлах", () => {
  it("нүдний утгуудыг дарааллаар нь салгана", () => {
    const t = parseAnswerTemplate("[9]a^{[10]}b^{[6]}");
    expect(t.values).toEqual(["9", "10", "6"]);
  });

  it("харагдах хэлбэрт зөв утга үлдэхгүй", () => {
    const t = parseAnswerTemplate("[9]a^{[10]}b^{[6]}");
    expect(t.display).toBe("{\\square_{1}}a^{{\\square_{2}}}b^{{\\square_{3}}}");
    for (const secret of ["9", "10", "6"]) expect(t.display).not.toContain(secret);
  });

  it("тогтмол хэсгүүд хэвээр үлдэнэ", () => {
    const t = parseAnswerTemplate("[3]n+[5]");
    expect(t.display).toBe("{\\square_{1}}n+{\\square_{2}}");
    expect(t.parts.filter((p) => p.kind === "latex").map((p) => (p as { text: string }).text)).toEqual([
      "n+",
    ]);
  });

  it("бутархай коэффициенттэй илэрхийллийг барина", () => {
    const t = parseAnswerTemplate("-\\frac{[4]}{[5]}x^{[4]}z^{[2]}");
    expect(t.values).toEqual(["4", "5", "4", "2"]);
    expect(t.display).toContain("\\frac{{\\square_{1}}}{{\\square_{2}}}");
  });

  it("үсэг ч нүдний утга болж чадна", () => {
    // c^n мэтийн хариултад зэрэг нь тоо биш үсэг байна.
    const t = parseAnswerTemplate("c^{[n]}");
    expect(t.values).toEqual(["n"]);
  });

  it("нүдгүй загварыг хоосон утгатай гэж үзнэ", () => {
    expect(parseAnswerTemplate("x+1").values).toEqual([]);
  });
});

describe("бүтэн хариулт сэргээх", () => {
  it("багшид харагдах хэлбэр", () => {
    expect(filledTemplate("[9]a^{[10]}b^{[6]}")).toBe("9a^{10}b^{6}");
    expect(filledTemplate("[3]n+[5]")).toBe("3n+5");
  });
});

describe("загварын шалгалт", () => {
  it("зөв загварыг хүлээж авна", () => {
    for (const good of ["[9]a^{[10]}b^{[6]}", "[3]n+[5]", "c^{[n]}", "-\\frac{[4]}{[5]}x^{[4]}"]) {
      expect(validateAnswerTemplate(good), good).toEqual({ ok: true });
    }
  });

  it("нүдгүй загварыг няцаана", () => {
    const res = validateAnswerTemplate("9a^{10}");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("нөхөгдөх хэсэг");
  });

  it("хоосон хаалтыг няцаана", () => {
    const res = validateAnswerTemplate("[9]a^{[]}");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Хоосон хаалт");
  });

  it("тэнцээгүй хаалтыг няцаана", () => {
    const res = validateAnswerTemplate("[9]a^{[10}");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Хаалт");
  });

  it("үүрлэсэн хаалтыг няцаана — зөв утга харагдацад үлдэхээс сэргийлнэ", () => {
    // Тоогоороо тэнцүү ч бүтцээрээ буруу: "[a[b]c]" нь a, c-г харагдацад
    // үлдээж, багшийн нууц хариултын хэсгийг задруулж болзошгүй.
    for (const bad of ["[a[b]c]", "[[9]]", "x[[1]2]y"]) {
      const res = validateAnswerTemplate(bad);
      expect(res.ok, bad).toBe(false);
    }
  });

  it("зөв загварын харагдацад хаалт үлдэхгүй", () => {
    for (const good of ["[9]a^{[10]}b^{[6]}", "[3]n+[5]", "c^{[n]}"]) {
      expect(parseAnswerTemplate(good).display).not.toMatch(/[[\]]/);
    }
  });

  it("хоосон загварыг няцаана", () => {
    expect(validateAnswerTemplate("   ").ok).toBe(false);
  });

  it("хэт олон нүдийг няцаана", () => {
    expect(validateAnswerTemplate("[1][2][3][4][5][6][7]").ok).toBe(false);
  });
});


describe("LaTeX-ийн өөрийн хаалтаас хамгаалах", () => {
  it("\\sqrt[3] мэт заагчийг нүд гэж уншихыг няцаана", () => {
    // Ороосон бол зэргийн үзүүлэлт нууц утга болоод, √⬚⬚ гэж буруу зурагдана.
    const res = validateAnswerTemplate("\\sqrt[3]{[5]}");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("LaTeX");
  });

  it("завсрын тэмдэглэгээг нүд гэж уншихыг няцаана", () => {
    // "\\in[" нь LaTeX-ийн дүрмээр, "[0;5]x" нь утгын дүрмээр баригдана —
    // хоёр өөр шалтгаан ч аль ч тохиолдолд сурагч буруу зүйл харахгүй.
    expect(validateAnswerTemplate("[2]x\\in[0;5]").ok).toBe(false);
    const res = validateAnswerTemplate("[0;5]x");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("нэг утга");
  });

  it("нүдний утга зайтай байхыг зөвшөөрөхгүй", () => {
    expect(validateAnswerTemplate("[3 1/2]x").ok).toBe(false);
  });

  it("нүдний тэмдэглэгээ бүлэгт ороосон тул дугаар нь салахгүй", () => {
    // "x^[2]" гэж ороолгүй бичихэд дугаар нь x дээр буудаг байсан.
    expect(parseAnswerTemplate("x^[2]").display).toBe("x^{\\square_{1}}");
  });
});
