-- Ганбат багш — schema for Supabase (Postgres)
-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('teacher', 'student')),
  last_name text not null,
  first_name text not null,
  phone text not null unique,
  email text not null,
  province text not null default '',
  district text not null default '',
  school text not null,
  grade text,
  facebook text,
  zoom text,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now()
);

-- Run this if `users` already existed before `province`/`district` were
-- added, so existing installs pick up the new address columns.
alter table users add column if not exists province text not null default '';
alter table users add column if not exists district text not null default '';

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('upcoming', 'vod')),
  status text not null default 'published' check (status in ('draft', 'published')),
  tag text not null,
  title text not null,
  topics text not null,
  price text not null,
  period text not null,
  start_date text,
  mode text,
  cover_image text,
  facebook_group text,
  zoom_link text,
  zoom_meeting_id text,
  zoom_passcode text,
  lessons jsonb not null default '[]'::jsonb
);

-- Run this if the `courses` table already existed before `lessons` was added:
alter table courses add column if not exists lessons jsonb not null default '[]'::jsonb;

-- Run this if the `courses` table already existed before `status`/`cover_image`
-- were added. Default 'published' means every pre-existing course keeps
-- showing on the public site exactly as before — only courses created (or
-- explicitly unpublished) afterwards from the new admin Object Page can be
-- a 'draft'.
alter table courses add column if not exists status text not null default 'published' check (status in ('draft', 'published'));
alter table courses add column if not exists cover_image text;

-- Per-course Facebook group link, shown to a student once their registration
-- is confirmed (see listRegistrationsByUser in src/lib/db.ts).
alter table courses add column if not exists facebook_group text;

-- Zoom room for the course. Like the group link, these are only ever sent to
-- a student whose registration is active (see listRegistrationsByUser).
alter table courses add column if not exists zoom_link text;
alter table courses add column if not exists zoom_meeting_id text;
alter table courses add column if not exists zoom_passcode text;

-- Which courses show as cards on the homepage — previously a hardcoded,
-- disconnected-from-the-database list in src/components/Courses.tsx. Default
-- false: nothing appears there until the admin explicitly opts a course in.
alter table courses add column if not exists show_on_homepage boolean not null default false;

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  program_id text not null,
  program_label text not null,
  price text not null,
  pay_method text not null check (pay_method in ('qpay', 'bank')),
  status text not null check (status in ('pending', 'active')),
  created_at timestamptz not null default now()
);

create index if not exists registrations_user_id_idx on registrations(user_id);

-- Prevents a user from ending up with two registrations for the same
-- program (double-click, retried request, two tabs racing, etc).
create unique index if not exists registrations_user_program_unique on registrations(user_id, program_id);

-- QPay invoice bookkeeping for a still-pending registration: the invoice has
-- to be re-checkable (from the callback or a client poll) and resumable
-- (the QR/short link shown again on a refresh) before it settles. Null for
-- bank transfers and for the dev-only stub provider.
alter table registrations add column if not exists qpay_invoice_id text;
alter table registrations add column if not exists qpay_payment_id text;
alter table registrations add column if not exists qpay_qr_image text;
alter table registrations add column if not exists qpay_short_url text;

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  excerpt text not null,
  content text not null,
  cover_image text not null,
  author text not null,
  featured boolean not null default false,
  created_at timestamptz not null default now()
);

-- Fixed-window rate limiting for login/register/reset-password (see
-- src/lib/rateLimit.ts). Key is e.g. "login:<phone>" or "register:<ip>".
create table if not exists rate_limits (
  key text primary key,
  attempts int not null default 0,
  window_start timestamptz not null default now()
);

-- SMS OTP codes for phone verification during registration and password
-- reset (see src/lib/otp.ts). code_hash/code_salt mirror users'
-- password_hash/password_salt — the code is never stored in the clear.
-- verified_at marks a code as having been correctly entered; the register/
-- reset-password routes then consume it (setting consumed_at) so it can't
-- be replayed. Resend/attempt throttling lives in `rate_limits`, not here.
create table if not exists otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  purpose text not null check (purpose in ('register', 'reset')),
  code_hash text not null,
  code_salt text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists otp_codes_phone_purpose_idx on otp_codes (phone, purpose, created_at desc);

-- Pageviews for the admin analytics tab (see src/components/Analytics.tsx).
-- visitor_id is a random id in a first-party cookie, not tied to any
-- account — it exists only to tell "1 visitor, 3 pages" from "3 visitors,
-- 1 page each" and carries no personal data.
create table if not exists page_views (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  referrer text,
  visitor_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_at_idx on page_views(created_at);

-- Teacher training certificates, bulk-imported by the admin from an Excel
-- file and looked up publicly by number on the Сертификат page. The number
-- is unique so re-importing a corrected spreadsheet updates existing rows
-- (upsert) instead of duplicating them.
create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_number text not null unique,
  last_name text not null,
  first_name text not null,
  phone text not null,
  category text not null,
  course text not null,
  issued_date text not null,
  created_at timestamptz not null default now()
);

