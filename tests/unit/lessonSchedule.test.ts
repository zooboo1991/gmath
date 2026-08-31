import { describe, expect, it } from "vitest";
import { formatTimeUntil, getLessonStates } from "@/lib/lessonSchedule";

const lesson = (date: string, time = "18:00–20:00") => ({
  topic: "Тоон онол",
  schedule: `${date} Даваа гараг · ${time}`,
});

/**
 * Хичээлийн цаг Монголын хананы цагаар (UTC+8) бичигдэнэ. Эдгээр тест нь
 * машины цагийн бүсээс үл хамааран ижил үр дүн өгөх ёстой — өмнө нь локал
 * цагаар тооцдог байсан тул сервер дээр 8 цагаар зөрдөг байв.
 */
describe("хичээлийн төлөв", () => {
  const at = (utc: string) => getLessonStates([lesson("2026.08.24")], new Date(utc))[0];

  it("эхлэхээс өмнө бол болоогүй", () => {
    // 18:00 Монголоор = 10:00 UTC. Гурван цагийн өмнө.
    expect(at("2026-08-24T07:00:00Z").state).toBe("upcoming");
  });

  it("эхлэхээс 15 минутын өмнөөс нээгдэнэ", () => {
    expect(at("2026-08-24T09:44:00Z").state).toBe("upcoming");
    expect(at("2026-08-24T09:46:00Z").state).toBe("live");
  });

  it("хичээлийн явцад амьд", () => {
    expect(at("2026-08-24T11:00:00Z").state).toBe("live");
  });

  it("дууссаны дараа өнгөрсөн", () => {
    // 20:00 Монголоор = 12:00 UTC.
    expect(at("2026-08-24T11:59:00Z").state).toBe("live");
    expect(at("2026-08-24T12:01:00Z").state).toBe("past");
  });

  it("огноо, цагийн шошгыг хуваарийн мөрөөс шууд авна", () => {
    const info = at("2026-08-24T07:00:00Z");
    expect(info.dateLabel).toBe("08-р сарын 24, Даваа");
    expect(info.timeLabel).toBe("18:00–20:00");
  });

  it("эхлэхэд үлдсэн хугацааг тооцно", () => {
    expect(at("2026-08-24T08:00:00Z").startsInMs).toBe(2 * 60 * 60 * 1000);
    // Эхэлсэн хичээл дээр сөрөг.
    expect(at("2026-08-24T11:00:00Z").startsInMs).toBeLessThan(0);
  });

  it("хуваарьгүй хичээлийг хугацаагүй үлдээнэ", () => {
    const [info] = getLessonStates([{ topic: "Огноогүй" }], new Date("2026-08-24T07:00:00Z"));
    expect(info.state).toBe("unscheduled");
    expect(info.startsInMs).toBeUndefined();
  });
});

describe("үлдсэн хугацааны бичиглэл", () => {
  const m = 60_000;
  const h = 60 * m;

  it("минутаар", () => {
    expect(formatTimeUntil(12 * m)).toBe("12 минут");
    expect(formatTimeUntil(59 * m)).toBe("59 минут");
  });

  it("цаг, минутаар", () => {
    expect(formatTimeUntil(5 * h + 20 * m)).toBe("5 цаг 20 минут");
    expect(formatTimeUntil(3 * h)).toBe("3 цаг");
  });

  it("хоногоор — минутыг нь хэлэхгүй", () => {
    expect(formatTimeUntil(3 * 24 * h + 4 * h + 13 * m)).toBe("3 хоног 4 цаг");
    expect(formatTimeUntil(2 * 24 * h)).toBe("2 хоног");
  });

  it("нэг минутаас багыг 1 минут гэнэ", () => {
    expect(formatTimeUntil(20_000)).toBe("1 минут");
  });

  it("өнгөрсөн хугацааг хоосон буцаана", () => {
    expect(formatTimeUntil(0)).toBe("");
    expect(formatTimeUntil(-5 * m)).toBe("");
  });
});
