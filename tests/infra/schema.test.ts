/**
 * Checks the throwaway project actually has the schema and the storage
 * buckets before any real test runs against it.
 *
 * Without this, a half-finished setup shows up as a pile of unrelated
 * failures in the auth or payment suites — "column does not exist" ten files
 * away from the thing that is actually wrong.
 *
 * The table list is generated from supabase/schema.sql; if a migration adds a
 * table there and not here, this test is the reminder.
 */

import { describe, expect, it } from "vitest";
import { testDb } from "../support/db";

const TABLES = [
  "admin_logs",
  "app_settings",
  "article_shares",
  "articles",
  "assessment_problems",
  "assessments",
  "certificates",
  "chat_conversations",
  "chat_issues",
  "chat_messages",
  "contract_template_programs",
  "contract_templates",
  "course_articles",
  "course_onboarding_steps",
  "courses",
  "lesson_attendance",
  "lesson_meetings",
  "lesson_registrants",
  "lesson_reminders_sent",
  "levels",
  "login_logs",
  "messenger_link_tokens",
  "messenger_links",
  "notification_reads",
  "notification_recipients",
  "notifications",
  "otp_codes",
  "page_views",
  "problems",
  "push_subscriptions",
  "questionnaire_answers",
  "quiz_answers",
  "quiz_questions",
  "rate_limits",
  "registration_payments",
  "registrations",
  "sessions",
  "solutions",
  "users",
  "yearly_programs",
];

const BUCKETS = ["articles", "problems", "solutions", "graded-sheets", "lesson-notes", "contracts"];

describe("test database schema", () => {
  it("has every table supabase/schema.sql creates", async () => {
    const missing: string[] = [];
    for (const table of TABLES) {
      // Мөр биш, хүснэгт байгаа эсэхийг шалгаж байна. `head: true` ашиглаж
      // болохгүй: PostgREST байхгүй хүснэгтэд ч 204 буцаадаг тул алдаа
      // гарахгүй өнгөрч, энэ тест хэзээ ч юу ч барихгүй болно.
      const { error } = await testDb().from(table).select("*").limit(1);
      if (error) missing.push(`${table} (${error.message})`);
    }
    expect(missing, "supabase/schema.sql-ыг тестийн төслийн SQL Editor дээр ажиллуулна уу").toEqual([]);
  });

  it("has every storage bucket the app writes to", async () => {
    const { data, error } = await testDb().storage.listBuckets();
    expect(error).toBeNull();
    const names = (data ?? []).map((b) => b.name);
    expect(names, "Storage дээр bucket үүсгэнэ үү").toEqual(expect.arrayContaining(BUCKETS));
  });
});
