/**
 * Seeds the rows a test needs, straight into the database, and registers each
 * one for cleanup.
 *
 * Everything a real user does goes through the API instead — a test that
 * seeds its way past the code it is meant to be testing proves nothing. These
 * are only for the *preconditions*: the other student whose data must stay
 * private, the course that is already full, the verified OTP that lets a
 * registration proceed without spending an SMS.
 */

import { randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/password";
import { testDb, track, trackedValues } from "./db";

/** Password that satisfies the app's rule: upper, lower, digit, 6+ chars. */
export const DEFAULT_PASSWORD = "Test1234";

let phoneCounter = 0;

/**
 * A phone number no real person has: the 7000–7009 range is reserved for
 * this test suite by convention, and each call adds a counter so two
 * accounts in one run can never collide.
 */
export function makePhone(): string {
  phoneCounter += 1;
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `70${String(phoneCounter % 100).padStart(2, "0")}${suffix}`;
}

export type TestUser = {
  id: string;
  phone: string;
  password: string;
  email: string;
  role: "student" | "teacher";
  firstName: string;
  lastName: string;
};

export async function createTestUser(
  overrides: Partial<{
    role: "student" | "teacher";
    phone: string;
    password: string;
    email: string;
    firstName: string;
    lastName: string;
    grade: string;
  }> = {}
): Promise<TestUser> {
  const phone = overrides.phone ?? makePhone();
  const password = overrides.password ?? DEFAULT_PASSWORD;
  const role = overrides.role ?? "student";
  const email = overrides.email ?? `test-${phone}@example.test`;
  const { hash, salt } = hashPassword(password);

  const { data, error } = await testDb()
    .from("users")
    .insert({
      role,
      last_name: overrides.lastName ?? "Тест",
      first_name: overrides.firstName ?? `Хэрэглэгч${phone.slice(-4)}`,
      phone,
      email,
      province: "Улаанбаатар",
      district: "Баянзүрх",
      school: "Тестийн сургууль",
      grade: role === "student" ? overrides.grade ?? "8" : null,
      password_hash: hash,
      password_salt: salt,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createTestUser failed: ${error.message}`);

  const id = (data as { id: string }).id;
  track("users", id);
  return {
    id,
    phone,
    password,
    email,
    role,
    firstName: overrides.firstName ?? `Хэрэглэгч${phone.slice(-4)}`,
    lastName: overrides.lastName ?? "Тест",
  };
}

export type TestCourse = {
  id: string;
  title: string;
  price: string;
  tag: string;
};

export async function createTestCourse(
  overrides: Partial<{
    title: string;
    price: string;
    tag: string;
    kind: "upcoming" | "vod";
    status: "draft" | "published";
    capacity: number;
    lessons: unknown[];
    zoomLink: string;
    /** "songon" makes it a classroom group — the kind whose fee may be split. */
    template: string;
  }> = {}
): Promise<TestCourse> {
  const title = overrides.title ?? `Тест сургалт ${randomUUID().slice(0, 8)}`;
  const { data, error } = await testDb()
    .from("courses")
    .insert({
      kind: overrides.kind ?? "upcoming",
      status: overrides.status ?? "published",
      tag: overrides.tag ?? "C ангилал",
      title,
      topics: "Тестийн сэдэв",
      price: overrides.price ?? "100,000₮",
      period: "4 долоо хоног",
      capacity: overrides.capacity ?? null,
      lessons: overrides.lessons ?? [],
      zoom_link: overrides.zoomLink ?? null,
      template: overrides.template ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createTestCourse failed: ${error.message}`);

  const id = (data as { id: string }).id;
  track("courses", id);
  return { id, title, price: overrides.price ?? "100,000₮", tag: overrides.tag ?? "C ангилал" };
}

export async function createTestRegistration(input: {
  /** One of userId or phone. A phone-only row is what admin's manual add creates. */
  userId?: string;
  phone?: string;
  programId: string;
  programLabel?: string;
  price?: string;
  payMethod?: "qpay" | "bank" | "manual";
  status?: "pending" | "active";
  qpayInvoiceId?: string;
}): Promise<{ id: string }> {
  const { data, error } = await testDb()
    .from("registrations")
    .insert({
      user_id: input.userId ?? null,
      phone: input.userId ? null : input.phone ?? makePhone(),
      program_id: input.programId,
      program_label: input.programLabel ?? "Тест сургалт",
      price: input.price ?? "100,000₮",
      pay_method: input.payMethod ?? "qpay",
      status: input.status ?? "pending",
      qpay_invoice_id: input.qpayInvoiceId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createTestRegistration failed: ${error.message}`);

  const id = (data as { id: string }).id;
  track("registrations", id);
  return { id };
}

/**
 * Puts an OTP row in place directly. Used two ways: as an already-verified
 * code, which is what /api/account/register and /api/account/reset-password
 * actually require (consumeVerifiedOtp), and as a known-code/known-expiry row
 * for testing the verify endpoint without an SMS round trip.
 */
export async function seedOtp(
  phone: string,
  purpose: "register" | "reset",
  options: Partial<{
    code: string;
    expiresAt: string;
    verifiedAt: string | null;
    consumedAt: string | null;
  }> = {}
): Promise<{ id: string; code: string }> {
  const code = options.code ?? "1234";
  const { hash, salt } = hashPassword(code);
  const { data, error } = await testDb()
    .from("otp_codes")
    .insert({
      phone,
      purpose,
      code_hash: hash,
      code_salt: salt,
      expires_at: options.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      verified_at: options.verifiedAt ?? null,
      consumed_at: options.consumedAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedOtp failed: ${error.message}`);

  const id = (data as { id: string }).id;
  track("otp_codes", id);
  return { id, code };
}

/** An OTP that has already been through /api/account/otp/verify. */
export function seedVerifiedOtp(
  phone: string,
  purpose: "register" | "reset",
  overrides: Partial<{ verifiedAt: string }> = {}
) {
  return seedOtp(phone, purpose, { verifiedAt: overrides.verifiedAt ?? new Date().toISOString() });
}

export async function readOtp(id: string) {
  const { data, error } = await testDb().from("otp_codes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`readOtp failed: ${error.message}`);
  return data as Record<string, unknown> | null;
}

/**
 * Registers a user the *API* created (rather than a factory) for cleanup.
 * sessions and login_logs cascade from users, so the one row covers them.
 */
export async function trackUserByPhone(phone: string): Promise<string | null> {
  const { data, error } = await testDb().from("users").select("id").eq("phone", phone).maybeSingle();
  if (error) throw new Error(`trackUserByPhone failed: ${error.message}`);
  const id = (data as { id: string } | null)?.id ?? null;
  if (id) track("users", id);
  return id;
}

export async function createTestAssessment(input: {
  userId: string;
  status?:
    | "awaiting_payment"
    | "paid"
    | "questionnaire_done"
    | "problems_submitted"
    | "grading"
    | "completed";
  track?: "regular" | "advanced" | "olympiad" | "placement";
  amount?: string;
  quizGrade?: number;
  paymentInvoiceId?: string;
}): Promise<{ id: string }> {
  const { data, error } = await testDb()
    .from("assessments")
    .insert({
      user_id: input.userId,
      status: input.status ?? "awaiting_payment",
      track: input.track ?? "olympiad",
      amount: input.amount ?? "50,000₮",
      quiz_grade: input.quizGrade ?? null,
      payment_provider: "qpay",
      payment_invoice_id: input.paymentInvoiceId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createTestAssessment failed: ${error.message}`);

  const id = (data as { id: string }).id;
  track("assessments", id);
  return { id };
}

export async function createTestCertificate(input: {
  phone: string;
  certificateNumber?: string;
  lastName?: string;
  firstName?: string;
}): Promise<{ id: string; certificateNumber: string }> {
  const certificateNumber = input.certificateNumber ?? `TEST-${randomUUID().slice(0, 8)}`;
  const { data, error } = await testDb()
    .from("certificates")
    .insert({
      certificate_number: certificateNumber,
      last_name: input.lastName ?? "Тест",
      first_name: input.firstName ?? "Сурагч",
      phone: input.phone,
      category: "C ангилал",
      course: "Тестийн сургалт",
      issued_date: "2026-01-15",
    })
    .select("id")
    .single();
  if (error) throw new Error(`createTestCertificate failed: ${error.message}`);

  const id = (data as { id: string }).id;
  track("certificates", id);
  return { id, certificateNumber };
}

export async function createTestChat(input: {
  visitorId: string;
  userId?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
}): Promise<{ id: string }> {
  const { data, error } = await testDb()
    .from("chat_conversations")
    .insert({ visitor_id: input.visitorId, user_id: input.userId ?? null })
    .select("id")
    .single();
  if (error) throw new Error(`createTestChat failed: ${error.message}`);

  const id = (data as { id: string }).id;
  track("chat_conversations", id);

  for (const message of input.messages ?? []) {
    const { data: row, error: messageError } = await testDb()
      .from("chat_messages")
      .insert({ conversation_id: id, role: message.role, content: message.content })
      .select("id")
      .single();
    if (messageError) throw new Error(`createTestChat message failed: ${messageError.message}`);
    track("chat_messages", (row as { id: string }).id);
  }

  return { id };
}

/** Reads a registration back, for asserting what an endpoint actually wrote. */
export async function readRegistration(id: string) {
  const { data, error } = await testDb().from("registrations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`readRegistration failed: ${error.message}`);
  return data as Record<string, unknown> | null;
}

/** Reads a user row back — used to check a password change actually landed. */
export async function readUser(id: string) {
  const { data, error } = await testDb().from("users").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`readUser failed: ${error.message}`);
  return data as Record<string, unknown> | null;
}

/**
 * The site notifications a user has received. Also registers them for
 * cleanup: a `notifications` row is not owned by any user (the link lives in
 * notification_recipients), so deleting the user leaves it behind.
 */
export async function notificationsFor(userId: string): Promise<{ id: string; title: string }[]> {
  const { data, error } = await testDb()
    .from("notification_recipients")
    .select("notification_id, notifications(id, title)")
    .eq("user_id", userId);
  if (error) throw new Error(`notificationsFor failed: ${error.message}`);

  const rows = data as unknown as { notification_id: string; notifications: { id: string; title: string } | null }[];
  for (const row of rows) track("notifications", row.notification_id);
  return rows.map((r) => ({ id: r.notification_id, title: r.notifications?.title ?? "" }));
}

/**
 * Registers the notifications an admin action broadcast, found by the text
 * the test itself put in them (an article title, say). Broadcasts to "all"
 * have no recipient rows when the database has no users, so there is nothing
 * for a cascade to take with it — without this they would pile up run after
 * run.
 */
export async function trackNotificationsMentioning(text: string): Promise<number> {
  const { data, error } = await testDb().from("notifications").select("id").ilike("body", `%${text}%`);
  if (error) throw new Error(`trackNotificationsMentioning failed: ${error.message}`);
  const rows = (data ?? []) as { id: string }[];
  for (const row of rows) track("notifications", row.id);
  return rows.length;
}

/** Same idea for user-targeted notifications: sweep every user this run created. */
export async function trackNotificationsForCreatedUsers(): Promise<void> {
  for (const userId of trackedValues("users")) {
    await notificationsFor(userId);
  }
}

export async function countSessionsFor(userId: string): Promise<number> {
  const { count, error } = await testDb()
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`countSessionsFor failed: ${error.message}`);
  return count ?? 0;
}
