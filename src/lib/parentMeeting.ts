/**
 * Багштай хийх ганцаарчилсан уулзалтын цаг.
 *
 * Түвшин тогтоох цагаас (placementBooking.ts) гурван зүйлээр ялгаатай:
 *
 * 1. Уулзалт 20 минут ч цагууд 30 минутын алхамтай — багш хооронд нь
 *    амарч, өмнөх уулзалт уртасвал дараагийнх нь хойшлохгүй.
 * 2. Цагууд ангиудын хуваариас гардаггүй, тогтмол цонхтой: өглөө 09:00–13:00,
 *    үдээс хойш 14:00–18:00. Дунд нь цайны цаг.
 * 3. Нэг цагийг нэг л гэр бүл авна. Түвшин тогтоолтод нэг цагт хэд хэдэн
 *    хүүхэд ирж болдог байсан бол энд багш нэг гэр бүлтэй ганцаарчлан ярина.
 */

/** Уулзалтын урт — эзний зарласан 20 минут. */
export const MEETING_MINUTES = 20;

/** Хоёр уулзалтын эхлэлийн хоорондох зай. Зөрүү нь багшийн амрах зав. */
export const SLOT_STEP_MINUTES = 30;

/** Уулзалт болох цонхнууд, [эхлэл, төгсгөл) минутаар. */
const WINDOWS: [string, string][] = [
  ["09:00", "13:00"],
  ["14:00", "18:00"],
];

function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function toClock(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

/**
 * Өдрийн бүх цаг: "09:00–09:20", "09:30–09:50", …
 *
 * Шошго нь уулзалтын БОДИТ урттай — "09:00–09:30" гэвэл эцэг эх 30 минут
 * ярина гэж ойлгоно. Дараагийнх нь 09:30-д эхэлнэ.
 */
export function meetingSlots(): string[] {
  const slots: string[] = [];
  for (const [from, to] of WINDOWS) {
    const end = toMinutes(to);
    for (let at = toMinutes(from); at + MEETING_MINUTES <= end; at += SLOT_STEP_MINUTES) {
      slots.push(`${toClock(at)}–${toClock(at + MEETING_MINUTES)}`);
    }
  }
  return slots;
}

/** Ирсэн цаг сүлжээнд байгаа эсэх — сервер талд шалгахад. */
export function isMeetingSlot(slot: string): boolean {
  return meetingSlots().includes(slot);
}

/** Улаанбаатар UTC+8, зуны цагийн шилжилтгүй. */
const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Улаанбаатарын өнөөдөр, YYYY-MM-DD. */
export function todayInUb(now = new Date()): string {
  return new Date(now.getTime() + UB_OFFSET_MS).toISOString().slice(0, 10);
}

/** "2026-10-06" → "10.06 Мягмар". */
const DAY_NAMES = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];

export function meetingDayLabel(date: string): string {
  const at = new Date(`${date}T00:00:00.000Z`);
  return `${date.slice(5).replace("-", ".")} ${DAY_NAMES[at.getUTCDay()] ?? ""}`.trim();
}

/**
 * Захиалж болох өдөр эсэх — өнгөрсөн өдрийг санал болгохгүй.
 *
 * Өнөөдрийг үлдээнэ: багш өглөө нь өдрөө нээгээд үдээс хойших цагаа
 * дүүргэх нь бодитой хэрэгцээ.
 */
export function isBookableDay(date: string, now = new Date()): boolean {
  return date >= todayInUb(now);
}

/* -------------------------------------------------------------------------
 * Эцэг эхэд очих SMS
 * ---------------------------------------------------------------------- */

/** Гарагийн нэр латинаар — getUTCDay()-ийн дарааллаар (Ням = 0). */
const DAY_NAMES_LATIN = ["Nyam", "Davaa", "Myagmar", "Lhagva", "Purev", "Baasan", "Byamba"];

/**
 * Уулзалт баталгаажсаныг мэдэгдэх SMS-ийн бичвэр.
 *
 * Латинаар: Skytel кирилл үсгийг эвддэг (lib/otp.ts). Нэг SMS-д (160
 * тэмдэгт) багтах ёстой. Цагийн en dash-ийг энгийн зураас болгоно — GSM-7
 * кодчилолд en dash байхгүй тул тэр ганц тэмдэгт бүх мессежийг UCS-2 рүү
 * шилжүүлж, 70 тэмдэгтэд хуваагдах шалтгаан болно.
 */
