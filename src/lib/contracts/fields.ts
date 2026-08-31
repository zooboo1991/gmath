import { formatCourseDate } from "../courseDate";
import { formatMnt } from "../price";
import type { PublicUser, Registration } from "../db";

/**
 * Гэрээний загварт тавьж болох талбарууд.
 *
 * Кодод сууж байгаагийн шалтгаан нь тестүүдтэй адил: талбарын НЭР, утгыг нь
 * хаанаас авах нь код, харин зөвхөн "аль таг аль талбартай холбогдсон" гэдэг
 * нь өгөгдөл. Ингэснээр шинэ талбар нэмэхэд миграци хэрэггүй.
 *
 * Мэдээллийн сангийн импортгүй тул админы браузерын код ч жагсаалтыг
 * шууд уншиж чадна.
 */

export type ContractFieldGroup = "student" | "parent" | "registration" | "program" | "system";

export const FIELD_GROUP_LABELS: Record<ContractFieldGroup, string> = {
  student: "Сурагч",
  parent: "Эцэг эх / асран хамгаалагч",
  registration: "Бүртгэл, төлбөр",
  program: "Сургалт",
  system: "Систем",
};

/** Гэрээ бөглөхөд хэрэгтэй бүх зүйл. Дутуу талбар хоосон мөр болно. */
export type ContractContext = {
  user: PublicUser;
  registration: Registration;
  /** Курс эсвэл жилийн хөтөлбөрөөс уншсан мэдээлэл. Мөр нь устсан бол undefined. */
  program?: {
    title: string;
    tag: string;
    period: string;
    startDate?: string;
    lessonCount: number;
    weeklySchedule?: string;
  };
  /** Бодит төлөлтөөс гарсан тоонууд — src/lib/registration.ts-ийн registrationBalance. */
  money: { due: number; paid: number; balance: number };
  now: Date;
};

export type ContractField = {
  key: string;
  label: string;
  group: ContractFieldGroup;
  /** Хоосон бол гэрээн дээр хоосон зай үлдэнэ — "undefined" гэж бичихгүй. */
  resolve: (ctx: ContractContext) => string;
};

const PAY_METHOD_LABELS: Record<string, string> = {
  qpay: "QPay",
  bank: "Дансаар",
  manual: "Гараар бүртгэсэн",
};

const MONTHS_MN = [
  "нэгдүгээр", "хоёрдугаар", "гуравдугаар", "дөрөвдүгээр", "тавдугаар", "зургаадугаар",
  "долоодугаар", "наймдугаар", "есдүгээр", "аравдугаар", "арван нэгдүгээр", "арван хоёрдугаар",
];

