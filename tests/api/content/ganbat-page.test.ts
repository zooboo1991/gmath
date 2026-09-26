/**
 * Багшийн танилцуулга — /teacher байсан нь /ganbat болсон.
 *
 * Хуудасны хаяг өөрчлөгдөхөд хамгийн их эрсдэлтэй нь хуучин линк:
 * Facebook пост, Google-ийн индекс, Messenger-ийн цэс бүгд /teacher рүү
 * заасаар байгаа. Тиймээс шинэ хаяг ажиллаж байгааг төдийгүй хуучин
 * хаягууд УНАХГҮЙ байгааг барина.
 */

import { describe, expect, it } from "vitest";
import { anonClient } from "../../support/client";

describe("Б.Ганбат багшийн танилцуулга", () => {
  it("/ganbat хаягаар нээгдэнэ", async () => {
    const res = await anonClient().get("/ganbat");
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.text).toContain("Дархан аварга");
  });

  it("хуучин /teacher линк шинэ хаяг руу байнгын шилжилт хийнэ", async () => {
    const res = await anonClient().get("/teacher");
    // 308 — хайлтын систем хуучин хаягийг шинээр солино.
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/ganbat");
  });

  it("/team/ganbat ч шинэ хаяг руу шууд очно", async () => {
    const res = await anonClient().get("/team/ganbat");
    expect(res.status).toBe(308);
    // Хоёр дамжлагагүй: /teacher дундуур биш, шууд.
    expect(res.headers.get("location")).toBe("/ganbat");
  });

  it("sitemap шинэ хаягийг өгнө, хуучныг биш", async () => {
    const res = await anonClient().get("/sitemap.xml");
    expect(res.text).toContain("/ganbat");
    expect(res.text).not.toContain("/teacher");
  });
});