export function meetingSmsText(date: string, slot: string): string {
  const at = new Date(`${date}T00:00:00.000Z`);
  const day = DAY_NAMES_LATIN[at.getUTCDay()] ?? "";
  const when = `${date.slice(5).replace("-", ".")} ${day} ${slot.replace("–", "-")}`;
  return (
    `Bagshtai uulzah tsag batalgaajlaa: ${when}. Chonon burt tuv, 403 toot. ` +
    `Ireh bolomjgui bol gmath.mn-ees tsagaa tsutsalna uu.`
  );
}

/**
 * SMS хэнд очих вэ.
 *
 * Эцэг эхийн утас бөглөсөн бол тийшээ — уулзалт эцэг эхтэй хийгддэг.
 * Бөглөөгүй бол аккаунтын утас руу: gmath-д аккаунтыг ихэвчлэн эцэг эх
 * өөрсдөө бүртгүүлдэг тул тэр нь өөрөө эцэг эхийн утас байдаг (2026-09-29-ний
 * байдлаар жилийн хөтөлбөрийн 83 хэрэглэгчээс 6 нь л parent_phone бөглөсөн,
 * тэрнээс 5 нь аккаунтын утастайгаа ижил). Бөглөсөн утас 8 оронтой биш бол
 * алдаатай гэж үзээд аккаунтын утсыг ашиглана.
 */
export function meetingSmsRecipient(user: { phone: string; parentPhone?: string }): string {
  const parent = (user.parentPhone ?? "").replace(/\D/g, "");
  return parent.length === 8 ? parent : user.phone;
}

/* -------------------------------------------------------------------------
 * Онлайн уулзалт
 * ---------------------------------------------------------------------- */

/**
 * Уулзалтын хэлбэр. Онлайн уулзалт өдөр бүрийн нэг Zoom өрөөнд болно:
 * багш тэндээ байж, гэр бүл бүр цагаараа орж ирээд гарна. Өрөө нь
 * хүлээлгийн өрөөтэй — дараагийн гэр бүл эрт орвол өмнөх хүүхдийн дүнгийн
 * яриаг сонсохгүй, багш нэг нэгээр нь оруулна.
 */
export type MeetingMode = "in_person" | "online";

export function isMeetingMode(value: unknown): value is MeetingMode {
  return value === "in_person" || value === "online";
}

/**
 * Онлайн уулзалтын SMS.
 *
 * Zoom холбоос БИЧИХГҮЙ: хичээлтэй адил гэр бүл сайтад нэвтэрч "Zoom-оор
 * орох" дарахад л сервер хувийн холбоос руу нь шилжүүлнэ. SMS-ээр явсан
 * холбоосыг хэн ч дамжуулж болно, мөн тэр нь цагийг цуцалсан ч ажилласаар
 * үлдэнэ.
 */
export function onlineMeetingSmsText(date: string, slot: string): string {
  const at = new Date(`${date}T00:00:00.000Z`);
  const day = DAY_NAMES_LATIN[at.getUTCDay()] ?? "";
  const when = `${date.slice(5).replace("-", ".")} ${day} ${slot.replace("–", "-")}`;
  return (
    `Bagshtai online uulzalt batalgaajlaa: ${when}. ` +
    `Tsagtaa gmath.mn-d nevtreed "Zoom-oor oroh" deer darna uu.`
  );
}

/** Zoom өрөөний гарчиг — багшийн Zoom жагсаалтад харагдана. */
export function meetingRoomTopic(date: string): string {
  return `Багштай уулзалт — ${meetingDayLabel(date)}`;
}

/** Өрөө бүтэн өдөр нээлттэй: 09:00-оос 18:00 хүртэл. */
export function meetingRoomSchedule(date: string): { startTime: string; durationMinutes: number } {
  return { startTime: `${date}T09:00:00`, durationMinutes: 9 * 60 };
}
