import { describe, expect, it } from "vitest";
import { buildScheduleBundles } from "@/lib/weeklySchedule";

/**
 * Хуваарийн багцууд. Гол амлалт: дугаарлалт нэрийн дарааллаар тогтвортой,
 * хоосон хуваарьтай анги дугаар эзэлдэггүй.
 */

describe("хуваарийн багц угсрах", () => {
  it("нэрийн дарааллаар дугаарлана", () => {
    const bundles = buildScheduleBundles([
      { title: "Сонгон бэлтгэл — 6-р анги", weeklySchedule: "Мягмар 10:30–12:30" },
      { title: "Сонгон бэлтгэл — 5-р анги", weeklySchedule: "Даваа 14:30–16:30\nЛхагва 14:30–16:30" },
    ]);
    expect(bundles).toHaveLength(2);
    // 5-р анги нэрээрээ түрүүлж байгаа тул №1.
    expect(bundles[0].number).toBe(1);
    expect(bundles[0].slots).toEqual([
      { day: "Даваа", time: "14:30–16:30" },
      { day: "Лхагва", time: "14:30–16:30" },
    ]);
    expect(bundles[1].slots).toEqual([{ day: "Мягмар", time: "10:30–12:30" }]);
  });

  it("хоосон хуваарьтай анги дугаар эзлэхгүй", () => {
    // Хуваариа хараахан бөглөөгүй анги "Хуваарь №2 — хоосон" гэж
    // харагдвал эцэг эхэд юу ч хэлэхгүй тул алгасна.
    const bundles = buildScheduleBundles([
      { title: "А", weeklySchedule: "Даваа 10:00–12:00" },
      { title: "Б", weeklySchedule: "" },
      { title: "В", weeklySchedule: "Баасан 09:00–11:00" },
    ]);
    expect(bundles.map((b) => b.number)).toEqual([1, 2]);
    expect(bundles[1].slots[0].day).toBe("Баасан");
  });

  it("ижил хуваарьтай хоёр анги хоёулаа харагдана", () => {
    // Хоёр бүлэг ижил цагт хичээллэж болно — нэгтгэж болохгүй.
    const same = "Даваа 10:30–12:30\nЛхагва 10:30–12:30";
    const bundles = buildScheduleBundles([
      { title: "А", weeklySchedule: same },
      { title: "Б", weeklySchedule: same },
    ]);
    expect(bundles).toHaveLength(2);
  });

  it("хуваарьгүй бол хоосон жагсаалт", () => {
    expect(buildScheduleBundles([])).toEqual([]);
    expect(buildScheduleBundles([{ title: "А" }])).toEqual([]);
  });
});
