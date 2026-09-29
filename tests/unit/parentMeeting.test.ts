/**
 * Багштай уулзах цагийн сүлжээ.
 *
 * Цаг нь гараар бичсэн жагсаалт биш, тооцоолж гаргадаг тул хилийн
 * тохиолдлуудыг барих нь чухал: 13:00-д уулзалт эхлэхгүй, сүүлийн уулзалт
 * 18:00-аас хэтрэхгүй.
 */

import { describe, expect, it } from "vitest";
import {
  MEETING_MINUTES,
  SLOT_STEP_MINUTES,
  isBookableDay,
  isMeetingSlot,
  meetingDayLabel,
  meetingSlots,
  meetingSmsRecipient,
  meetingSmsText,
  onlineMeetingSmsText,
} from "@/lib/parentMeeting";

describe("уулзалтын цагууд", () => {
  const slots = meetingSlots();

  it("өдөрт 16 цаг — өглөө 8, үдээс хойш 8", () => {
    expect(slots).toHaveLength(16);
    expect(slots.filter((s) => s < "13").length).toBe(8);
    expect(slots.filter((s) => s >= "14").length).toBe(8);
  });

  it("эхлэл, төгсгөл нь зарласан цонхонд багтана", () => {
    expect(slots[0]).toBe("09:00–09:20");
    expect(slots[7]).toBe("12:30–12:50");
    expect(slots[8]).toBe("14:00–14:20");
    expect(slots[15]).toBe("17:30–17:50");
  });

  it("цайны цагт уулзалт байхгүй", () => {
    // 13:00–14:00 хооронд эхлэх ч, дуусах ч цаг байх ёсгүй.
    for (const slot of slots) {
      const [from, to] = slot.split("–");
      expect(from >= "13:00" && from < "14:00", slot).toBe(false);
      expect(to > "13:00" && to <= "14:00", slot).toBe(false);
    }
  });

  it("уулзалт 20 минут, эхлэлүүд 30 минутын зайтай", () => {
    const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    for (const slot of slots) {
      const [from, to] = slot.split("–");
      expect(min(to) - min(from), slot).toBe(MEETING_MINUTES);
    }
    // Өглөөний эхний хоёр нь алхмыг харуулна.
    expect(min(slots[1].slice(0, 5)) - min(slots[0].slice(0, 5))).toBe(SLOT_STEP_MINUTES);
  });

  it("давхардсан цаг байхгүй", () => {
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("сүлжээнд байхгүй цагийг татгалзана", () => {
    expect(isMeetingSlot("09:00–09:20")).toBe(true);
    expect(isMeetingSlot("13:00–13:20")).toBe(false);
    expect(isMeetingSlot("17:40–18:00")).toBe(false);
    expect(isMeetingSlot("09:00-09:20")).toBe(false); // энгийн зураас
    expect(isMeetingSlot("")).toBe(false);
  });
});

describe("өдөр", () => {
  // 2026-10-06 бол Мягмар.
  const now = new Date("2026-10-06T04:00:00Z");

  it("өнгөрсөн өдрийг санал болгохгүй, өнөөдрийг үлдээнэ", () => {
    expect(isBookableDay("2026-10-05", now)).toBe(false);
    expect(isBookableDay("2026-10-06", now)).toBe(true);
    expect(isBookableDay("2026-10-07", now)).toBe(true);
  });

  it("Улаанбаатарын өдрөөр тоолно", () => {
    // UTC-гаар 2026-10-05 23:00 ч УБ-д аль хэдийн 10-06 болсон.
    expect(isBookableDay("2026-10-06", new Date("2026-10-05T23:00:00Z"))).toBe(true);
  });

  it("гарагийн нэрийг хавсаргана", () => {
    expect(meetingDayLabel("2026-10-06")).toBe("10.06 Мягмар");
  });
});

describe("эцэг эхэд очих SMS", () => {
  it("нэг SMS-д багтана — өдөр бүрийн хамгийн урт нэр ч", () => {
    // Долоо хоногийн бүх гараг: 2026-10-04 Ням … 10-10 Бямба.
    for (let d = 4; d <= 10; d += 1) {
      const text = meetingSmsText(`2026-10-${String(d).padStart(2, "0")}`, "17:30–17:50");
      expect(text.length, text).toBeLessThanOrEqual(160);
    }
  });

  it("зөвхөн ASCII — кирилл, en dash байхгүй", () => {
    // Нэг ч ASCII бус тэмдэгт мессежийг UCS-2 рүү шилжүүлж 70 тэмдэгтээр хуваана.
    const text = meetingSmsText("2026-10-06", "10:00–10:20");
    expect(/^[\x20-\x7e]*$/.test(text), text).toBe(true);
  });

  it("өдөр, гараг, цагийг агуулна", () => {
    const text = meetingSmsText("2026-10-06", "10:00–10:20");
    expect(text).toContain("10.06 Myagmar 10:00-10:20");
  });

  it("эцэг эхийн утас бөглөсөн бол тийшээ илгээнэ", () => {
    expect(meetingSmsRecipient({ phone: "88112233", parentPhone: "99445566" })).toBe("99445566");
    // Зай, зураастай бичсэн ч танина.
    expect(meetingSmsRecipient({ phone: "88112233", parentPhone: "9944-5566" })).toBe("99445566");
  });

  it("эцэг эхийн утас хоосон эсвэл алдаатай бол аккаунтын утас руу", () => {
    expect(meetingSmsRecipient({ phone: "88112233" })).toBe("88112233");
    expect(meetingSmsRecipient({ phone: "88112233", parentPhone: "" })).toBe("88112233");
    expect(meetingSmsRecipient({ phone: "88112233", parentPhone: "12345" })).toBe("88112233");
  });
});

describe("онлайн уулзалтын SMS", () => {
  it("Zoom холбоос агуулахгүй, сайт руу чиглүүлнэ", () => {
    // Хичээлтэй адил: холбоосыг зөвхөн сайтаас дарахад өгнө.
    const text = onlineMeetingSmsText("2026-10-06", "10:00–10:20");
    expect(text).not.toMatch(/https?:|zoom\.us/);
    expect(text).toContain("gmath.mn");
    expect(text).toContain("10.06 Myagmar 10:00-10:20");
  });

  it("нэг SMS-д багтана, зөвхөн ASCII", () => {
    for (let d = 4; d <= 10; d += 1) {
      const text = onlineMeetingSmsText(`2026-10-${String(d).padStart(2, "0")}`, "17:30–17:50");
      expect(text.length, text).toBeLessThanOrEqual(160);
      expect(/^[\x20-\x7e]*$/.test(text), text).toBe(true);
    }
  });
});
