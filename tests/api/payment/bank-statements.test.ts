/**
 * Дансны хуулга — /api/admin/statements, /api/admin/bank-transactions.
 *
 * Money moves on «Батлах», so the questions are the usual ones: is a transfer
 * tied to the right registration, is it recorded exactly once (re-upload,
 * double approve), does a pending bank registration get activated the way the
 * manual button does it, and can only a full admin touch any of it.
 */

import { afterAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { adminClient, anonClient } from "../../support/client";
import { cleanupTracked, testDb, track, trackStorageObject } from "../../support/db";
import {
  createTestCourse,
  createTestRegistration,
  createTestUser,
  notificationsFor,
  readRegistration,
  trackNotificationsForCreatedUsers,
} from "../../support/factories";

afterAll(async () => {
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
});

type Tx = { id: string; status: string; registrationId?: string; amount: number; description: string; reason?: string };
type UploadResponse = { ok: boolean; error?: string; statement?: { id: string; filePath?: string }; inserted?: number; duplicates?: number };

const HEADER = ["Гүйлгээний огноо", "Салбар", "Эхний үлдэгдэл", "Кредит гүйлгээ", "Дебит гүйлгээ", "Эцсийн үлдэгдэл", "Гүйлгээний утга", "Харьцсан данс"];

/** A Khan-Bank-shaped workbook. Balances are random so the rows never collide with another run's. */
function statementFile(rows: { time: string; amount: number; description: string }[]): File {
  let balance = Math.round(Math.random() * 1e9) / 100;
  const body = rows.map((r) => {
    const open = balance;
    balance = Math.round((balance + r.amount) * 100) / 100;
    return [r.time, "5000", open.toFixed(2), r.amount.toFixed(2), 0, balance.toFixed(2), r.description, "5000123456"];
  });
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const aoa = [
    ["Хэрэглэгч:", "", "", "ТЕСТ ДАНС", "", "", "Интервал: 2026-10-01-2026-10-05"],
    ["Валютын төрөл:", "", "", "MNT", "", "IBAN:", "MN000000000000000000"],
    HEADER,
    ...body,
    ["Нийт дүн:", "", "", total.toFixed(2), "0.00"],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Deposit Account Statement");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], "statement.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function upload(file: File) {
  const admin = await adminClient("full");
  const form = new FormData();
  form.set("file", file);
  const res = await admin.postForm<UploadResponse>("/api/admin/statements", form);
  if (res.body?.statement) {
    track("bank_statements", res.body.statement.id);
    const { data } = await testDb().from("bank_statements").select("file_path").eq("id", res.body.statement.id).single();
    if (data?.file_path) trackStorageObject("bank-statements", data.file_path as string);
  }
  return { admin, res };
}

async function transactionsOf(statementId: string): Promise<Tx[]> {
  const admin = await adminClient("full");
  const res = await admin.get<{ transactions: (Tx & { statementId: string })[] }>("/api/admin/statements");
  return (res.body?.transactions ?? []).filter((t) => t.statementId === statementId);
}

async function paymentsOf(registrationId: string) {
  const { data } = await testDb().from("registration_payments").select("id, amount, paid_at").eq("registration_id", registrationId);
  const rows = (data ?? []) as { id: string; amount: number; paid_at: string }[];
  for (const r of rows) track("registration_payments", r.id);
  return rows;
}

/** An active student who has paid half of a 1,200,000₮ group and owes 600,000₮. */
async function owingStudent() {
  const course = await createTestCourse({ price: "1,200,000₮" });
  const student = await createTestUser();
  const registration = await createTestRegistration({
    userId: student.id,
    programId: course.id,
    price: "1,200,000₮",
    payMethod: "bank",
    status: "active",
  });
  await testDb().from("registrations").update({ total_due: 1_200_000 }).eq("id", registration.id);
  const { data } = await testDb()
    .from("registration_payments")
    .insert({ registration_id: registration.id, amount: 600_000, paid_at: "2026-09-01" })
    .select("id")
    .single();
  track("registration_payments", (data as { id: string }).id);
  return { student, registrationId: registration.id };
}

/** A student who enrolled by bank transfer on the split plan and is still waiting for the admin. */
async function pendingStudent() {
  const course = await createTestCourse({ price: "1,200,000₮" });
  const student = await createTestUser();
  const registration = await createTestRegistration({
    userId: student.id,
    programId: course.id,
    price: "1,200,000₮",
    payMethod: "bank",
    status: "pending",
  });
  // The split plan is the one that sets a date for the second half; its first payment is half.
  await testDb().from("registrations").update({ installment_due_date: "2026-11-05" }).eq("id", registration.id);
  return { student, registrationId: registration.id };
}

describe("uploading a statement", () => {
  it("is refused to the read-only admin and to the public", async () => {
    const viewer = await adminClient("viewer");
    expect((await viewer.get("/api/admin/statements")).status).toBe(401);
    expect((await anonClient().get("/api/admin/statements")).status).toBe(401);
  });

  it("refuses a file that is not a bank statement", async () => {
    const admin = await adminClient("full");
    const notXlsx = new FormData();
    notXlsx.set("file", new File([new Uint8Array([1, 2, 3, 4, 5])], "x.xlsx"));
    expect((await admin.postForm("/api/admin/statements", notXlsx)).status).toBe(400);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Нэр"], ["Бат"]]), "Sheet1");
    const other = new FormData();
    other.set("file", new File([XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer], "list.xlsx"));
    const res = await admin.postForm<UploadResponse>("/api/admin/statements", other);
    expect(res.status).toBe(400);
    expect(res.body?.error).toContain("Хаан банкны хуулгын");
  });

  it("matches by phone, keeps the unknown for review, and never takes the same row twice", async () => {
    const owing = await owingStudent();
    const pending = await pendingStudent();
    const file = statementFile([
      { time: "2026-10-03 11:49:10", amount: 600_000, description: `${owing.student.phone} - Сурагч + үлдэгдэл` },
      { time: "2026-10-03 12:10:00", amount: 600_000, description: `${pending.student.phone} Сурагч` },
      { time: "2026-10-03 13:00:00", amount: 1_000_000, description: "ZZZ unknown payer" },
      { time: "2026-10-03 13:05:00", amount: 19_800, description: "qpay 986657978484998, gm-p-a0ebb606b4dd4262a06b038" },
    ]);
    const { res } = await upload(file);
    expect(res.status).toBe(200);
    expect(res.body?.inserted).toBe(4);
    const statementId = res.body!.statement!.id;

    const rows = await transactionsOf(statementId);
    const byDesc = (s: string) => rows.find((t) => t.description.startsWith(s))!;
    expect(byDesc(owing.student.phone)).toMatchObject({ status: "ready", registrationId: owing.registrationId });
    expect(byDesc(pending.student.phone)).toMatchObject({ status: "ready", registrationId: pending.registrationId });
    expect(byDesc("ZZZ")).toMatchObject({ status: "review" });
    expect(byDesc("qpay")).toMatchObject({ status: "skipped" });

    // The same file again: every row is already stored.
    const again = await upload(file);
    expect(again.res.body).toMatchObject({ inserted: 0, duplicates: 4 });
  });
});

describe("deciding and approving", () => {
  it("records the payments once, activates the pending registration and notifies its family", async () => {
    const owing = await owingStudent();
    const pending = await pendingStudent();
    const { res, admin } = await upload(
      statementFile([
        { time: "2026-10-04 10:00:00", amount: 600_000, description: `${owing.student.phone} Сурагч` },
        { time: "2026-10-04 10:30:00", amount: 600_000, description: `${pending.student.phone} Сурагч` },
      ])
    );
    const rows = await transactionsOf(res.body!.statement!.id);
    const ids = rows.map((t) => t.id);

    const approved = await admin.post<{ approved: number; activated: number; failed: unknown[] }>(
      "/api/admin/bank-transactions/approve",
      { ids }
    );
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ approved: 2, activated: 1, failed: [] });

    const owingPayments = await paymentsOf(owing.registrationId);
    expect(owingPayments.map((p) => [p.amount, p.paid_at]).sort()).toEqual([
      [600_000, "2026-09-01"],
      [600_000, "2026-10-04"],
    ]);
    expect((await paymentsOf(pending.registrationId)).map((p) => [p.amount, p.paid_at])).toEqual([[600_000, "2026-10-04"]]);
    expect((await readRegistration(pending.registrationId))?.status).toBe("active");
    expect((await notificationsFor(pending.student.id)).map((n) => n.title)).toContain("Төлбөр баталгаажлаа");

    // A second press records nothing more.
    const twice = await admin.post<{ approved: number; failed: unknown[] }>("/api/admin/bank-transactions/approve", { ids });
    expect(twice.body?.approved).toBe(0);
    expect(twice.body?.failed).toHaveLength(2);
    expect(await paymentsOf(owing.registrationId)).toHaveLength(2);
  });

  it("lets the admin link, skip and reopen a transfer, but not edit an approved one", async () => {
    const owing = await owingStudent();
    const { res, admin } = await upload(
      statementFile([{ time: "2026-10-05 09:00:00", amount: 600_000, description: "ZZZ someone paid" }])
    );
    const [row] = await transactionsOf(res.body!.statement!.id);
    expect(row.status).toBe("review");

    const linked = await admin.put<{ transaction: Tx }>(`/api/admin/bank-transactions/${row.id}`, {
      action: "link",
      registrationId: owing.registrationId,
    });
    expect(linked.body?.transaction).toMatchObject({ status: "ready", registrationId: owing.registrationId });

    const skippedRow = await admin.put<{ transaction: Tx }>(`/api/admin/bank-transactions/${row.id}`, { action: "skip" });
    expect(skippedRow.body?.transaction.status).toBe("skipped");
    // Skipped rows are not approved even if someone sends their id.
    const none = await admin.post<{ approved: number }>("/api/admin/bank-transactions/approve", { ids: [row.id] });
    expect(none.body?.approved).toBe(0);

    await admin.put(`/api/admin/bank-transactions/${row.id}`, { action: "reopen" });
    await admin.put(`/api/admin/bank-transactions/${row.id}`, { action: "link", registrationId: owing.registrationId });
    await admin.post("/api/admin/bank-transactions/approve", { ids: [row.id] });
    await paymentsOf(owing.registrationId);

    const locked = await admin.put(`/api/admin/bank-transactions/${row.id}`, { action: "skip" });
    expect(locked.status).toBe(409);
  });

  it("does not record a transfer that was entered by hand after the upload", async () => {
    const owing = await owingStudent();
    const { res, admin } = await upload(
      statementFile([{ time: "2026-10-04 18:00:00", amount: 600_000, description: `${owing.student.phone} Сурагч` }])
    );
    const [row] = await transactionsOf(res.body!.statement!.id);
    expect(row.status).toBe("ready");

    // Meanwhile the admin records the same transfer from the registration page.
    const manual = await admin.post<{ ok: boolean; payment: { id: string } }>(
      `/api/admin/registrations/${owing.registrationId}/payments`,
      { amount: 600_000, paidAt: "2026-10-05" }
    );
    expect(manual.status).toBe(200);

    const approved = await admin.post<{ approved: number; failed: { error: string }[] }>(
      "/api/admin/bank-transactions/approve",
      { ids: [row.id] }
    );
    expect(approved.body?.approved).toBe(0);
    expect(approved.body?.failed[0]?.error).toContain("давхар");
    expect(await paymentsOf(owing.registrationId)).toHaveLength(2);
    const [after] = await transactionsOf(res.body!.statement!.id);
    expect(after.status).toBe("review");
  });

  it("refuses an approve without explicit ids", async () => {
    const admin = await adminClient("full");
    expect((await admin.post("/api/admin/bank-transactions/approve", {})).status).toBe(400);
    expect((await admin.post("/api/admin/bank-transactions/approve", { ids: ["nope"] })).status).toBe(400);
  });

  it("survives an AI reply that is not JSON and leaves the rows as they were", async () => {
    const { res, admin } = await upload(
      statementFile([{ time: "2026-10-05 15:27:26", amount: 580_000, description: "ZZZ Батсүрэн Аялгуу" }])
    );
    const statementId = res.body!.statement!.id;
    const suggest = await admin.post<{ ok: boolean; suggested: number }>(`/api/admin/statements/${statementId}/suggest`, {});
    expect(suggest.status).toBe(200);
    expect(suggest.body).toMatchObject({ ok: true, suggested: 0 });
    const [row] = await transactionsOf(statementId);
    expect(row.status).toBe("review");
  });

  it("serves the stored file only through a short signed link", async () => {
    const { res, admin } = await upload(
      statementFile([{ time: "2026-10-05 16:00:00", amount: 600_000, description: "ZZZ file check" }])
    );
    const file = await admin.get(`/api/admin/statements/${res.body!.statement!.id}/file`);
    expect([302, 307]).toContain(file.status);
    expect(file.headers.get("location") ?? "").toContain("/bank-statements/");
  });
});
