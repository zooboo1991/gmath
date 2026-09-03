import { describe, expect, it } from "vitest";
import { paidLabel, registrationBalance, sumPaymentsFor } from "@/lib/registration";

/**
 * Нэг бүртгэл хэдийг төлсөн бэ — админы бүх дэлгэц энэ нэг тооцооноос
 * уншдаг. Хуваан төлсөн сурагчийг бүтэн төлсөн гэж харуулах нь орлогыг
 * байхгүй газраас гаргаж ирнэ.
 */

const base = { id: "r1", price: "1,200,000₮", status: "active" as const, payMethod: "bank" as const };

describe("үлдэгдлийн тооцоо", () => {
  it("төлөвлөгөө тавиагүй QPay бүртгэлийг бүтэн төлсөнд тооцно", () => {
    // QPay нь бүтэн дүнгээр барагдуулсан бөгөөд төлбөрийн мөр үлдээдэггүй.
    // Зөвхөн мөрийг тоолвол ийм сурагч бүгд өртэй мэт харагдана.
    const r = { ...base, payMethod: "qpay" as const };
    expect(registrationBalance(r, 0)).toEqual({
      due: 1_200_000,
      paid: 1_200_000,
      balance: 0,
      settledByGateway: true,
    });
  });

  it("хуваан төлөх төлөвлөгөөтэй бол бодит мөрүүд л ялна", () => {
    const r = { ...base, payMethod: "qpay" as const, totalDue: 1_200_000 };
    const { due, paid, balance, settledByGateway } = registrationBalance(r, 600_000);
    expect({ due, paid, balance }).toEqual({ due: 1_200_000, paid: 600_000, balance: 600_000 });
    // Төлөвлөгөө тавигдмагц gateway-ийн таамаг хүчингүй болно.
    expect(settledByGateway).toBe(false);
  });

  it("төлсөн нь нийтээс хэтэрвэл нийтээр таслана", () => {
    const r = { ...base, totalDue: 1_200_000 };
    expect(registrationBalance(r, 2_000_000).paid).toBe(1_200_000);
    expect(registrationBalance(r, 2_000_000).balance).toBe(0);
  });

  it("тохиролцсон дүн зарласан үнийг дийлнэ (хөнгөлөлт)", () => {
    const r = { ...base, totalDue: 1_000_000 };
    expect(registrationBalance(r, 0).due).toBe(1_000_000);
  });

  it("цуцалсан бүртгэлийг gateway барагдуулсанд тооцохгүй", () => {
    const r = { ...base, payMethod: "qpay" as const, status: "cancelled" as const };
    expect(registrationBalance(r, 0).paid).toBe(0);
  });

  it("хүлээгдэж буй бүртгэл төлөгдөөгүй хэвээр", () => {
    const r = { ...base, payMethod: "qpay" as const, status: "pending" as const };
    expect(registrationBalance(r, 0).paid).toBe(0);
  });
});

describe("төлөлтийн нийлбэр", () => {
  it("зөвхөн тухайн бүртгэлийн мөрийг нэмнэ", () => {
    const payments = [
      { registrationId: "r1", amount: 600_000 },
      { registrationId: "r2", amount: 999_999 },
      { registrationId: "r1", amount: 300_000 },
    ];
    expect(sumPaymentsFor("r1", payments)).toBe(900_000);
    expect(sumPaymentsFor("r3", payments)).toBe(0);
  });
});

describe("админд харуулах мөр", () => {
  it("хуваан төлсөнийг төлсөн/нийт хэлбэрээр харуулна", () => {
    const r = { ...base, totalDue: 1_200_000 };
    expect(paidLabel(r, [{ registrationId: "r1", amount: 600_000 }])).toBe("600,000₮ / 1,200,000₮");
  });

  it("бүтэн төлсөн бол ганц дүн харуулна", () => {
    const r = { ...base, totalDue: 1_200_000 };
    expect(paidLabel(r, [{ registrationId: "r1", amount: 1_200_000 }])).toBe("1,200,000₮");
  });

  it("төлбөрийн мөргүй хуваан төлөлт нь 0-оор эхэлнэ", () => {
    // Дансаар баталгаажуулахдаа дүн оруулаагүй үед яг ийм харагдана —
    // "бүтэн төлсөн" гэж худал хэлэхгүй.
    const r = { ...base, totalDue: 1_200_000 };
    expect(paidLabel(r, [])).toBe("0₮ / 1,200,000₮");
  });

  it("QPay-ээр бүтнээр төлсөн бол ганц дүн", () => {
    const r = { ...base, payMethod: "qpay" as const };
    expect(paidLabel(r, [])).toBe("1,200,000₮");
  });
});
