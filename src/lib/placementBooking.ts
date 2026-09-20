import { parseWeeklySchedule } from "./weeklySchedule";

/**
 * Танхимд ирж түвшин тогтоолгох цаг захиалах.
 *
 * Нүднүүд нь тусдаа тохиргоо биш — сонгоны ангиудын долоо хоногийн хуваариас
 * гардаг. Багш хуваариа өөрчлөхөд захиалгын цаг өөрөө дагана, хоёр газар
 * тааруулж суух шаардлагагүй.
 *
 * Хуваарь нь "Даваа 10:30–12:30" гэсэн мөрүүд. Түүнийг нэг цагийн нүд болгож
 * хуваана: 10:30–11:30, 11:30–12:30. Сүүлийн бүтэн цаг багтахгүй бол
 * хаягдана — 45 минутын уулзалт санал болгох нь эзний хэлснээс өөр.
 */

/** Монгол гарагийн нэр → JS-ийн `getDay()` (Ням = 0). */
const DAY_INDEX: Record<string, number> = {
  Ням: 0,
  Даваа: 1,
  Мягмар: 2,
  Лхагва: 3,
  Пүрэв: 4,
  Баасан: 5,
  Бямба: 6,
};

/** Жагсаалтад харуулах дараалал — долоо хоног Даваагаар эхэлнэ. */
export const DAY_ORDER = ["Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"];

/**
 * Түвшин тогтоолгох төлбөр.
 *
 * Цаг захиалахад төлж баталгаажуулна. Сонгоны ангид бүртгүүлэхэд тэр мөнгө
 * эхний төлөлтөөс хасагдана — тэгэхээр энэ нь нэмэлт зардал биш, урьдчилж
 * төлсөн хэсэг. Ирээгүй ч, цагаа болиулсан ч хөнгөлөлт хэвээр үлдэнэ.
 */
export const PLACEMENT_FEE = 20000;

const SLOT_MINUTES = 60;

function toMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function toClock(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

/**
 * "10:30–12:30" → ["10:30–11:30", "11:30–12:30"].
 *
 * Хуваарьт en dash (–) хэрэглэдэг ч гараар бичихэд энгийн зураас (-) орох нь
 * бий, тиймээс хоёуланг нь хүлээж авна.
 */
export function splitIntoHours(range: string): string[] {
  const parts = range.split(/[–—-]/);
  if (parts.length !== 2) return [];
  const from = toMinutes(parts[0]);
  const to = toMinutes(parts[1]);
  if (from === null || to === null || to <= from) return [];
  const slots: string[] = [];
  for (let at = from; at + SLOT_MINUTES <= to; at += SLOT_MINUTES) {
    slots.push(`${toClock(at)}–${toClock(at + SLOT_MINUTES)}`);
  }
  return slots;
}

export type DaySlots = { day: string; slots: string[] };

/**
 * Бүх сонгоны ангийн хуваариас гарах нэг цагийн нүднүүд, гараг тус бүрээр.
 *
 * Ангиуд өөр өөр цагтай тул нэг гарагт хэд хэдэн ангийн цаг нийлнэ — жишээ нь
 * баасан гарагт дөрвөн анги 09:00–18:00-ыг хооронд нь хуваадаг. Давхардсаныг
 * нэгтгэж, цагаар нь эрэмбэлнэ.
 */
export function buildAssessmentSlots(
  courses: { weeklySchedule?: string }[]
): DaySlots[] {
  const byDay = new Map<string, Set<string>>();
  for (const course of courses) {
    for (const { day, time } of parseWeeklySchedule(course.weeklySchedule)) {
      if (!(day in DAY_INDEX)) continue;
      for (const slot of splitIntoHours(time)) {
        const set = byDay.get(day) ?? new Set<string>();
        set.add(slot);
        byDay.set(day, set);
      }
    }
  }
  return DAY_ORDER.filter((day) => byDay.has(day)).map((day) => ({
    day,
    slots: [...byDay.get(day)!].sort(),
  }));
}

export type BookableDay = { date: string; day: string; label: string; slots: string[] };

/** Хэдэн хоногийн дараах өдрүүдийг санал болгох вэ. */
export const BOOKING_WINDOW_DAYS = 14;

/** Улаанбаатар UTC+8, зуны цагийн шилжилтгүй. */
const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Улаанбаатарын өнөөдөр, YYYY-MM-DD. */
export function todayInUb(now = new Date()): string {
  return new Date(now.getTime() + UB_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Маргаашаас эхлэн хоёр долоо хоногийн дотор захиалж болох өдрүүд.
 *
 * Өнөөдрийг санал болгохгүй: эцэг эх маргааш ирэхээр төлөвлөж захиалдаг, мөн
 * өнөөдрийн цаг аль хэдийн өнгөрсөн байж болно. Гарагт нь тохирох нүд
 * байхгүй бол өдөр нь огт харагдахгүй.
 */
export function bookableDays(slotsByDay: DaySlots[], now = new Date()): BookableDay[] {
  const byDay = new Map(slotsByDay.map((one) => [one.day, one.slots]));
  const days: BookableDay[] = [];
  const start = new Date(`${todayInUb(now)}T00:00:00.000Z`);
  for (let ahead = 1; ahead <= BOOKING_WINDOW_DAYS; ahead += 1) {
    const at = new Date(start.getTime() + ahead * 24 * 60 * 60 * 1000);
    const name = DAY_ORDER.find((day) => DAY_INDEX[day] === at.getUTCDay());
    if (!name) continue;
    const slots = byDay.get(name);
    if (!slots || slots.length === 0) continue;
    const date = at.toISOString().slice(0, 10);
    days.push({
      date,
      day: name,
      label: `${date.slice(5).replace("-", ".")} ${name}`,
      slots,
    });
  }
  return days;
}

/** Захиалга хүчинтэй эсэх — сервер талд, клиентийн илгээснийг шалгахад. */
export function isBookable(
  slotsByDay: DaySlots[],
  date: string,
  slot: string,
  now = new Date()
): boolean {
  return bookableDays(slotsByDay, now).some(
    (one) => one.date === date && one.slots.includes(slot)
  );
}