-- Run this if `certificates` already existed before `phone` was added, so a
-- student's own registered phone number can be matched against the ones the
-- admin's spreadsheet imports.
alter table certificates add column if not exists phone text not null default '';

create index if not exists certificates_phone_idx on certificates(phone);

-- ---------------------------------------------------------------------------
-- Түвшин тогтоох үнэлгээ (level assessment)
-- ---------------------------------------------------------------------------

-- Generic key/value store so the admin can change things like the assessment
-- fee without a redeploy. Values are plain text; callers parse as needed.
create table if not exists app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value) values ('assessment_fee', '20,000₮')
on conflict (key) do nothing;

-- The 10 levels a student can be placed into. Content is admin-editable.
create table if not exists levels (
  id smallint primary key check (id between 1 and 10),
  name text not null,
  description text not null default '',
  scope text not null default '',
  how_to_advance text not null default '',
  -- Real FK, unlike registrations.program_id: deleting a course must not
  -- leave a level pointing at a row that no longer exists.
  recommended_course_id uuid references courses(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into levels (id, name) values
  (1, '1-р түвшин'), (2, '2-р түвшин'), (3, '3-р түвшин'), (4, '4-р түвшин'),
  (5, '5-р түвшин'), (6, '6-р түвшин'), (7, '7-р түвшин'), (8, '8-р түвшин'),
  (9, '9-р түвшин'), (10, '10-р түвшин')
on conflict (id) do nothing;

-- Problem bank. A problem is written as LaTeX (body_latex, rendered with
-- KaTeX), or supplied as a scanned image, or both — geometry problems
-- usually need a figure alongside the text. Images live in the public
-- "problems" bucket; answer_key is never sent to a student.
create table if not exists problems (
  id uuid primary key default gen_random_uuid(),
  level smallint not null check (level between 1 and 10),
  difficulty numeric(3,1) not null check (difficulty between 1 and 10),
  topic text not null default '',
  body_latex text,
  image_url text,
  answer_key text,
  -- Soft delete: a hard delete would break the history of every assessment
  -- that already showed this problem.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- An empty problem would be shown to a student as a blank card.
  constraint problems_has_content
    check (coalesce(body_latex, '') <> '' or coalesce(image_url, '') <> '')
);
create index if not exists problems_active_difficulty_idx
  on problems (difficulty) where active;

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'awaiting_payment' check (status in
    ('awaiting_payment','paid','questionnaire_done','problems_submitted','grading','completed')),
  estimated_level smallint,
  final_level smallint references levels(id),
  teacher_comment text,
  graded_sheet_path text,
  -- Payment is a stub until QPay is wired up; provider/ref let a real
  -- transaction be recorded later without a schema change.
  payment_provider text not null default 'stub',
  payment_ref text,
  amount text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assessments_user_idx on assessments (user_id, created_at desc);
create index if not exists assessments_status_idx on assessments (status);

-- Mirrors the registrations columns above, for the same reason: a QPay
-- invoice has to be resumable and re-checkable before it settles.
alter table assessments add column if not exists payment_invoice_id text;
alter table assessments add column if not exists payment_qr_image text;
alter table assessments add column if not exists payment_short_url text;

create table if not exists questionnaire_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null unique references assessments(id) on delete cascade,
  age smallint,
  grade text not null default '',
  has_competed boolean not null default false,
  has_prepared boolean not null default false,
  achievements text not null default '',
  created_at timestamptz not null default now()
);

-- Every problem shown during the picking phase, with what the student chose.
create table if not exists assessment_problems (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  problem_id uuid not null references problems(id) on delete restrict,
  action text not null check (action in ('too_easy','dont_know','solving')),
  shown_order smallint not null,
  created_at timestamptz not null default now(),
  -- Stops the picker from ever showing the same problem twice.
  unique (assessment_id, problem_id)
);
create index if not exists assessment_problems_assessment_idx
  on assessment_problems (assessment_id, shown_order);

-- Uploaded solutions. Paths (not URLs) because the "solutions" bucket is
-- private — the app mints a short-lived signed URL when it needs to show one.
create table if not exists solutions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  problem_id uuid not null references problems(id) on delete restrict,
  image_paths text[] not null default '{}',
  grader_score numeric(4,1),
  grader_comment text,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assessment_id, problem_id)
);
create index if not exists solutions_assessment_idx on solutions (assessment_id);

-- Zoom attendance tracking (see src/lib/zoom/). Lessons themselves stay in
-- courses.lessons jsonb — these tables key off (course_id, lesson_index)
-- rather than a per-lesson id, since lessons don't have a stable one. A
-- lesson reordered in the admin editor after its meeting was created would
-- point at the wrong lesson; acceptable for now, not worth a schema change
-- to the lessons array just to prevent an edge case admins can just avoid.
create table if not exists lesson_meetings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  lesson_index int not null,
  zoom_meeting_id text not null unique,
  join_url text not null,
  start_url text,
  created_at timestamptz not null default now(),
  unique (course_id, lesson_index)
);

