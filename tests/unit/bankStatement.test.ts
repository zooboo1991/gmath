/**
 * Дансны хуулга — Хаан банкны файлыг унших, гүйлгээг бүртгэлтэй холбох.
 *
 * Pure functions, no server: the parser gets an in-memory workbook laid out
 * like the bank's export, the matcher a hand-built context.
 */

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseKhanStatement, StatementParseError } from "@/lib/bankStatement/parse";
import { matchTransaction, type MatchContext, type MatchRegistration, type RecordedPayment } from "@/lib/bankStatement/match";
import { categoryHint, nameKey, phonesIn, qpayRefIn } from "@/lib/bankStatement/text";

const HEADER = ["Гүйлгээний огноо", "Салбар", "Эхний үлдэгдэл", "Кредит гүйлгээ", "Дебит гүйлгээ", "Эцсийн үлдэгдэл", "Гүйлгээний утга", "Харьцсан данс"];

function workbook(rows: unknown[][], footer: [string, string] = ["2600000.00", "-200.00"]): Uint8Array {
  const aoa = [
    ["", "", "", "", "", "", "Printed Date:", "2026-10-05"],
    ["", "", "Депозит дансны дэлгэрэнгүй хуулга"],
    [],
    ["Хэрэглэгч:", "", "", "БАТМӨНХ ГАНБАТ", "", "", "Интервал: 2026-10-01-2026-10-05", ""],
    [],
    ["Валютын төрөл:", "", "", "MNT", "", "IBAN:", "MN190005005034904750", ""],
    [],
    HEADER,
    ...rows,
    [],
    ["Нийт дүн:", "", "", footer[0], footer[1]],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Deposit Account Statement");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

describe("parseKhanStatement", () => {
  const rows = [
    ["2026-10-02 17:18:17", "5000", "490948.03", "1400000.00", 0, "1890948.03", "89191535 D Сурагч+ Нацагдорж Заманди", "5027511055"],
    ["2026-10-02 17:20:00", "5108", "1890948.03", 0, "-1800000.00", "90948.03", "Орлого", "5305881395"],
    ["2026-10-02 17:20:00", "5108", "90948.03", 0, "-200.00", "90748.03", "Ухаалаг банкны үйлчилгээний хураамж", ""],
    // A gap: the next opening balance is not the previous closing one.
    ["2026-10-02 17:37:43", "5000", "90948.03", "1200000.00", 0, "1290948.03", "Бадамхатан 6ё 3 сарын сургалтын төлбөр", "5069263465"],
  ];

  it("reads the header block, the incoming rows and the footer", () => {
    const p = parseKhanStatement(workbook(rows));
    expect(p.holder).toBe("БАТМӨНХ ГАНБАТ");
    expect(p.account).toBe("MN190005005034904750");
    expect([p.periodFrom, p.periodTo]).toEqual(["2026-10-01", "2026-10-05"]);
    expect(p.credits).toHaveLength(2);
    expect(p.debitRows).toBe(2);
    expect(p.credits[0]).toMatchObject({
      localTime: "2026-10-02 17:18:17",
      occurredAt: "2026-10-02T17:18:17+08:00",
      date: "2026-10-02",
      amount: 1_400_000,
      counterAccount: "5027511055",
      balanceAfter: 1_890_948.03,
      dedupeKey: "2026-10-02 17:18:17|1890948.03",
    });
    expect(p.rowCreditTotal).toBe(2_600_000);
    expect(p.footerCreditTotal).toBe(2_600_000);
  });

  it("counts breaks in the running balance and learns the owner's own accounts", () => {
    const p = parseKhanStatement(workbook(rows));
    expect(p.balanceGaps).toBe(1);
    expect(p.ownAccounts).toEqual(["5305881395"]);
  });

  it("gives the same row the same key in an overlapping upload", () => {
    const a = parseKhanStatement(workbook(rows));
    const b = parseKhanStatement(workbook(rows.slice(0, 1)));
    expect(b.credits[0].dedupeKey).toBe(a.credits[0].dedupeKey);
  });

  it("refuses a workbook that is not a bank statement", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Нэр", "Утас"], ["Бат", "99112233"]]), "Sheet1");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    expect(() => parseKhanStatement(bytes)).toThrow(StatementParseError);
  });
});

describe("description helpers", () => {
  it("compares names across scripts and spellings", () => {
    expect(nameKey("Төгөлдөр")).toBe(nameKey("Tuguldur"));
    expect(nameKey("Тэнүүнхүслэн")).toBe(nameKey("Tenuunkhuslen"));
    expect(nameKey("Дүүрэн")).toBe(nameKey("Duuren"));
  });

  it("finds phones but not digits inside a QPay code or a register number", () => {
    expect(phonesIn("EB -91913834-Сурагч Н.Хишигмаа")).toEqual(["91913834"]);
    expect(phonesIn("qpay 689825257987253, gm-c-88ebe446cf76424393b059a")).toEqual([]);
    expect(phonesIn("Зээл олгов,g384118,99395945,ФВ91090511")).toEqual(["99395945"]);
  });

  it("reads the truncated QPay code", () => {
    expect(qpayRefIn("QPAY 612182695083812, GM-C-E720C6D041E3464A85D8667 ХААН")).toEqual({ kind: "c", hex: "e720c6d041e3464a85d8667" });
    expect(qpayRefIn("Duuren 94942263")).toBeNull();
  });

  it("reads the programme letter, not an initial or the QPay code", () => {
    expect(categoryHint("89191535 D Сурагч+ Нацагдорж Заманди")).toBe("D");
    expect(categoryHint("c angilal 6-r angi a.chinguun 91998939")).toBe("C");
    expect(categoryHint("1 жилийн С ангилал Мөнх-Эрдэнэ")).toBe("C");
    expect(categoryHint("Буян-Очир D.99138869")).toBe("D");
    expect(categoryHint("Д.Мөнхболд")).toBeNull();
    expect(categoryHint("QPAY 1, GM-C-E720C6")).toBeNull();
    expect(categoryHint("ТҮМЭНДЭМБЭРЭЛ-с")).toBeNull();
    expect(categoryHint("99112233 6 д анги")).toBeNull();
    expect(categoryHint("Мөнхболд Д")).toBeNull();
  });
});

function reg(over: Partial<MatchRegistration> & { registrationId: string }): MatchRegistration {
  return {
    firstName: "Бат",
    lastName: "Дорж",
    phones: [],
    programLabel: "1 жилийн хөтөлбөр (D ангилал)",
    categories: ["D"],
    status: "active",
    owing: true,
    balance: 1_400_000,
    expected: [1_400_000],
    payments: [],
    pendingBankIntents: [],
    ...over,
  };
}

function ctx(registrations: MatchRegistration[], extra: Partial<MatchContext> = {}): MatchContext {
  return {
    registrations,
    ownAccounts: new Set(),
    qpay: () => ({ state: "unknown" }),
    allotted: new Map(),
    usedPayments: new Set(),
    ...extra,
  };
}

let paymentSeq = 0;
function paid(amount: number, paidAt: string, extra: Partial<RecordedPayment> = {}): RecordedPayment {
  return { id: `p${++paymentSeq}`, amount, paidAt, linked: false, ...extra };
}

const tx = (description: string, amount = 1_400_000, date = "2026-10-03") => ({ description, amount, date, counterAccount: "5000000001" });

describe("matchTransaction", () => {
  it("queues a payment when the phone written in it belongs to one owing registration", () => {
    const m = matchTransaction(
      tx("88044004 Ц.Тэмүнгэ"),
      ctx([reg({ registrationId: "r1", firstName: "Тэмүнгэ", lastName: "Цэрэнбат", phones: ["88044004"] }), reg({ registrationId: "r2" })])
    );
    expect(m).toMatchObject({ status: "ready", registrationId: "r1", source: "phone", confidence: "high" });
  });

  it("suggests the registration the programme letter names, but leaves the choice to the admin", () => {
    const m = matchTransaction(
      tx("89191535 D Сурагч + Нацагдорж Заманди"),
      ctx([
        reg({ registrationId: "c", firstName: "Заманди", phones: ["89191535"], programLabel: "1 жилийн хөтөлбөр (C ангилал)", categories: ["C"] }),
        reg({ registrationId: "d", firstName: "Заманди", phones: ["89191535"] }),
      ])
    );
    expect(m).toMatchObject({ status: "review", registrationId: "d" });
  });

  it("leaves a transfer already entered by hand alone", () => {
    const m = matchTransaction(
      tx("Duuren 94942263", 800_000, "2026-09-08"),
      ctx([reg({ registrationId: "r1", firstName: "Дүүрэн", phones: ["94942263"], balance: 2_000_000, payments: [paid(800_000, "2026-09-08")] })])
    );
    expect(m).toMatchObject({ status: "skipped", registrationId: "r1" });
    expect(m.reason).toContain("Аль хэдийн бүртгэгдсэн");
  });

  it("only suggests when the name alone matches", () => {
    const m = matchTransaction(
      tx("Jargalbayr 5 angi"),
      ctx([reg({ registrationId: "r1", firstName: "Жаргалбаяр", lastName: "Жадамба", categories: ["C"], programLabel: "1 жилийн хөтөлбөр (C ангилал)" })])
    );
    expect(m).toMatchObject({ status: "review", registrationId: "r1", source: "name" });
  });

  it("does not read a child's name into a longer one", () => {
    const m = matchTransaction(tx("A. Tengersetsen 5 r angi", 1_200_000), ctx([reg({ registrationId: "r1", firstName: "Сэцэн", balance: 1_200_000 })]));
    expect(m.registrationId).toBeNull();
  });

  it("flags an amount larger than what is owed instead of queuing it", () => {
    const m = matchTransaction(tx("99101595 D Мөнхболд", 2_800_000), ctx([reg({ registrationId: "r1", firstName: "Мөнхболд", phones: ["99101595"] })]));
    expect(m).toMatchObject({ status: "review", registrationId: "r1" });
  });

  it("never records a QPay settlement, and points at one the gateway missed", () => {
    const booked = matchTransaction(tx("QPAY 1, GM-C-E720C6D041E3", 594_000), ctx([], { qpay: () => ({ state: "recorded", label: "Х" }) }));
    expect(booked.status).toBe("skipped");
    const missed = matchTransaction(tx("QPAY 1, GM-C-E720C6D041E3", 594_000), ctx([], { qpay: () => ({ state: "waiting" }) }));
    expect(missed).toMatchObject({ status: "review", registrationId: null, source: "qpay" });
    expect(matchTransaction(tx("qpay 9, gm-p-a0ebb606b4dd", 19_800), ctx([])).status).toBe("skipped");
  });

  it("skips what is plainly not tuition", () => {
    const c = ctx([reg({ registrationId: "r1" })], { ownAccounts: new Set(["5305881395"]) });
    expect(matchTransaction({ ...tx("sss", 3_000_000), counterAccount: "5305881395" }, c).status).toBe("skipped");
    expect(matchTransaction(tx("tsognbfi: 21035 кодтой зээл олгов", 1_286_000), c).status).toBe("skipped");
    expect(matchTransaction(tx("НЕБ-ын 1 дүгээр сургууль", 741_015.8), c).status).toBe("skipped");
    expect(matchTransaction(tx("ttt", 20_000), c).status).toBe("skipped");
  });

  it("lets one recorded payment explain only one transfer", () => {
    const c = ctx([reg({ registrationId: "r1", firstName: "Баяржаргал", phones: ["80976081"], balance: 140_000, expected: [140_000], payments: [paid(140_000, "2026-09-28")] })]);
    expect(matchTransaction(tx("Баяржаргал, 80976081", 140_000, "2026-09-28"), c).status).toBe("skipped");
    const second = matchTransaction(tx("Bayarjargal 80976081", 140_000, "2026-09-29"), c);
    expect(second.status).not.toBe("skipped");
  });

  it("does not let a payment already tied to a bank row explain another transfer", () => {
    const c = ctx([reg({ registrationId: "r1", phones: ["88044004"], payments: [paid(1_400_000, "2026-10-03", { linked: true })] })]);
    expect(matchTransaction(tx("88044004", 1_400_000, "2026-10-03"), c).status).toBe("ready");
  });

  it("does not let a sibling's booked payment hide this child's transfer", () => {
    const c = ctx([
      reg({ registrationId: "A", firstName: "Тэмүүлэн", phones: ["88004315"], owing: false, balance: 0, payments: [paid(1_400_000, "2026-09-24")] }),
      reg({ registrationId: "B", firstName: "Тэмүжин", phones: ["88004315"], status: "pending", balance: 2_800_000, expected: [1_400_000, 2_800_000] }),
    ]);
    const m = matchTransaction(tx("88004315 D Сурагч + Бат Тэмүжин", 1_400_000, "2026-09-24"), c);
    expect(m).toMatchObject({ status: "ready", registrationId: "B" });
  });

  it("sends a transfer to review when a payment was entered by hand after it", () => {
    const c = ctx([reg({ registrationId: "r1", firstName: "Есүнгэ", phones: ["88988665"], balance: 1_400_000, payments: [paid(1_400_000, "2026-09-12")] })]);
    const m = matchTransaction(tx("О.Есүнгэ 88988665", 1_400_000, "2026-09-02"), c);
    expect(m).toMatchObject({ status: "review", registrationId: "r1" });
    expect(m.reason).toContain("давхар");
  });

  it("does not queue more than is owed across several transfers of one upload", () => {
    const c = ctx([reg({ registrationId: "r1", phones: ["99112233"], balance: 600_000, expected: [600_000] })]);
    expect(matchTransaction(tx("99112233 Temuulen", 600_000, "2026-09-02"), c).status).toBe("ready");
    expect(matchTransaction(tx("99112233 tulbur", 600_000, "2026-09-20"), c).status).toBe("review");
  });

  it("does not activate a pending registration on less than the first instalment", () => {
    const c = ctx([reg({ registrationId: "P", phones: ["99037529"], status: "pending", balance: 2_800_000, expected: [1_400_000, 2_800_000] })]);
    expect(matchTransaction(tx("99037529 D.Dashnyam", 100_000), c)).toMatchObject({ status: "review", registrationId: "P" });
  });

  it("asks when the phone points at one child but the text names another", () => {
    const c = ctx([
      reg({ registrationId: "paid", firstName: "Хишигмаа", phones: ["88004315"], owing: false, balance: 0 }),
      reg({ registrationId: "owes", firstName: "Тэмүжин", phones: ["88004315"], balance: 600_000, expected: [600_000] }),
    ]);
    expect(matchTransaction(tx("88004315 Бат Хишигмаа", 600_000), c).status).toBe("review");
  });

  it("does not let a class letter break a sibling tie", () => {
    const c = ctx([
      reg({ registrationId: "C", phones: ["99112233"], status: "pending", balance: 2_800_000, expected: [1_400_000, 2_800_000], categories: ["C"], programLabel: "1 жилийн хөтөлбөр (C ангилал)" }),
      reg({ registrationId: "D", phones: ["99112233"], status: "pending", balance: 2_800_000, expected: [1_400_000, 2_800_000] }),
    ]);
    expect(matchTransaction(tx("99112233 6 д анги"), c).status).toBe("review");
    expect(matchTransaction(tx("99112233 D Сурагч"), c).status).toBe("review");
  });

  it("does not queue a transfer for an owing child when the same amount is booked on a sibling", () => {
    const c = ctx([
      reg({ registrationId: "A", firstName: "Тэмүүлэн", phones: ["88004315"], owing: false, balance: 0, payments: [paid(1_400_000, "2026-09-24")] }),
      reg({ registrationId: "B", firstName: "Тэмүжин", phones: ["88004315"], status: "pending", balance: 2_800_000, expected: [1_400_000] }),
    ]);
    expect(matchTransaction(tx("88004315 tulbur", 1_400_000, "2026-09-24"), c)).toMatchObject({ status: "review", registrationId: "B" });
  });

  it("does not let a paid-up sibling's payment hide a duplicate for the named child", () => {
    const c = ctx([
      reg({ registrationId: "A", firstName: "Тэмүүлэн", phones: ["99112233"], owing: false, balance: 0, payments: [paid(1_000_000, "2026-10-01")] }),
      reg({ registrationId: "B", firstName: "Анужин", phones: ["99112233"], owing: false, balance: 0, payments: [paid(1_000_000, "2026-09-30")] }),
    ]);
    expect(matchTransaction(tx("99112233 Тэмүүлэн", 1_000_000, "2026-10-01"), c)).toMatchObject({ status: "skipped", registrationId: "A" });
    expect(matchTransaction(tx("99112233 Тэмүүлэн", 1_000_000, "2026-10-01"), c).status).toBe("review");
  });

  it("ties a skipped transfer to the payment it is, so a later upload cannot reuse it", () => {
    const p = paid(800_000, "2026-09-08");
    const m = matchTransaction(tx("Duuren 94942263", 800_000, "2026-09-08"), ctx([reg({ registrationId: "r1", firstName: "Дүүрэн", phones: ["94942263"], balance: 2_000_000, payments: [p] })]));
    expect(m).toMatchObject({ status: "skipped", paymentId: p.id });
  });

  it("ties a QPay line to the gateway's payment, so a bank transfer of the same amount is not taken for it", () => {
    const qp = paid(600_000, "2026-10-01");
    const c = ctx(
      [reg({ registrationId: "r1", firstName: "Тэмүүлэн", phones: ["99112233"], balance: 600_000, expected: [600_000], payments: [qp] })],
      { qpay: () => ({ state: "recorded", label: "Т", registrationId: "r1" }) }
    );
    expect(matchTransaction(tx("QPAY 1, GM-C-E720C6D041E3", 594_000, "2026-10-01"), c)).toMatchObject({ status: "skipped", paymentId: qp.id });
    expect(matchTransaction(tx("99112233 Тэмүүлэн", 600_000, "2026-10-02"), c).status).toBe("ready");
  });

  it("does not take half for the first payment of a full-price pending registration", () => {
    const c = ctx([reg({ registrationId: "P", phones: ["99112233"], status: "pending", balance: 350_000, expected: [350_000] })]);
    expect(matchTransaction(tx("99112233", 175_000), c).status).toBe("review");
  });

  it("does not let the programme letter pick between equally matched registrations, however many there are", () => {
    const c = ctx([
      reg({ registrationId: "B_C", phones: ["99112233"], status: "pending", balance: 2_800_000, expected: [1_400_000], categories: ["C"], programLabel: "1 жилийн хөтөлбөр (C ангилал)" }),
      reg({ registrationId: "X_C", phones: ["99112233"], status: "pending", balance: 3_000_000, expected: [3_000_000], categories: ["C"], programLabel: "1 жилийн хөтөлбөр (C ангилал)" }),
      reg({ registrationId: "A_D", phones: ["99112233"], status: "pending", balance: 2_800_000, expected: [1_400_000] }),
    ]);
    expect(matchTransaction(tx("99112233 C ангилал"), c).status).toBe("review");
  });

  it("asks when the text names another child exactly and the phone's child only looks alike", () => {
    const c = ctx([
      reg({ registrationId: "own", firstName: "Энхжил", phones: ["88004315"], balance: 600_000, expected: [600_000] }),
      reg({ registrationId: "sib", firstName: "Энхжин", phones: ["88004315"], owing: false, balance: 0 }),
    ]);
    expect(matchTransaction(tx("88004315 Энхжин", 600_000), c).status).toBe("review");
  });

  it("keeps an unknown transfer for the admin", () => {
    const m = matchTransaction(tx("ТҮМЭНДЭМБЭРЭЛ-с", 1_000_000), ctx([reg({ registrationId: "r1" })]));
    expect(m).toMatchObject({ status: "review", registrationId: null });
  });
});
