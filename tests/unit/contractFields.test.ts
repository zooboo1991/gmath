import { describe, expect, it } from "vitest";
import {
  CONTRACT_FIELDS,
  findContractField,
  formatDateLongMn,
  resolveTagValues,
  type ContractContext,
} from "@/lib/contracts/fields";
import type { PublicUser, Registration } from "@/lib/db";

const user = {
  id: "u1",
  role: "student",
  lastName: "Батсайхан",
  firstName: "Үлмэдэх",
  phone: "99011716",
  email: "u@example.mn",
  province: "Улаанбаатар",
  district: "Баянзүрх",
  school: "1-р сургууль",
  grade: "6-р анги",
  createdAt: "2026-08-01T00:00:00Z",
} as unknown as PublicUser;

const registration = {
  id: "3f2b8c1a-1111-2222-3333-444455556666",
  userId: "u1",
  programId: "program-c",
  programLabel: "C ангилал · 1 жилийн хөтөлбөр",
  price: "1,200,000₮",
  payMethod: "bank",
  status: "active",
  createdAt: "2026-08-10T00:00:00Z",
} as unknown as Registration;

function context(over: Partial<ContractContext> = {}): ContractContext {
  return {
    user,
    registration,
    program: {
      title: "1 жилийн хөтөлбөр",
      tag: "C АНГИЛАЛ",
      period: "/ жил",
      startDate: "2026-09-01",
      lessonCount: 8,
      weeklySchedule: "Даваа 19:00–21:00",
    },
    money: { due: 1_200_000, paid: 600_000, balance: 600_000 },
    now: new Date("2026-09-01T05:00:00Z"),
    ...over,
  };
}

describe("гэрээний талбарууд", () => {
  it("түлхүүр бүр давхардаагүй", () => {
    const keys = CONTRACT_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("сурагчийн мэдээллийг гаргана", () => {
    const c = context();
    expect(findContractField("student.fullName")!.resolve(c)).toBe("Батсайхан Үлмэдэх");
    expect(findContractField("student.grade")!.resolve(c)).toBe("6-р анги");
    expect(findContractField("student.fullAddress")!.resolve(c)).toBe("Улаанбаатар, Баянзүрх");
  });

  it("бөглөгдөөгүй талбарыг хоосон мөр болгоно, undefined гэж бичихгүй", () => {
    const c = context();
    for (const key of ["parent.name", "parent.register", "student.register", "student.birthDate"]) {
      expect(findContractField(key)!.resolve(c), key).toBe("");
    }
  });

  it("мөнгийг форматтай, зөвхөн тоогоор гэсэн хоёр хэлбэрээр өгнө", () => {
    const c = context();
    expect(findContractField("registration.totalDue")!.resolve(c)).toBe("1,200,000₮");
    expect(findContractField("registration.totalDueDigits")!.resolve(c)).toBe("1200000");
    expect(findContractField("registration.balance")!.resolve(c)).toBe("600,000₮");
  });

  it("огноог Монголын цагаар, албан ёсны хэлбэрээр бичнэ", () => {
    // 2026-09-01T05:00Z нь Монголоор 13:00, өдөр нь мөн 09-01.
    const c = context();
    expect(findContractField("system.today")!.resolve(c)).toBe("2026.09.01");
    expect(findContractField("system.todayLong")!.resolve(c)).toBe("2026 оны есдүгээр сарын 1");
  });

  it("шөнө дунд Монголын өдрөөр тооцно", () => {
    // 2026-08-31T17:00Z = Монголоор 09-01 01:00. UTC-ээр бол өмнөх өдөр.
    const c = context({ now: new Date("2026-08-31T17:00:00Z") });
    expect(findContractField("system.today")!.resolve(c)).toBe("2026.09.01");
  });

  it("гэрээний дугаар бүртгэлээс гаралтай тул тогтвортой", () => {
    const c = context();
    const first = findContractField("system.contractNumber")!.resolve(c);
    expect(first).toBe("3F2B8C1A");
    expect(findContractField("system.contractNumber")!.resolve(context())).toBe(first);
  });

  it("сургалт устсан ч гэрээ үүснэ — талбарууд нь хоосон", () => {
    const c = context({ program: undefined });
    expect(findContractField("program.title")!.resolve(c)).toBe("");
    expect(findContractField("program.lessonCount")!.resolve(c)).toBe("");
  });
});

describe("тагийн зураглал", () => {
  it("холбогдсон тагийг утгаар, холбоогүйг хоосноор дүүргэнэ", () => {
    const values = resolveTagValues(
      [
        { tag: "сурагч", field: "student.fullName" },
        { tag: "эцэг_эх", field: "parent.name" },
        { tag: "гарын_үсэг" },
      ],
      context()
    );
    expect(values).toEqual({ "сурагч": "Батсайхан Үлмэдэх", "эцэг_эх": "", "гарын_үсэг": "" });
  });

  it("танихгүй талбарын түлхүүр хоосон утга болно", () => {
    // Талбар кодоос хасагдсан ч гэрээ үүсэхээ болих учиргүй.
    expect(resolveTagValues([{ tag: "x", field: "устсан.талбар" }], context())).toEqual({ x: "" });
  });
});

describe("огнооны бичиглэл", () => {
  it("сар бүрийг монголоор нэрлэнэ", () => {
    expect(formatDateLongMn("2026-01-15")).toBe("2026 оны нэгдүгээр сарын 15");
    expect(formatDateLongMn("2026-11-03")).toBe("2026 оны арван нэгдүгээр сарын 3");
    expect(formatDateLongMn("2026-12-31")).toBe("2026 оны арван хоёрдугаар сарын 31");
  });

  it("буруу огноог хоосон буцаана", () => {
    expect(formatDateLongMn("")).toBe("");
    expect(formatDateLongMn("огноо биш")).toBe("");
  });
});