-- One row per student ever registered for a lesson's meeting — created
-- lazily the first time that student clicks "Хичээлд орох". join_url is
-- personal to them; Zoom's webhook events carry the registrant_id back,
-- which is what lets lesson_attendance attribute a join to a specific user.
create table if not exists lesson_registrants (
  id uuid primary key default gen_random_uuid(),
  lesson_meeting_id uuid not null references lesson_meetings(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  zoom_registrant_id text not null,
  join_url text not null,
  created_at timestamptz not null default now(),
  unique (lesson_meeting_id, user_id)
);
create index if not exists lesson_registrants_registrant_idx on lesson_registrants (zoom_registrant_id);

-- One row per join; a dropped connection and rejoin during the same lesson
-- produces a second row rather than overwriting the first. zoom_participant_uuid
-- is Zoom's per-join session id, used to match the corresponding "left" event
-- to the right open row instead of guessing by user_id alone.
create table if not exists lesson_attendance (
  id uuid primary key default gen_random_uuid(),
  lesson_meeting_id uuid not null references lesson_meetings(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  zoom_participant_uuid text,
  joined_at timestamptz not null,
  left_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lesson_attendance_lookup_idx on lesson_attendance (lesson_meeting_id, user_id);
create index if not exists lesson_attendance_participant_idx on lesson_attendance (zoom_participant_uuid);

-- "Устгах" no longer hard-deletes a course — deleteCourse() took its
-- registrations with it (no confirmation beyond a dialog, no way back),
-- which is exactly how a course with real paid registrations got wiped by
-- one admin click. The admin UI now only ever archives (sets this status);
-- a real delete is something to run by hand against the database, never
-- from the app.
alter table courses drop constraint if exists courses_status_check;
alter table courses add constraint courses_status_check check (status in ('draft', 'published', 'archived'));

-- One active session per user. Logging in deletes any existing row for that
-- user_id before inserting the new one, so an older device's cookie (still
-- pointing at the deleted session id) stops resolving to a user and reads as
-- logged out the next time it's checked — that's the "kick the old device"
-- mechanism, no separate revocation step needed.
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_id_idx on sessions (user_id);

-- Append-only history of logins, separate from `sessions` (which only holds
-- the few currently-active sessions — see MAX_SESSIONS_PER_USER — and evicts
-- the oldest on a new login). This is what the admin's Хэрэглэгч → Төхөөрөмж tab reads to show
-- which devices a user has accessed from over time.
create table if not exists login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists login_logs_user_id_idx on login_logs (user_id, created_at desc);

-- Admin broadcast notifications. The recipient set is resolved and
-- materialized into notification_recipients at send time (not recomputed
-- live from role/registrations on every read) — this keeps a "Бүх сурагчид"
-- blast meaning exactly the students who existed at send time, gives a
-- stable list to drive SMS dispatch from, and makes the unread-count query
-- a plain join instead of per-type logic on every page load.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_url text,
  target_type text not null check (target_type in ('all', 'students', 'teachers', 'course', 'users')),
  target_course_id text,
  target_course_label text,
  channel text not null default 'site' check (channel in ('site', 'sms', 'both')),
  recipient_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  unique (notification_id, user_id)
);
create index if not exists notification_recipients_user_idx on notification_recipients (user_id, notification_id);

create table if not exists notification_reads (
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- The yearly programs (C/D ангилал) used to be hand-written pages with no
-- database row at all — see the removed src/lib/staticPrograms.ts. `id` is
-- text, not uuid, and deliberately kept as the exact "program-c"/"program-d"
-- strings already live in registrations.program_id, so existing paid
-- registrations resolve without any data migration. Rows are pre-seeded by a
-- one-off script, never created/deleted through the app — only edited.
create table if not exists yearly_programs (
  id text primary key,
  tag text not null,           -- "C АНГИЛАЛ" — the CourseCard badge on /courses
  title text not null,
  label text not null,
  topics text not null,
  price text not null,
  period text not null default '/ жил',
  facebook_group text,
  zoom_link text,
  zoom_meeting_id text,
  zoom_passcode text,
  lessons jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- lesson_meetings.course_id was a uuid FK into `courses`, so tracking a Zoom
-- meeting for a yearly program's lesson (course_id = "program-c", not a
-- UUID) failed with a Postgres 22P02 error. It's opaque text everywhere it's
-- queried already (see the schema comment above it) — this just makes the
-- column match, same as registrations.program_id.
alter table lesson_meetings drop constraint if exists lesson_meetings_course_id_fkey;
alter table lesson_meetings alter column course_id type text;

-- Admin can now add a registration by phone number before that person has
-- an account (paid in cash, over chat, etc). user_id becomes optional and
-- phone carries the row until a matching account shows up — see
-- linkPendingRegistrationsToUser() in lib/db.ts, called from
-- /api/account/register right after a new account is created. A stub
-- `users` row was considered and rejected: phone is unique and
-- login-capable there, so a placeholder account would need special-casing
-- everywhere a user is assumed real.
alter table registrations alter column user_id drop not null;
alter table registrations add column if not exists phone text;
alter table registrations drop constraint if exists registrations_pay_method_check;
alter table registrations add constraint registrations_pay_method_check check (pay_method in ('qpay', 'bank', 'manual'));
-- (user_id, program_id) above already stops a real account from double-
-- registering; this is the same guard for a phone that has no account yet
-- (partial, since NULL user_id would otherwise defeat any plain unique index).
create unique index if not exists registrations_phone_program_unique
  on registrations (phone, program_id) where user_id is null;

-- Records what happened, not who did it — admin access is one shared
-- password with a single generic cookie marker (see checkAdminPassword() /
-- ADMIN_MARKER in lib/session.ts), so there's no per-admin identity to
-- attach an admin_id to today. `ip` is the closest available forensic
-- signal (same getClientIp() helper already used for rate limiting).
create table if not exists admin_logs (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  target_id text,
  details jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists admin_logs_created_at_idx on admin_logs (created_at desc);
create index if not exists admin_logs_action_type_idx on admin_logs (action_type);

-- Mirrors courses.show_on_homepage — same admin-opt-in toggle, now available
-- for the yearly programs too.
alter table yearly_programs add column if not exists show_on_homepage boolean not null default false;

-- Installment payment tracking for yearly-program registrations, where the
-- agreed total can differ from the sticker price (month-5/6 discounts) and
-- some students pay in several installments. total_due is a plain integer
-- (not the "2,800,000₮" formatted-text convention `price` uses) since it
-- needs real arithmetic against a sum of payments. Nullable/unset means the
-- feature hasn't been used for that registration yet — scoping to yearly
-- programs is done in the admin UI, not here.
alter table registrations add column if not exists total_due bigint;

create table if not exists registration_payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  amount bigint not null,
  paid_at date not null,
  created_at timestamptz not null default now()
);
create index if not exists registration_payments_registration_id_idx on registration_payments (registration_id);

-- One row per (user, device/browser) that opted into push notifications
-- (installed the site as an app, tapped "Мэдэгдэл идэвхжүүлэх"). No separate
-- enabled flag: a row existing here *is* "enabled" for that device — see
-- lib/push.ts, which deletes a row on the spot if a send comes back 410/404
-- (the browser revoked it on its own).
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on push_subscriptions (user_id);

-- Idempotency guard for the lesson-reminder cron (src/app/api/cron/lesson-reminders) —
-- without this, a lesson sitting in the scan window across two consecutive
-- ticks (or a re-run) would notify students twice.
create table if not exists lesson_reminders_sent (
  program_id text not null,
  lesson_index int not null,
  sent_at timestamptz not null default now(),
  primary key (program_id, lesson_index)
);

-- AI chatbot (src/app/api/chat, src/components/ChatWidget.tsx). visitor_id is
-- the anonymous `vid` cookie the pageview tracker already mints
-- (src/app/api/track/route.ts) so a not-logged-in visitor's conversation
-- survives a page navigation; user_id fills in on top of it when they're
-- signed in, and is nulled rather than cascaded on account deletion so the
-- transcript survives for review.
create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  visitor_id text not null,
  started_at timestamptz not null default now()
);
create index if not exists chat_conversations_visitor_id_idx on chat_conversations (visitor_id);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tokens_used int,
  model_used text,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_conversation_id_idx on chat_messages (conversation_id);

-- Facebook Messenger ↔ gmath account links (src/app/api/messenger/webhook).
-- A separate table rather than a column on `users` on purpose: one student may
-- message from more than one Facebook account, unlinking is a row delete
-- instead of nulling a user column, and the same shape extends to other
-- platforms later. psid is Facebook's Page-Scoped ID — permanent for a given
-- person↔Page pair, so one link keeps recognising them on every later message.
create table if not exists messenger_links (
  psid text primary key,
  user_id uuid not null references users(id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index if not exists messenger_links_user_id_idx on messenger_links (user_id);

-- One-time tokens behind the "Messenger-тэй холбох" button. The signed-in
-- student gets an m.me/<page>?ref=<token> link; Facebook hands the token back
-- on their first message, which is what proves the PSID belongs to that
-- account. Short-lived and single-use (consumed_at) so a leaked link can't be
-- replayed to attach someone else's Facebook to the account.
create table if not exists messenger_link_tokens (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Which channel a conversation came in on. Default 'website' so every row that
-- existed before Messenger keeps its meaning; Messenger rows store the PSID in
-- visitor_id, which is that person's stable per-Page identity.
alter table chat_conversations add column if not exists channel text not null default 'website';
alter table chat_conversations drop constraint if exists chat_conversations_channel_check;
alter table chat_conversations add constraint chat_conversations_channel_check
  check (channel in ('website', 'messenger'));

-- Complaints the chatbot flags out of live conversations (src/lib/ai/issues.ts).
-- The model appends a marker line when a message reports a service problem;
-- the route strips it from the reply and records the row here, so a "төлбөр
-- төлсөн ч идэвхжээгүй" no longer vanishes into an unread transcript.
create table if not exists chat_issues (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  channel text not null default 'website',
  message text not null,
  status text not null default 'new' check (status in ('new', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists chat_issues_status_idx on chat_issues (status);

-- The admin "Чат" tab orders by started_at desc and the user detail page
-- filters by user_id — neither had an index before that tab existed.
create index if not exists chat_conversations_started_at_idx on chat_conversations (started_at desc);
create index if not exists chat_conversations_user_id_idx on chat_conversations (user_id);

-- Scheduled publishing for articles. Null publish_at means "live from the
-- moment it was created" (every row that existed before this column), a future
-- value keeps the article out of every public query until then. notified_at
-- records when the "шинэ нийтлэл" push went out, so the cron that publishes
-- scheduled articles can tell which ones still owe a notification — and so an
-- immediate publish, which notifies inline, is never notified twice.
alter table articles add column if not exists publish_at timestamptz;
alter table articles add column if not exists notified_at timestamptz;
create index if not exists articles_publish_at_idx on articles (publish_at);

-- Existing articles were all live already; stamping notified_at keeps the
-- publish cron from re-announcing them.
update articles set notified_at = created_at where notified_at is null;

-- One row per click on an article's share button. Counted the same way
-- pageviews are (group in JS over a narrow select) rather than kept as a
-- counter column, so the rows stay available for "who shared what, when".
create table if not exists article_shares (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  channel text not null default 'facebook',
  visitor_id text,
  created_at timestamptz not null default now()
);
create index if not exists article_shares_article_id_idx on article_shares (article_id);

-- ---------------------------------------------------------------------------
-- Assessment tracks + the multiple-choice quiz (Энгийн / Сонгон)
-- ---------------------------------------------------------------------------
-- The original flow (pay → questionnaire → problems → teacher grading) is the
-- olympiad track; every pre-existing row is stamped as such. The two quiz
-- tracks reuse the same assessments row — and with it the whole QPay
-- invoice/resume machinery — but skip straight from 'paid' to 'completed'.
alter table assessments add column if not exists track text not null default 'olympiad';
alter table assessments drop constraint if exists assessments_track_check;
alter table assessments add constraint assessments_track_check
  check (track in ('regular','advanced','olympiad'));
alter table assessments add column if not exists quiz_grade smallint
  check (quiz_grade between 1 and 12);
alter table assessments add column if not exists quiz_score smallint;
alter table assessments add column if not exists quiz_total smallint;
alter table assessments add column if not exists ai_recommendation text;

-- Question bank for the quiz tracks. Grade-scoped: a 4th grader and a 9th
-- grader must never receive the same test. body_latex follows the problems
-- convention (Mongolian prose with $...$ math, rendered by MathText), and
-- choices is a jsonb array of 4 strings rendered the same way. correct_index
-- never leaves the server — see toPublicQuizQuestion.
create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('regular','advanced')),
  grade smallint not null check (grade between 1 and 12),
  topic text not null default '',
  body_latex text not null,
  choices jsonb not null,
  correct_index smallint not null check (correct_index between 0 and 3),
  -- Soft delete, like problems: a hard delete would orphan quiz_answers rows
  -- of every attempt that already used this question.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint quiz_questions_has_body check (body_latex <> ''),
  constraint quiz_questions_four_choices check (jsonb_array_length(choices) = 4)
);
create index if not exists quiz_questions_track_grade_idx
  on quiz_questions (track, grade) where active;

-- One row per question shown in one attempt, written when the test is
-- assembled (chosen_index null until submit). Assembling up front freezes the
-- question set, so a refresh resumes the same test instead of re-rolling for
-- easier questions.
create table if not exists quiz_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  question_id uuid not null references quiz_questions(id) on delete restrict,
  shown_order smallint not null,
  chosen_index smallint check (chosen_index between 0 and 3),
  is_correct boolean,
  created_at timestamptz not null default now(),
  unique (assessment_id, question_id)
);
create index if not exists quiz_answers_assessment_idx on quiz_answers (assessment_id, shown_order);

-- The quiz has its own, cheaper fee (admin-editable next to assessment_fee).
insert into app_settings (key, value) values ('quiz_fee', '10,000₮')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Live takeover: an admin pausing the bot to answer a visitor themselves
-- ---------------------------------------------------------------------------
-- Who is answering right now. 'bot' is the default and what every existing
-- conversation keeps; 'admin' makes /api/chat store the visitor's message
-- without calling the model at all — so a takeover costs nothing per message
-- and, more importantly, the bot can't talk over the person who took over.
alter table chat_conversations add column if not exists mode text not null default 'bot';
alter table chat_conversations drop constraint if exists chat_conversations_mode_check;
alter table chat_conversations add constraint chat_conversations_mode_check
  check (mode in ('bot', 'admin'));
alter table chat_conversations add column if not exists mode_changed_at timestamptz;

-- Admin replies live in the same transcript as the bot's, under their own
-- role, so the thread reads in order and the visitor's widget can label them.
alter table chat_messages drop constraint if exists chat_messages_role_check;
alter table chat_messages add constraint chat_messages_role_check
  check (role in ('user', 'assistant', 'admin'));

-- The visitor's widget polls for messages newer than the last one it has.
create index if not exists chat_messages_conversation_created_idx
  on chat_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Free sample questions + the turnaround promise
-- ---------------------------------------------------------------------------
-- A handful of questions per grade that anyone can try without signing in or
-- paying. Marked rather than kept in a second table so the admin writes them
-- in the same place; the paid test explicitly excludes them, so the free
-- sample never gives away a question a paying student will then be asked.
alter table quiz_questions add column if not exists sample boolean not null default false;
create index if not exists quiz_questions_sample_idx
  on quiz_questions (track, grade) where active and sample;

-- How long the teacher's written verdict takes, shown to parents before they
-- pay. A setting rather than hard-coded copy: it is a promise to a customer,
-- so the teacher owns its wording.
insert into app_settings (key, value) values ('assessment_sla', '1-2 хоног')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Roster lookups by program
-- ---------------------------------------------------------------------------
-- Every course/program admin page, the payment roster and notifyNewRecordings
-- read registrations filtered by program_id alone. The unique index on
-- (user_id, program_id) cannot serve that — a btree is only usable from its
-- leading column — so those pages were doing a sequential scan of the whole
-- table. Cheap now, quietly not cheap once the table has a few thousand rows.
create index if not exists registrations_program_id_idx on registrations (program_id);

-- ---------------------------------------------------------------------------
-- Хөтөлбөрийн танилцуулга бичлэг
-- ---------------------------------------------------------------------------
-- A public marketing video (the teacher's parent Q&A session) shown on the
-- yearly programme's own page. A column rather than hard-coded markup because
-- the teacher swaps the video far more often than we deploy — and C and D want
-- different ones. Any YouTube link/ID; empty means the section is not rendered.
alter table yearly_programs add column if not exists intro_video_url text;

-- ---------------------------------------------------------------------------
-- Сонгон бэлтгэлийн танхимын ангиуд
-- ---------------------------------------------------------------------------
-- Four in-person classes (5th-8th grade) that share one marketing layout but
-- differ in timetable and price. `template` picks the public page's layout;
-- null means the ordinary course page, so every existing course is unaffected.
alter table courses add column if not exists template text;

-- A recurring weekly timetable, one line per day: "<өдөр> <цаг>", e.g.
--   Даваа 14:30–16:30
-- Free text rather than a table of its own: the teacher edits three lines a
-- term, and a jsonb schema would buy nothing but an editor to maintain.
alter table courses add column if not exists weekly_schedule text;

-- Group size limit. Null means no limit, which is every course that existed
-- before the classroom groups — a room seats 18 and an online course does not.
-- Both 'pending' and 'active' count against it: a seat is claimed the moment
-- somebody registers, and an abandoned pending row is for the admin to remove.
alter table courses add column if not exists capacity smallint;

-- Short, human-typable URL for a course: /courses/songon5 rather than a uuid.
-- Optional — a course without one keeps its uuid address, and both keep
-- working, so links already shared do not break.
alter table courses add column if not exists slug text;
create unique index if not exists courses_slug_unique on courses (slug) where slug is not null;

-- ---------------------------------------------------------------------------
-- Сургалт ↔ нийтлэлийн холбоос
-- ---------------------------------------------------------------------------
-- Which articles belong beside which course. `program_id` is plain text with
-- no foreign key on purpose — it holds both a course's uuid and a yearly
-- programme's "program-c", exactly like registrations.program_id does, so one
-- table serves every kind of course instead of two near-identical ones.
--
-- `position` keeps the teacher's chosen order; without it the strip would
-- reshuffle itself on every read.
create table if not exists course_articles (
  program_id text not null,
  article_id uuid not null references articles(id) on delete cascade,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (program_id, article_id)
);
create index if not exists course_articles_program_idx on course_articles (program_id);

-- ---------------------------------------------------------------------------
-- Цуцалсан бүртгэл (устгахгүй)
-- ---------------------------------------------------------------------------
-- Cancelling a pending registration used to DELETE the row, which left no
-- trace of what was cancelled, when, or for how much — the admin log held a
-- copy but the registration itself was gone. A third status keeps the row and
-- says what happened to it.
--
-- A cancelled row holds no seat (countRegistrationsForProgram counts only
-- pending/active), never appears in the student's own list, and — via the two
-- partial indexes below — does not block the same student from registering for
-- that course again. Re-registration has to create a NEW row rather than
-- revive this one: the QPay sender_invoice_no is derived from the row id and
-- can never be reused once issued.
alter table registrations drop constraint if exists registrations_status_check;
alter table registrations add constraint registrations_status_check
  check (status in ('pending', 'active', 'cancelled'));

drop index if exists registrations_user_program_unique;
create unique index if not exists registrations_user_program_unique
  on registrations (user_id, program_id) where status <> 'cancelled';

drop index if exists registrations_phone_program_unique;
create unique index if not exists registrations_phone_program_unique
  on registrations (phone, program_id) where user_id is null and status <> 'cancelled';

-- Мэдэгдэл дээр дарахад очих хаяг. Нэмэгдэхээс өмнө bell доторх мэдэгдэл
-- зөвхөн текстээ модал цонхонд харуулдаг байсан — "Хичээлийн бичлэг орлоо"
-- гэснийг уншаад сурагч профайл руу өөрөө явж, сургалтаа өөрөө хайдаг.
-- Push мэдэгдэлд байсан pushUrl-ийг мөн энэ талбар орлоно: нэг мэдэгдэл
-- хаана ч дарагдсан нэг л газар аваачна.
alter table notifications add column if not exists link text;

-- ---------------------------------------------------------------------------
-- Олимпиадын үнэлгээ: C/D ангилал ба багшийн олон зураг
-- ---------------------------------------------------------------------------
-- The olympiad problem bank is now kept per category — C is 5th-6th grade and
-- D is 7th-8th, matching the year-long programme a child is preparing for. A
-- child is served problems from their own category only, so the difficulty
-- ladder inside a category means the same thing for everyone on it.
--
-- Nullable rather than not-null: the problems already in the bank predate the
-- split and the teacher re-files them by hand. A problem with no category is
-- shown to nobody once an assessment carries one (see getNextProblem).
alter table problems add column if not exists category text
  check (category is null or category in ('C', 'D'));
create index if not exists problems_category_idx on problems (category) where active;

-- Which bank this child is being assessed from. Derived from their grade when
-- the assessment starts and frozen there: a child who has a birthday, or whose
-- profile grade is corrected mid-assessment, must not suddenly be graded
-- against a different set of problems than the ones they were shown.
alter table assessments add column if not exists category text
  check (category is null or category in ('C', 'D'));

-- The teacher's verdict can carry several marked-up pages, not one. The old
-- single-image column stays: assessments graded before this change still hold
-- their scan there, and the result page falls back to it.
alter table assessments add column if not exists graded_sheet_paths text[] not null default '{}';

-- Түвшин, хүндрэл шаардахаа болив: бодлогыг багш өөрөө шалгалт руу сонгож
-- оруулдаг болсон тул автоматаар хүндрэлээр өгсөх шат хэрэггүй болсон.
-- Багана нь устгагдаагүй — өмнөх бодлогуудын утга үлдэж, шаардлагатай бол
-- буцаах боломжтой.
alter table problems alter column level drop not null;
alter table problems alter column difficulty drop not null;

-- ---------------------------------------------------------------------------
-- Шалгалт (багшийн зохиосон бодлогын багц)
-- ---------------------------------------------------------------------------
-- The teacher composes an exam: a title, a category, a price, and the problems
-- in the order children will meet them. This replaces the adaptive walk that
-- used to choose problems by difficulty — with a fixed set, two children's
-- results are comparable, which a per-child ladder could never promise.
create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('C', 'D')),
  -- Text like the course prices ("20,000₮"), for the same reason: it is shown
  -- to a parent exactly as typed.
  fee text not null default '0₮',
  -- draft: still being built. open: children of this category can take it.
  -- closed: finished, kept for the results that reference it.
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists exams_open_idx on exams (category, created_at desc) where status = 'open';

-- `on delete restrict` on the problem: a problem that a child has already been
-- examined on must not vanish from under the result. Archiving it is the way.
create table if not exists exam_problems (
  exam_id uuid not null references exams(id) on delete cascade,
  problem_id uuid not null references problems(id) on delete restrict,
  position smallint not null default 0,
  primary key (exam_id, problem_id)
);
create index if not exists exam_problems_exam_idx on exam_problems (exam_id, position);

-- Who sits this exam without paying, named by COURSE rather than by child:
-- "everyone on the C-ангилал course". The teacher already thinks in classes,
-- and a list of names goes stale the moment somebody new enrols — this does
-- not, because it is evaluated against the registrations as they stand.
--
-- program_id is plain text like registrations.program_id: a course uuid or a
-- yearly programme's "program-c".
create table if not exists exam_free_courses (
  exam_id uuid not null references exams(id) on delete cascade,
  program_id text not null,
  primary key (exam_id, program_id)
);
create index if not exists exam_free_courses_program_idx on exam_free_courses (program_id);

-- Replaced by the per-course list above.
drop table if exists exam_free_users;

-- Which exam a child sat. Null for the assessments taken before exams existed.
alter table assessments add column if not exists exam_id uuid references exams(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Админ/багшийн аккаунтууд
-- ---------------------------------------------------------------------------
-- Until now "admin" was one shared password in the environment, which is why
-- admin_logs records what happened but not who did it. Teachers need their own
-- way in — to take attendance and to mark work — so admins become rows.
--
-- Deliberately separate from `users`: a student session is long-lived and
-- allowed on two devices, while an admin session is short and single-purpose.
-- Merging them would mean a stolen student cookie reaches the grading queue.
--
-- The environment password keeps working as the owner's way in, so a mistake
-- in this table can never lock the teacher out of his own admin.
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Lowercased on write; the login form is case-insensitive on it.
  username text not null unique,
  password_hash text not null,
  password_salt text not null,
  role text not null check (role in ('full', 'viewer', 'teacher')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Who did it, at last. Null for anything done with the environment password.
alter table admin_logs add column if not exists actor_name text;

-- Certificate usage: who downloaded theirs, and how often a number was looked
-- up on the public "сертификат шалгах" page.
--
-- Rows rather than counters on `certificates`: an insert has no read-modify-
-- write race, and keeping the timestamps means "when was this last checked"
-- can be answered later without another migration.
create table if not exists certificate_events (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references certificates(id) on delete cascade,
  kind text not null check (kind in ('download', 'verify')),
  created_at timestamptz not null default now()
);
create index if not exists certificate_events_lookup_idx
  on certificate_events (certificate_id, kind);

-- Хүлээлгийн жагсаалт: which classes to open next, and when.
--
-- A parent whose child's grade has no open group leaves their name here, and
-- the admin reads the list as "eleven sixth-graders are waiting, most of them
-- asked for weekday evenings". `grade` is copied from the profile at the time
-- of asking rather than joined live — a child moves up a year, but the class
-- they were waiting for does not change.
create table if not exists waitlist_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  grade text not null,
  /** Free text: which times suit them, and anything else worth knowing. */
  note text not null default '',
  status text not null default 'waiting' check (status in ('waiting', 'notified', 'closed')),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  -- One live request per person per grade: asking twice updates the note
  -- rather than adding a second row to the same queue.
  unique (user_id, grade)
);
create index if not exists waitlist_requests_status_idx
  on waitlist_requests (status, created_at desc);

-- Хувааж төлөх: the date the second half was agreed for. Set only on
-- registrations that chose the 50/50 plan at enrollment; `total_due` carries
-- the full price and registration_payments records what has come in, so the
-- balance is already answerable — this column is what the family promised.
alter table registrations add column if not exists installment_due_date date;

-- Чатын тайлан: what the chatbot heard in a date range, sorted into themes by
-- the model and kept so the school can look back at what people were asking
-- in September without re-reading three hundred messages.
--
-- `summary` holds the model's structured answer as JSON — the shape lives in
-- src/lib/chatReport.ts. Stored rather than recomputed: the same range must
-- read the same way next month, and each run costs a model call.
create table if not exists chat_reports (
  id uuid primary key default gen_random_uuid(),
  from_date date not null,
  to_date date not null,
  message_count int not null default 0,
  conversation_count int not null default 0,
  summary jsonb not null,
  /** Who pressed the button; null when the weekly cron made it. */
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists chat_reports_created_idx on chat_reports (created_at desc);

-- Шалгалт цуцлах: a sitting can be voided so the student starts again from
-- scratch — the case that forced it was a child who photographed the wrong
-- page. Cancelled rows stay for the record; every query that looks for "this
-- child's exam" skips them, so the next attempt behaves like a first one.
alter table assessments drop constraint if exists assessments_status_check;
alter table assessments add constraint assessments_status_check check (status in
  ('awaiting_payment','paid','questionnaire_done','problems_submitted','grading','completed','cancelled'));

-- Тестийн аккаунт: an account the school uses to try the site out. Its
-- registrations are real rows — the point is to exercise the real payment
-- flow — so they are excluded from the money and the counts rather than
-- deleted. Lessons, exams and chat still work normally for it.
alter table users add column if not exists is_test boolean not null default false;

-- Ирц бүртгэл (танхимын хичээл). Zoom answers "who was here" for online
-- lessons on its own; a classroom lesson has nobody to ask, so the teacher
-- marks it. One row per student per lesson — marking again updates it.
create table if not exists lesson_roll_call (
  id uuid primary key default gen_random_uuid(),
  course_id text not null,
  lesson_index int not null,
  user_id uuid not null references users(id) on delete cascade,
  present boolean not null,
  /** The teacher's account name, so a correction has an author. */
  marked_by text,
  marked_at timestamptz not null default now(),
  unique (course_id, lesson_index, user_id)
);
create index if not exists lesson_roll_call_lesson_idx
  on lesson_roll_call (course_id, lesson_index);

-- Цуцлахын өмнөх төлөв, so restoring puts the sitting back where it was:
-- a child cancelled mid-solve returns to solving, one cancelled after handing
-- in returns to the queue.
alter table assessments add column if not exists cancelled_from text;