/** "2026 оны есдүгээр сарын 1" — албан ёсны бичиг баримтын хэлбэр. */
export function formatDateLongMn(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${y} оны ${MONTHS_MN[m - 1]} сарын ${d}`;
}

/** Монголын цагаар (UTC+8) өнөөдрийн огноо. */
function mongoliaIsoDate(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isoDateOf(value: string | undefined): string {
  return value ? value.slice(0, 10) : "";
}

export const CONTRACT_FIELDS: ContractField[] = [
  // --- Сурагч ---
  { key: "student.lastName", label: "Овог", group: "student", resolve: (c) => c.user.lastName },
  { key: "student.firstName", label: "Нэр", group: "student", resolve: (c) => c.user.firstName },
  {
    key: "student.fullName",
    label: "Бүтэн нэр (Овог Нэр)",
    group: "student",
    resolve: (c) => `${c.user.lastName} ${c.user.firstName}`.trim(),
  },
  { key: "student.phone", label: "Утас", group: "student", resolve: (c) => c.user.phone },
  { key: "student.email", label: "И-мэйл", group: "student", resolve: (c) => c.user.email },
  { key: "student.school", label: "Сургууль", group: "student", resolve: (c) => c.user.school },
  { key: "student.grade", label: "Анги", group: "student", resolve: (c) => c.user.grade ?? "" },
  { key: "student.province", label: "Аймаг / Хот", group: "student", resolve: (c) => c.user.province },
  { key: "student.district", label: "Сум / Дүүрэг", group: "student", resolve: (c) => c.user.district },
  { key: "student.address", label: "Гэрийн хаяг", group: "student", resolve: (c) => c.user.address ?? "" },
  {
    key: "student.fullAddress",
    label: "Бүтэн хаяг (аймаг, дүүрэг, хаяг)",
    group: "student",
    resolve: (c) => [c.user.province, c.user.district, c.user.address].filter(Boolean).join(", "),
  },
  {
    key: "student.register",
    label: "Регистрийн дугаар",
    group: "student",
    resolve: (c) => c.user.studentRegister ?? "",
  },
  {
    key: "student.birthDate",
    label: "Төрсөн огноо",
    group: "student",
    resolve: (c) => formatCourseDate(isoDateOf(c.user.birthDate)),
  },

  // --- Эцэг эх ---
  { key: "parent.name", label: "Нэр", group: "parent", resolve: (c) => c.user.parentName ?? "" },
  { key: "parent.phone", label: "Утас", group: "parent", resolve: (c) => c.user.parentPhone ?? "" },
  {
    key: "parent.register",
    label: "Регистрийн дугаар",
    group: "parent",
    resolve: (c) => c.user.parentRegister ?? "",
  },

  // --- Бүртгэл, төлбөр ---
  {
    key: "registration.programLabel",
    label: "Бүртгүүлсэн сургалт",
    group: "registration",
    resolve: (c) => c.registration.programLabel,
  },
  { key: "registration.price", label: "Зарласан үнэ", group: "registration", resolve: (c) => c.registration.price },
  {
    key: "registration.totalDue",
    label: "Нийт төлөх дүн",
    group: "registration",
    resolve: (c) => formatMnt(c.money.due),
  },
  {
    key: "registration.totalDueDigits",
    label: "Нийт төлөх дүн (зөвхөн тоо)",
    group: "registration",
    resolve: (c) => String(c.money.due),
  },
  { key: "registration.paid", label: "Төлсөн дүн", group: "registration", resolve: (c) => formatMnt(c.money.paid) },
  {
    key: "registration.balance",
    label: "Үлдэгдэл",
    group: "registration",
    resolve: (c) => formatMnt(c.money.balance),
  },
  {
    key: "registration.payMethod",
    label: "Төлбөрийн хэлбэр",
    group: "registration",
    resolve: (c) => PAY_METHOD_LABELS[c.registration.payMethod] ?? c.registration.payMethod,
  },
  {
    key: "registration.installmentDueDate",
    label: "Хоёр дахь төлөлтийн огноо",
    group: "registration",
    resolve: (c) => formatCourseDate(c.registration.installmentDueDate),
  },
  {
    key: "registration.createdAt",
    label: "Бүртгүүлсэн огноо",
    group: "registration",
    resolve: (c) => formatCourseDate(isoDateOf(c.registration.createdAt)),
  },

  // --- Сургалт ---
  { key: "program.title", label: "Нэр", group: "program", resolve: (c) => c.program?.title ?? "" },
  { key: "program.tag", label: "Ангилал", group: "program", resolve: (c) => c.program?.tag ?? "" },
  { key: "program.period", label: "Хугацааны нэгж", group: "program", resolve: (c) => c.program?.period ?? "" },
  {
    key: "program.startDate",
    label: "Эхлэх огноо",
    group: "program",
    resolve: (c) => formatCourseDate(c.program?.startDate),
  },
  {
    key: "program.lessonCount",
    label: "Хичээлийн тоо",
    group: "program",
    resolve: (c) => (c.program ? String(c.program.lessonCount) : ""),
  },
  {
    key: "program.weeklySchedule",
    label: "Долоо хоногийн хуваарь",
    group: "program",
    resolve: (c) => c.program?.weeklySchedule ?? "",
  },

  // --- Систем ---
  {
    key: "system.today",
    label: "Өнөөдрийн огноо (2026.09.01)",
    group: "system",
    resolve: (c) => formatCourseDate(mongoliaIsoDate(c.now)),
  },
  {
    key: "system.todayLong",
    label: "Өнөөдрийн огноо (2026 оны есдүгээр сарын 1)",
    group: "system",
    resolve: (c) => formatDateLongMn(mongoliaIsoDate(c.now)),
  },
  {
    key: "system.contractNumber",
    label: "Гэрээний дугаар",
    group: "system",
    // Бүртгэлийн id-гаас гаралтай тул нэг сурагчийн нэг сургалтын гэрээ
    // хэдэн ч удаа үүсгэсэн ижил дугаартай гарна.
    resolve: (c) => c.registration.id.replace(/-/g, "").slice(0, 8).toUpperCase(),
  },
];

export function findContractField(key: string): ContractField | undefined {
  return CONTRACT_FIELDS.find((f) => f.key === key);
}

/** Тагийн зураглалаас docxtemplater-т өгөх утгын объект. */
export function resolveTagValues(
  tags: { tag: string; field?: string }[],
  ctx: ContractContext
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const { tag, field } of tags) {
    const definition = field ? findContractField(field) : undefined;
    values[tag] = definition ? definition.resolve(ctx) : "";
  }
  return values;
}
