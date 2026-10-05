/**
 * Профайлын картын "Дансны мэдээлэл" товч — GET /profile.
 *
 * Товч зөвхөн үлдэгдэлтэй, төлөх дүн нь тохирсон сургалт дээр гарах ёстой:
 * бүрэн төлсөн хүнээс, эсвэл нөхцөл нь тохироогүй (сургууль төлдөг бүлэг гэх
 * мэт) хүнээс мөнгө нэхэх мэт харагдах ёсгүй.
 */

import { afterAll, describe, expect, it } from "vitest";
import { signedInClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { createTestCourse, createTestRegistration, createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

const BUTTON = "Дансны мэдээлэл";

async function studentOn(input: {
  programId?: string;
  programLabel?: string;
  price: string;
  payMethod: "qpay" | "bank" | "manual";
  totalDue: number | null;
  paid: number[];
}) {
  const programId = input.programId ?? (await createTestCourse({ price: input.price })).id;
  const student = await createTestUser();
  const registration = await createTestRegistration({
    userId: student.id,
    programId,
    programLabel: input.programLabel,
    price: input.price,
    payMethod: input.payMethod,
    status: "active",
  });
  if (input.totalDue !== null) {
    await testDb().from("registrations").update({ total_due: input.totalDue }).eq("id", registration.id);
  }
  for (const amount of input.paid) {
    const { data } = await testDb()
      .from("registration_payments")
      .insert({ registration_id: registration.id, amount, paid_at: "2026-09-01" })
      .select("id")
      .single();
    track("registration_payments", (data as { id: string }).id);
  }
  return signedInClient(student.phone, student.password);
}

describe("профайлын картын Дансны мэдээлэл товч", () => {
  it("үлдэгдэлтэй сургалт дээр гарна, Дэлгэрэнгүй товч «харах»-гүй болсон", async () => {
    const client = await studentOn({ price: "1,200,000₮", payMethod: "bank", totalDue: 1_200_000, paid: [600_000] });
    const page = await client.get("/profile");
    expect(page.status).toBe(200);
    expect(page.text).toContain(BUTTON);
    expect(page.text).toContain("Дэлгэрэнгүй →");
    expect(page.text).not.toContain("Дэлгэрэнгүй харах");
  });

  it("1 жилийн хөтөлбөрийн карт дээр ч гарна", async () => {
    const client = await studentOn({
      programId: "program-c",
      programLabel: "1 жилийн хөтөлбөр (C ангилал)",
      price: "2,800,000₮",
      payMethod: "manual",
      totalDue: 2_800_000,
      paid: [1_400_000],
    });
    const page = await client.get("/profile");
    expect(page.status).toBe(200);
    expect(page.text).toContain(BUTTON);
  });

  it("бүрэн төлсөн бол гарахгүй", async () => {
    const client = await studentOn({ price: "1,200,000₮", payMethod: "bank", totalDue: 1_200_000, paid: [600_000, 600_000] });
    const page = await client.get("/profile");
    expect(page.status).toBe(200);
    expect(page.text).not.toContain(BUTTON);
  });

  it("төлөх дүн тохироогүй бол (жагсаалтын үнээр) гарахгүй", async () => {
    const client = await studentOn({ price: "2,800,000₮", payMethod: "manual", totalDue: null, paid: [] });
    const page = await client.get("/profile");
    expect(page.status).toBe(200);
    expect(page.text).not.toContain(BUTTON);
  });

  it("QPay-ээр бүтнээр нь төлсөн сургалт дээр гарахгүй", async () => {
    const client = await studentOn({ price: "350,000₮", payMethod: "qpay", totalDue: null, paid: [] });
    const page = await client.get("/profile");
    expect(page.status).toBe(200);
    expect(page.text).not.toContain(BUTTON);
  });
});
