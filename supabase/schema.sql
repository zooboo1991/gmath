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
  school text not null,
  grade text,
  facebook text,
  zoom text,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now()
);

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('upcoming', 'vod')),
  tag text not null,
  title text not null,
  topics text not null,
  price text not null,
  period text not null,
  start_date text,
  mode text
);

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

-- Seed the same starter courses the site ships with today, so /courses
-- isn't empty right after setup. Safe to edit/delete afterwards from /admin.
insert into courses (kind, tag, title, topics, price, period, start_date, mode)
values
  ('upcoming', 'A АНГИЛАЛ СУРАГЧ', '1 сарын сургалт', '4 долоо хоногийн хугацаанд 12 удаагийн хичээлийн оролттой онлайн сургалт.', '350,000₮', '/ сар', '2026.08.10', 'Онлайн'),
  ('upcoming', 'B,E АНГИЛАЛ сурагч', '1 сарын сургалт', '4 долоо хоногийн хугацаанд 12 удаагийн хичээлийн оролттой онлайн сургалт.', '350,000₮', '/ сар', '2026.08.17', 'Онлайн'),
  ('upcoming', 'БАГА БОЛОН ДУНД АНГИЙН БАГШ', '1 сарын сургалт', 'Бага болон дунд ангийн багш нарт зориулсан онлайн болон танхимын сургалт.', '350,000₮', '/ сар', '2026.08.03', 'Онлайн болон танхим'),
  ('upcoming', 'ДАСГАЛЖУУЛАГЧ БАГШ', 'Мэргэшүүлэх курс', 'Олимпиадад бэлтгэх арга зүй, дасгалжуулагчийн ур чадвар олгох гүнзгийрүүлсэн сургалт.', '480,000₮', '/ сар', '2026.08.24', 'Онлайн'),
  ('vod', 'A,B АНГИЛАЛ · ӨМНӨХ УЛИРАЛ', 'Үндэс суурь курс', 'Өмнөх улиралд явсан 12 хичээлийн бүрэн бичлэг, дасгалын хамт хэзээ ч эхлэх боломжтой.', '250,000₮', '/ багц', null, null),
  ('vod', 'C,D АНГИЛАЛ · ӨМНӨХ УЛИРАЛ', 'Гүнзгийрүүлсэн курс', 'Өмнөх жилийн бүрэн хичээлийн бичлэг, комбинаторик болон геометрийн модуль.', '480,000₮', '/ багц', null, null),
  ('vod', 'E АНГИЛАЛ · ӨМНӨХ УЛИРАЛ', 'Ахисан түвшний клуб', 'Улсын түвшний олимпиадад зориулсан бичлэг хэлбэрийн гүнзгийрүүлсэн бэлтгэл.', '350,000₮', '/ багц', null, null)
on conflict do nothing;
