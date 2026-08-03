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

-- Seed the same starter courses the site ships with today, so /courses
-- isn't empty right after setup. Safe to edit/delete afterwards from /admin.
--
-- `on conflict do nothing` did NOT make this re-runnable: courses has no
-- unique constraint for it to conflict on, so every re-run of this file
-- inserted another copy of all seven. The `where not exists` guard below is
-- what actually keeps it idempotent.
insert into courses (kind, tag, title, topics, price, period, start_date, mode)
select * from (values
  ('upcoming', 'A АНГИЛАЛ СУРАГЧ', '1 сарын сургалт', '4 долоо хоногийн хугацаанд 12 удаагийн хичээлийн оролттой онлайн сургалт.', '350,000₮', '/ сар', '2026.08.10', 'Онлайн'),
  ('upcoming', 'B,E АНГИЛАЛ сурагч', '1 сарын сургалт', '4 долоо хоногийн хугацаанд 12 удаагийн хичээлийн оролттой онлайн сургалт.', '350,000₮', '/ сар', '2026.08.17', 'Онлайн'),
  ('upcoming', 'БАГА БОЛОН ДУНД АНГИЙН БАГШ', '1 сарын сургалт', 'Бага болон дунд ангийн багш нарт зориулсан онлайн болон танхимын сургалт.', '350,000₮', '/ сар', '2026.08.03', 'Онлайн болон танхим'),
  ('upcoming', 'ДАСГАЛЖУУЛАГЧ БАГШ', 'Мэргэшүүлэх курс', 'Олимпиадад бэлтгэх арга зүй, дасгалжуулагчийн ур чадвар олгох гүнзгийрүүлсэн сургалт.', '480,000₮', '/ сар', '2026.08.24', 'Онлайн'),
  ('vod', 'A,B АНГИЛАЛ · ӨМНӨХ УЛИРАЛ', 'Үндэс суурь курс', 'Өмнөх улиралд явсан 12 хичээлийн бүрэн бичлэг, дасгалын хамт хэзээ ч эхлэх боломжтой.', '250,000₮', '/ багц', null, null),
  ('vod', 'C,D АНГИЛАЛ · ӨМНӨХ УЛИРАЛ', 'Гүнзгийрүүлсэн курс', 'Өмнөх жилийн бүрэн хичээлийн бичлэг, комбинаторик болон геометрийн модуль.', '480,000₮', '/ багц', null, null),
  ('vod', 'E АНГИЛАЛ · ӨМНӨХ УЛИРАЛ', 'Ахисан түвшний клуб', 'Улсын түвшний олимпиадад зориулсан бичлэг хэлбэрийн гүнзгийрүүлсэн бэлтгэл.', '350,000₮', '/ багц', null, null)
) as seed(kind, tag, title, topics, price, period, start_date, mode)
where not exists (
  select 1 from courses c where c.tag = seed.tag and c.title = seed.title
);

-- Sample lesson schedule for the demo "A АНГИЛАЛ СУРАГЧ" course, matching the
-- course detail page template. Safe to edit/replace from /admin afterwards.
update courses set lessons = '[
  {"topic": "Тооны дараалал ба хэв маяг", "schedule": "2026.08.10 Даваа гараг · 18:00–20:00"},
  {"topic": "Логикийн үндсэн бодлого", "schedule": "2026.08.12 Лхагва гараг · 18:00–20:00"},
  {"topic": "Тооны мэдрэмж ба тооллын систем", "schedule": "2026.08.14 Баасан гараг · 18:00–20:00"},
  {"topic": "Комбинаторикийн анхан шат", "schedule": "2026.08.17 Даваа гараг · 18:00–20:00"},
  {"topic": "Геометрийн дүрс, талбай", "schedule": "2026.08.19 Лхагва гараг · 18:00–20:00"},
  {"topic": "Логик бодлогын жишээ шинжилгээ", "schedule": "2026.08.21 Баасан гараг · 18:00–20:00"},
  {"topic": "Тэгш ба сондгой тоон шинж чанар", "schedule": "2026.08.24 Даваа гараг · 18:00–20:00"},
  {"topic": "Хэмжигдэхүүн, харьцаа", "schedule": "2026.08.26 Лхагва гараг · 18:00–20:00"},
  {"topic": "Хүснэгт, график унших", "schedule": "2026.08.28 Баасан гараг · 18:00–20:00"},
  {"topic": "Холимог бодлого шийдвэрлэх арга барил", "schedule": "2026.08.31 Даваа гараг · 18:00–20:00"},
  {"topic": "Дасгал давтлага", "schedule": "2026.09.02 Лхагва гараг · 18:00–20:00"},
  {"topic": "Мини олимпиад ба дүгнэлт", "schedule": "2026.09.04 Баасан гараг · 18:00–20:00"}
]'::jsonb
where tag = 'A АНГИЛАЛ СУРАГЧ' and title = '1 сарын сургалт';

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
