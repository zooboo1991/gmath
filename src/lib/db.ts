import { getPaymentProvider } from "./payment";
import { getSupabase } from "./supabase";
import { hashPassword, verifyPassword as verifyPasswordHash } from "./password";
import { parsePriceToNumber } from "./price";
import { splitHalves } from "./installment";
import { nextCertificateNumbers } from "./certificateNumber";
import { registrationBalance } from "./registration";
import { transliterate } from "./mnTransliterate";
import { sendPushToUsers } from "./push";
import { sendSms } from "./sms/skytel";
import { compareMn } from "./sortMn";
import { extractCourseCategories, getCourseAudience } from "./courseTag";
import { courseHref } from "./courseHref";

/**
 * Persistence layer backed by Supabase Postgres (see supabase/schema.sql
 * for the table definitions). Every function here is async now — this
 * replaced an earlier JSON-file placeholder with the same function names,
 * so callers just needed `await` added.
 */

// Postgres' own "invalid input syntax for type uuid" error (22P02) — a
// malformed id (e.g. from a mistyped URL or a forged session cookie) should
// mean "not found", not a 500.
function isInvalidUuidError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "22P02";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value can possibly match a `uuid` column.
 *
 * Asking Postgres instead costs a failed statement: `where id = 'songon8'`
 * raises 22P02, which the caller can catch but the database still logs as an
 * error. Every visit to a slug-addressed course page did that twice.
 */
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function parseHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type Role = "teacher" | "student";
export type PayMethod = "qpay" | "bank" | "manual";
/** "cancelled" is a kept row, not a deleted one — see the schema comment on registrations_status_check. */
export type RegistrationStatus = "pending" | "active" | "cancelled";
export type CourseKind = "upcoming" | "vod";
export type CourseStatus = "draft" | "published" | "archived";

export type User = {
  id: string;
  role: Role;
  lastName: string;
  firstName: string;
  phone: string;
  email: string;
  province: string;
  district: string;
  school: string;
  grade?: string;
  facebook?: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
};

export type PublicUser = Omit<User, "passwordHash" | "passwordSalt">;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash, passwordSalt, ...rest } = user;
  void passwordHash;
  void passwordSalt;
  return rest;
}

/**
 * Maps the `users` row that comes back from a `select("*, users(*)")` join.
 * Exported so other modules (lib/assessment/db.ts) reuse this one mapping
 * instead of writing their own — a duplicated mapper is how a newly added
 * column silently fails to appear in half the app.
 */
export function publicUserFromJoin(row: unknown): PublicUser | undefined {
  if (!row) return undefined;
  return toPublicUser(userFromRow(row as UserRow));
}

export type LessonMode = "online" | "inperson";

export type Lesson = {
  topic: string;
  schedule?: string;
  /** Missing on lessons saved before this field existed — treated as "online". */
  mode?: LessonMode;
  /** Room for this lesson. Falls back to the course's link when unset. Only meaningful when mode is "online". */
  zoomLink?: string;
  /** Filled in after the lesson, and shown instead of the room once it ends. */
  recordingLink?: string;
  /**
   * Storage path of this lesson's notes PDF (the problems worked through in
   * class), in the private `lesson-notes` bucket. A path rather than a URL for
   * the same reason solutions are: the bucket has no public URL and a signed
   * one is minted per view, for a student who is actually registered.
   */
  noteFile?: string;
  /** Size of that PDF in bytes, so the student sees what they are about to open. */
  noteSize?: number;
};

export type Course = {
  id: string;
  kind: CourseKind;
  status: CourseStatus;
  tag: string;
  title: string;
  topics: string;
  price: string;
  period: string;
  startDate?: string;
  mode?: string;
  coverImage?: string;
  facebookGroup?: string;
  zoomLink?: string;
  zoomMeetingId?: string;
  zoomPasscode?: string;
  lessons: Lesson[];
  showOnHomepage: boolean;
  /** Picks the public page's layout. Undefined = the ordinary course page. */
  template?: string;
  /** Recurring timetable, one "<өдөр> <цаг>" line per day. */
  weeklySchedule?: string;
  /** Seats in the group. Undefined = no limit. */
  capacity?: number;
  /** Short URL segment ("songon5"). Undefined = addressed by uuid. */
  slug?: string;
};

/**
 * The two yearly programs (C/D ангилал) — hand-written marketing pages with
 * an admin-editable settings row behind them. `id` is "program-c"/"program-d",
 * matching the ids already used in `registrations.program_id` from before
 * this row existed (see the schema comment) — never a real course.
 */
export type YearlyProgram = {
  id: string;
  tag: string;
  title: string;
  label: string;
  topics: string;
  price: string;
  period: string;
  facebookGroup?: string;
  zoomLink?: string;
  zoomMeetingId?: string;
  zoomPasscode?: string;
  lessons: Lesson[];
  showOnHomepage: boolean;
  /** Public YouTube link for this programme page's intro video. */
  introVideoUrl?: string;
};

export type Article = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: string;
  featured: boolean;
  createdAt: string;
  /**
   * When the article becomes public. Undefined means "already live" — that's
   * every article written before scheduling existed, so the absence of a value
   * can never hide one. A future value keeps it out of every public query
   * until then; see PUBLISHED_FILTER.
   */
  publishAt?: string;
};

export type Registration = {
  id: string;
  /** Undefined for a phone-only row admin added before that phone had an account — see `phone`. */
  userId?: string;
  /** Set only while userId is unset — the phone a manually-added registration is waiting to be claimed by. */
  phone?: string;
  programId: string;
  programLabel: string;
  price: string;
  payMethod: PayMethod;
  status: RegistrationStatus;
  createdAt: string;
  /** Set once a QPay invoice exists for this registration; undefined for bank transfers and the stub provider. */
  qpayInvoiceId?: string;
  qpayPaymentId?: string;
  qpayQrImage?: string;
  qpayShortUrl?: string;
  /** The actual agreed total for this student (can differ from `price` — discounts, negotiated deals). Set via the admin roster's payment tracking, yearly programs only. */
  totalDue?: number;
  /** The 50/50 plan's promised date for the second half. Unset means paid in one go. */
  installmentDueDate?: string;
};

/**
 * A teacher's training certificate — looked up publicly by its number, and
 * matched to a student/teacher account by phone so it can show up on their
 * own profile.
 */
export type Certificate = {
  id: string;
  certificateNumber: string;
  lastName: string;
  firstName: string;
  phone: string;
  category: string;
  course: string;
  /** ISO "YYYY-MM-DD"; display with formatCourseDate. */
  issuedDate: string;
  createdAt: string;
};

export type UserRow = {
  id: string;
  role: Role;
  last_name: string;
  first_name: string;
  phone: string;
  email: string;
  province: string | null;
  district: string | null;
  school: string;
  grade: string | null;
  facebook: string | null;
  password_hash: string;
  password_salt: string;
  created_at: string;
};

type CourseRow = {
  id: string;
  kind: CourseKind;
  status: CourseStatus;
  tag: string;
  title: string;
  topics: string;
  price: string;
  period: string;
  start_date: string | null;
  mode: string | null;
  cover_image: string | null;
  facebook_group: string | null;
  zoom_link: string | null;
  zoom_meeting_id: string | null;
  zoom_passcode: string | null;
  lessons: Lesson[] | null;
  show_on_homepage: boolean;
  template: string | null;
  weekly_schedule: string | null;
  capacity: number | null;
  slug: string | null;
};

type YearlyProgramRow = {
  id: string;
  tag: string;
  title: string;
  label: string;
  topics: string;
  price: string;
  period: string;
  facebook_group: string | null;
  zoom_link: string | null;
  zoom_meeting_id: string | null;
  zoom_passcode: string | null;
  lessons: Lesson[] | null;
  show_on_homepage: boolean;
  intro_video_url: string | null;
};

type ArticleRow = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image: string;
  author: string;
  featured: boolean;
  created_at: string;
  publish_at: string | null;
};

type RegistrationRow = {
  id: string;
  user_id: string | null;
  phone: string | null;
  program_id: string;
  program_label: string;
  price: string;
  pay_method: PayMethod;
  status: RegistrationStatus;
  created_at: string;
  qpay_invoice_id: string | null;
  qpay_payment_id: string | null;
  qpay_qr_image: string | null;
  qpay_short_url: string | null;
  total_due: number | null;
  installment_due_date: string | null;
};

type CertificateRow = {
  id: string;
  certificate_number: string;
  last_name: string;
  first_name: string;
  phone: string;
  category: string;
  course: string;
  issued_date: string;
  created_at: string;
};

export function userFromRow(row: UserRow): User {
  return {
    id: row.id,
    role: row.role,
    lastName: row.last_name,
    firstName: row.first_name,
    phone: row.phone,
    email: row.email,
    province: row.province ?? "",
    district: row.district ?? "",
    school: row.school,
    grade: row.grade ?? undefined,
    facebook: row.facebook ?? undefined,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at,
  };
}

function courseFromRow(row: CourseRow): Course {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    tag: row.tag,
    title: row.title,
    topics: row.topics,
    price: row.price,
    period: row.period,
    startDate: row.start_date ?? undefined,
    mode: row.mode ?? undefined,
    coverImage: row.cover_image ?? undefined,
    facebookGroup: row.facebook_group ?? undefined,
    zoomLink: row.zoom_link ?? undefined,
    zoomMeetingId: row.zoom_meeting_id ?? undefined,
    zoomPasscode: row.zoom_passcode ?? undefined,
    lessons: row.lessons ?? [],
    showOnHomepage: row.show_on_homepage,
    template: row.template ?? undefined,
    weeklySchedule: row.weekly_schedule ?? undefined,
    capacity: row.capacity ?? undefined,
    slug: row.slug ?? undefined,
  };
}

function yearlyProgramFromRow(row: YearlyProgramRow): YearlyProgram {
  return {
    id: row.id,
    tag: row.tag,
    title: row.title,
    label: row.label,
    topics: row.topics,
    price: row.price,
    period: row.period,
    facebookGroup: row.facebook_group ?? undefined,
    zoomLink: row.zoom_link ?? undefined,
    zoomMeetingId: row.zoom_meeting_id ?? undefined,
    zoomPasscode: row.zoom_passcode ?? undefined,
    lessons: row.lessons ?? [],
    showOnHomepage: row.show_on_homepage,
    introVideoUrl: row.intro_video_url ?? undefined,
  };
}

function articleFromRow(row: ArticleRow): Article {
  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    coverImage: row.cover_image,
    author: row.author,
    featured: row.featured,
    createdAt: row.created_at,
    publishAt: row.publish_at ?? undefined,
  };
}

function registrationFromRow(row: RegistrationRow): Registration {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    phone: row.phone ?? undefined,
    programId: row.program_id,
    programLabel: row.program_label,
    price: row.price,
    payMethod: row.pay_method,
    status: row.status,
    createdAt: row.created_at,
    qpayInvoiceId: row.qpay_invoice_id ?? undefined,
    qpayPaymentId: row.qpay_payment_id ?? undefined,
    qpayQrImage: row.qpay_qr_image ?? undefined,
    qpayShortUrl: row.qpay_short_url ?? undefined,
    totalDue: row.total_due ?? undefined,
    installmentDueDate: row.installment_due_date ?? undefined,
  };
}

function certificateFromRow(row: CertificateRow): Certificate {
  return {
    id: row.id,
    certificateNumber: row.certificate_number,
    lastName: row.last_name,
    firstName: row.first_name,
    phone: row.phone,
    category: row.category,
    course: row.course,
    issuedDate: row.issued_date,
    createdAt: row.created_at,
  };
}

/**
 * Distinct school names previously entered by other users, starting with
 * `query` — powers the school-name autocomplete on registration/profile
 * forms so a parent typing "1" sees "1-р сургууль", "11-р сургууль", etc.
 * from what's already been typed rather than everyone spelling the same
 * school a slightly different way.
 */
export async function listSchoolSuggestions(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  // Escape LIKE wildcards a user might type literally, so e.g. "50%" doesn't
  // become a wildcard match against every school.
  const escaped = trimmed.replace(/[%_]/g, (c) => `\\${c}`);
  const { data, error } = await getSupabase()
    .from("users")
    .select("school")
    .ilike("school", `${escaped}%`)
    .not("school", "eq", "")
    .limit(50);
  if (error) throw error;
  const distinct = [...new Set((data as { school: string }[]).map((r) => r.school.trim()))];
  return distinct.sort(compareMn).slice(0, 8);
}

export async function findUserByPhone(phone: string): Promise<User | undefined> {
  const { data, error } = await getSupabase().from("users").select("*").eq("phone", phone).maybeSingle();
  if (error) throw error;
  return data ? userFromRow(data as UserRow) : undefined;
}

export async function findUserById(id: string): Promise<User | undefined> {
  const { data, error } = await getSupabase().from("users").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? userFromRow(data as UserRow) : undefined;
}

export async function createUser(
  input: Omit<User, "id" | "createdAt" | "passwordHash" | "passwordSalt">,
  password: string
): Promise<User> {
  const existing = await findUserByPhone(input.phone);
  if (existing) throw new Error("phone_taken");

  const { hash, salt } = hashPassword(password);
  const { data, error } = await getSupabase()
    .from("users")
    .insert({
      role: input.role,
      last_name: input.lastName,
      first_name: input.firstName,
      phone: input.phone,
      email: input.email,
      province: input.province,
      district: input.district,
      school: input.school,
      grade: input.grade ?? null,
      facebook: input.facebook ?? null,
      password_hash: hash,
      password_salt: salt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return userFromRow(data as UserRow);
}

export async function verifyUserPassword(phone: string, password: string): Promise<User | null> {
  const user = await findUserByPhone(phone);
  if (!user) return null;
  return verifyPasswordHash(password, user.passwordHash, user.passwordSalt) ? user : null;
}

/**
 * How many devices one account may stay signed in on at once.
 *
 * One. Signing in anywhere signs the previous device out, which is both the
 * rule families understand ("нэг данс — нэг төхөөрөмж") and the one that
 * cannot strand anybody: with a cap of two, a phone's browser and the
 * installed app counted as two devices, so a parent signing in silently
 * knocked the child out and neither could tell why.
 */
export const MAX_SESSIONS_PER_USER = 1;

/**
 * Caps concurrent sessions at MAX_SESSIONS_PER_USER: the newest
 * MAX_SESSIONS_PER_USER - 1 rows are kept, everything older is deleted, and
 * then this login's row is inserted — so the total after a login is exactly
 * the cap. At the current cap of one that means every earlier device is
 * signed out the moment a new login succeeds. An evicted session id stops
 * resolving (see findSessionUserId), which is what logs that device out the
 * next time it's checked.
 *
 * Eviction happens by age of *login*, not of last use: `sessions` has no
 * last-seen column, and adding one would mean a write on every page view.
 */
export async function createSession(userId: string): Promise<string> {
  const supabase = getSupabase();

  const { data: existing, error: listError } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (listError) throw listError;

  const stale = (existing as { id: string }[]).slice(MAX_SESSIONS_PER_USER - 1).map((row) => row.id);
  if (stale.length > 0) {
    const { error: deleteError } = await supabase.from("sessions").delete().in("id", stale);
    if (deleteError) throw deleteError;
  }

  const { data, error } = await supabase.from("sessions").insert({ user_id: userId }).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function findSessionUserId(sessionId: string): Promise<string | undefined> {
  const { data, error } = await getSupabase().from("sessions").select("user_id").eq("id", sessionId).maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return (data as { user_id: string } | null)?.user_id ?? undefined;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await getSupabase().from("sessions").delete().eq("id", sessionId);
  if (error && !isInvalidUuidError(error)) throw error;
}

export type LoginLog = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
};

type LoginLogRow = {
  id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
};

function loginLogFromRow(row: LoginLogRow): LoginLog {
  return { id: row.id, userAgent: row.user_agent, ip: row.ip, createdAt: row.created_at };
}

// Fails silently — a device-log write must never be able to break a login.
export async function logLogin(userId: string, info: { userAgent: string | null; ip: string }): Promise<void> {
  const { error } = await getSupabase()
    .from("login_logs")
    .insert({ user_id: userId, user_agent: info.userAgent, ip: info.ip });
  if (error) console.error("[logLogin] failed to record login:", error);
}

export async function listLoginLogs(userId: string, limit = 50): Promise<LoginLog[]> {
  const { data, error } = await getSupabase()
    .from("login_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isInvalidUuidError(error)) return [];
    throw error;
  }
  return (data as LoginLogRow[]).map(loginLogFromRow);
}

/**
 * Changes a password and ends every session that was opened with the old one.
 *
 * Deleting the sessions is part of this operation, not the caller's job:
 * somebody resets their password precisely when they think another person is
 * in the account, and a reset that leaves the intruder signed in for another
 * 30 days answers the wrong question. The caller issues a fresh session
 * afterwards, so the device doing the reset stays signed in.
 */
export async function updateUserPassword(userId: string, newPassword: string): Promise<User | undefined> {
  const { hash, salt } = hashPassword(newPassword);
  const { data, error } = await getSupabase()
    .from("users")
    .update({ password_hash: hash, password_salt: salt })
    .eq("id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;

  const { error: sessionError } = await getSupabase().from("sessions").delete().eq("user_id", userId);
  if (sessionError) throw sessionError;

  return userFromRow(data as UserRow);
}

export async function updateUserProfile(
  userId: string,
  input: Partial<
    Pick<User, "lastName" | "firstName" | "province" | "district" | "school" | "grade" | "email" | "facebook">
  >
): Promise<User | undefined> {
  const patch: Record<string, unknown> = {};
  if (input.lastName !== undefined) patch.last_name = input.lastName;
  if (input.firstName !== undefined) patch.first_name = input.firstName;
  if (input.province !== undefined) patch.province = input.province;
  if (input.district !== undefined) patch.district = input.district;
  if (input.school !== undefined) patch.school = input.school;
  if (input.grade !== undefined) patch.grade = input.grade || null;
  if (input.email !== undefined) patch.email = input.email;
  if (input.facebook !== undefined) patch.facebook = input.facebook || null;

  const { data, error } = await getSupabase().from("users").update(patch).eq("id", userId).select("*").maybeSingle();
  if (error) throw error;
  return data ? userFromRow(data as UserRow) : undefined;
}

export async function listUsers(): Promise<PublicUser[]> {
  const { data, error } = await getSupabase()
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as UserRow[]).map((row) => toPublicUser(userFromRow(row)));
}

/**
 * When each account last signed in — for the "who is still active" column on
 * the user list. One query for everybody rather than one per row.
 */
export async function getLastLoginByUser(): Promise<Record<string, string>> {
  const { data, error } = await getSupabase()
    .from("login_logs")
    .select("user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  const latest: Record<string, string> = {};
  // Newest first, so the first sighting of a user is their last login.
  for (const row of data as { user_id: string; created_at: string }[]) {
    if (!latest[row.user_id]) latest[row.user_id] = row.created_at;
  }
  return latest;
}

export async function listCourses(
  kind?: CourseKind,
  opts?: { includeDrafts?: boolean }
): Promise<Course[]> {
  let query = getSupabase().from("courses").select("*");
  if (kind) query = query.eq("kind", kind);
  if (!opts?.includeDrafts) query = query.eq("status", "published");
  const { data, error } = await query;
  if (error) throw error;
  return (data as CourseRow[]).map(courseFromRow);
}

/** Card-sized course: no lesson schedule, which is the bulky part of a row. */
// slug comes straight off the row, so it is null rather than undefined here.
export type CourseSummary = Pick<Course, "id" | "tag" | "title" | "topics" | "price" | "period"> & {
  slug?: string | null;
};

/** Used by the "related courses" strip, which never renders lessons. */
export async function listPublishedCourseSummaries(limit?: number): Promise<CourseSummary[]> {
  let query = getSupabase()
    .from("courses")
    .select("id, tag, title, topics, price, period, slug")
    .eq("status", "published");
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data as CourseSummary[];
}

/**
 * The classroom classes, with their remaining seats worked out.
 *
 * Only the chatbot needs this shape: it has to answer "аль өдөр хичээллэдэг
 * вэ" and "суудал үлдсэн үү" in one breath, and the seat count is a live
 * number rather than something written into the prompt by hand.
 */
export async function listSongonClasses(): Promise<(Course & { seatsLeft: number })[]> {
  const { data, error } = await getSupabase()
    .from("courses")
    .select("*")
    .eq("template", "songon")
    .eq("status", "published")
    .order("title");
  if (error) throw error;

  const classes = (data as CourseRow[]).map(courseFromRow);
  const taken = await Promise.all(
    classes.map((c) => (c.capacity === undefined ? Promise.resolve(0) : countRegistrationsForProgram(c.id)))
  );
  return classes.map((c, i) => ({
    ...c,
    seatsLeft: c.capacity === undefined ? Number.MAX_SAFE_INTEGER : Math.max(0, c.capacity - taken[i]),
  }));
}

/** Homepage's "Сургалтууд" section — admin opts a course in via a checkbox on its edit page. */
export async function listHomepageCourses(): Promise<CourseSummary[]> {
  const { data, error } = await getSupabase()
    .from("courses")
    .select("id, tag, title, topics, price, period, slug")
    .eq("status", "published")
    .eq("show_on_homepage", true);
  if (error) throw error;
  return data as CourseSummary[];
}

/**
 * Finds a course by uuid or by its short slug, so /courses/songon5 and the
 * uuid address resolve to the same page. Callers holding a real id (the enroll
 * route, the admin) are unaffected: a uuid never matches a slug.
 */
export async function findCourseById(idOrSlug: string): Promise<Course | undefined> {
  // Only ask the uuid column about values that could be one. "songon8" never
  // matches an id, and asking anyway made Postgres log an error for every
  // single view of a slug-addressed course page.
  if (isUuid(idOrSlug)) {
    const { data, error } = await getSupabase().from("courses").select("*").eq("id", idOrSlug).maybeSingle();
    if (error && !isInvalidUuidError(error)) throw error;
    if (data) return courseFromRow(data as CourseRow);
  }

  const bySlug = await getSupabase().from("courses").select("*").eq("slug", idOrSlug).maybeSingle();
  if (bySlug.error) throw bySlug.error;
  return bySlug.data ? courseFromRow(bySlug.data as CourseRow) : undefined;
}

export async function addCourse(input: Omit<Course, "id">): Promise<Course> {
  const { data, error } = await getSupabase()
    .from("courses")
    .insert({
      kind: input.kind,
      status: input.status,
      tag: input.tag,
      title: input.title,
      topics: input.topics,
      price: input.price,
      period: input.period,
      start_date: input.startDate ?? null,
      mode: input.mode ?? null,
      cover_image: input.coverImage ?? null,
      facebook_group: input.facebookGroup ?? null,
      zoom_link: input.zoomLink ?? null,
      zoom_meeting_id: input.zoomMeetingId ?? null,
      zoom_passcode: input.zoomPasscode ?? null,
      lessons: input.lessons ?? [],
      show_on_homepage: input.showOnHomepage ?? false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return courseFromRow(data as CourseRow);
}

export async function updateCourse(
  id: string,
  // `capacity: null` is how the admin clears the seat limit — undefined would
  // mean "leave it alone", which would make a limit impossible to remove.
  input: Partial<Omit<Course, "id" | "capacity">> & { capacity?: number | null }
): Promise<Course | undefined> {
  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.tag !== undefined) patch.tag = input.tag;
  if (input.title !== undefined) patch.title = input.title;
  if (input.topics !== undefined) patch.topics = input.topics;
  if (input.price !== undefined) patch.price = input.price;
  if (input.period !== undefined) patch.period = input.period;
  if (input.startDate !== undefined) patch.start_date = input.startDate ?? null;
  if (input.mode !== undefined) patch.mode = input.mode ?? null;
  if (input.coverImage !== undefined) patch.cover_image = input.coverImage || null;
  if (input.facebookGroup !== undefined) patch.facebook_group = input.facebookGroup || null;
  if (input.zoomLink !== undefined) patch.zoom_link = input.zoomLink || null;
  if (input.zoomMeetingId !== undefined) patch.zoom_meeting_id = input.zoomMeetingId || null;
  if (input.zoomPasscode !== undefined) patch.zoom_passcode = input.zoomPasscode || null;
  if (input.lessons !== undefined) patch.lessons = input.lessons;
  if (input.showOnHomepage !== undefined) patch.show_on_homepage = input.showOnHomepage;
  if (input.weeklySchedule !== undefined) patch.weekly_schedule = input.weeklySchedule || null;
  if (input.capacity !== undefined) patch.capacity = input.capacity ?? null;
  if (input.slug !== undefined) patch.slug = input.slug || null;

  // An empty patch is "nothing to change", not "no such course". PostgREST
  // updates no rows for it and hands back nothing, which the caller used to
  // read as a missing course and answer 404 — so a request that only carried
  // article links was rejected, and the links were never written.
  if (Object.keys(patch).length === 0) return findCourseById(id);

  const { data, error } = await getSupabase().from("courses").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? courseFromRow(data as CourseRow) : undefined;
}

/** Only ever the two pre-seeded rows ("program-c"/"program-d") — no add, no delete, only edit. */
export async function listYearlyPrograms(): Promise<YearlyProgram[]> {
  const { data, error } = await getSupabase().from("yearly_programs").select("*");
  if (error) throw error;
  return (data as YearlyProgramRow[]).map(yearlyProgramFromRow);
}

export type YearlyProgramSummary = Pick<YearlyProgram, "id" | "tag" | "title" | "topics" | "price" | "period">;

/** Mirrors listHomepageCourses() — the admin opts a yearly program into the homepage the same way. */
export async function listHomepageYearlyPrograms(): Promise<YearlyProgramSummary[]> {
  const { data, error } = await getSupabase()
    .from("yearly_programs")
    .select("id, tag, title, topics, price, period")
    .eq("show_on_homepage", true);
  if (error) throw error;
  return data as YearlyProgramSummary[];
}

export async function findYearlyProgramById(id: string): Promise<YearlyProgram | undefined> {
  const { data, error } = await getSupabase().from("yearly_programs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? yearlyProgramFromRow(data as YearlyProgramRow) : undefined;
}

export async function updateYearlyProgram(
  id: string,
  input: Partial<Omit<YearlyProgram, "id">>
): Promise<YearlyProgram | undefined> {
  const patch: Record<string, unknown> = {};
  if (input.tag !== undefined) patch.tag = input.tag;
  if (input.title !== undefined) patch.title = input.title;
  if (input.label !== undefined) patch.label = input.label;
  if (input.topics !== undefined) patch.topics = input.topics;
  if (input.price !== undefined) patch.price = input.price;
  if (input.period !== undefined) patch.period = input.period;
  if (input.facebookGroup !== undefined) patch.facebook_group = input.facebookGroup || null;
  if (input.zoomLink !== undefined) patch.zoom_link = input.zoomLink || null;
  if (input.zoomMeetingId !== undefined) patch.zoom_meeting_id = input.zoomMeetingId || null;
  if (input.zoomPasscode !== undefined) patch.zoom_passcode = input.zoomPasscode || null;
  if (input.lessons !== undefined) patch.lessons = input.lessons;
  if (input.showOnHomepage !== undefined) patch.show_on_homepage = input.showOnHomepage;
  if (input.introVideoUrl !== undefined) patch.intro_video_url = input.introVideoUrl || null;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await getSupabase()
    .from("yearly_programs")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? yearlyProgramFromRow(data as YearlyProgramRow) : undefined;
}

/**
 * `registrations.program_id` is plain text with no foreign key (it also holds
 * ids of the static yearly programmes, which have no course row). Nothing
 * cascades, so deleting a course used to leave its registrations behind and
 * students kept seeing a course that no longer existed, with no schedule and
 * no way to clear it. The registrations go with it.
 */
export async function deleteCourse(id: string): Promise<boolean> {
  const { error: regError } = await getSupabase().from("registrations").delete().eq("program_id", id);
  if (regError) throw regError;

  // program_id has no foreign key (it spans courses and yearly programmes), so
  // the links have to be swept up by hand or they outlive the course.
  const { error: linkError } = await getSupabase().from("course_articles").delete().eq("program_id", id);
  if (linkError) throw linkError;

  const { error, count } = await getSupabase().from("courses").delete({ count: "exact" }).eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * "Live now": no publish time set, or one that has already passed. `now` is
 * evaluated by Postgres rather than Node, so a clock difference between the
 * app server and the database can't make a scheduled article appear early.
 *
 * Every article read defaults to applying this. Hiding a scheduled post is the
 * safe direction to be wrong in, so the admin callers opt out explicitly with
 * `{ includeScheduled: true }` instead of the public ones having to opt in.
 */
const PUBLISHED_FILTER = "publish_at.is.null,publish_at.lte.now";

type ArticleReadOptions = { includeScheduled?: boolean };

export async function listArticles(options: ArticleReadOptions = {}): Promise<Article[]> {
  let query = getSupabase().from("articles").select("*").order("created_at", { ascending: false });
  if (!options.includeScheduled) query = query.or(PUBLISHED_FILTER);
  const { data, error } = await query;
  if (error) throw error;
  return (data as ArticleRow[]).map(articleFromRow);
}

/**
 * The articles an admin has pinned to one course, in the order they chose.
 *
 * Scheduled articles are filtered out the same way every other public read
 * does it: pinning next week's post to a course must not publish it early.
 */
export async function listArticlesForProgram(programId: string): Promise<Article[]> {
  const { data, error } = await getSupabase()
    .from("course_articles")
    .select("article_id, position, articles(*)")
    .eq("program_id", programId)
    .order("position");
  if (error) throw error;

  const rows = data as unknown as { article_id: string; position: number; articles: ArticleRow | null }[];
  return rows
    .map((r) => r.articles)
    .filter((a): a is ArticleRow => a !== null)
    .map(articleFromRow)
    .filter((a) => !a.publishAt || new Date(a.publishAt) <= new Date());
}

/** Article ids only — what the admin form needs to show its current selection. */
export async function listArticleIdsForProgram(programId: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("course_articles")
    .select("article_id")
    .eq("program_id", programId)
    .order("position");
  if (error) throw error;
  return (data as { article_id: string }[]).map((r) => r.article_id);
}

/**
 * Replaces a course's whole article list. Delete-then-insert rather than a
 * diff: the set is a handful of rows chosen by hand, and reordering is as
 * common as adding, which a diff would have to handle anyway.
 */
export async function setProgramArticles(programId: string, articleIds: string[]): Promise<void> {
  const { error: clearError } = await getSupabase()
    .from("course_articles")
    .delete()
    .eq("program_id", programId);
  if (clearError) throw clearError;
  if (articleIds.length === 0) return;

  // Drop ids whose article no longer exists. Without this the foreign key
  // rejects the whole insert and the course save fails with a 500 — losing the
  // teacher's other edits because somebody deleted an article in another tab.
  const { data: live, error: liveError } = await getSupabase()
    .from("articles")
    .select("id")
    .in("id", articleIds);
  if (liveError) throw liveError;
  const existing = new Set((live as { id: string }[]).map((a) => a.id));
  const kept = articleIds.filter((id) => existing.has(id));
  if (kept.length === 0) return;

  const rows = kept.map((articleId, position) => ({
    program_id: programId,
    article_id: articleId,
    position,
  }));
  const { error } = await getSupabase().from("course_articles").insert(rows);
  if (error) throw error;
}

/** Scheduled-but-not-yet-live articles, newest first — the admin list shows these first. */
export async function listScheduledArticles(): Promise<Article[]> {
  const { data, error } = await getSupabase()
    .from("articles")
    .select("*")
    .not("publish_at", "is", null)
    .gt("publish_at", "now")
    .order("publish_at", { ascending: true });
  if (error) throw error;
  return (data as ArticleRow[]).map(articleFromRow);
}

/** Card-sized article: everything the listing needs, minus the body. */
export type ArticleSummary = Omit<Article, "content">;

/**
 * Related/"other articles" strips only need card fields. Selecting the full
 * `content` of every article — each one a rich-text HTML blob — just to render
 * three cards is a lot of rows to haul over the wire for nothing.
 */
export async function listArticleSummaries(
  limit?: number,
  options: ArticleReadOptions = {}
): Promise<ArticleSummary[]> {
  let query = getSupabase()
    .from("articles")
    .select("id, title, excerpt, cover_image, author, featured, created_at, publish_at")
    .order("created_at", { ascending: false });
  if (!options.includeScheduled) query = query.or(PUBLISHED_FILTER);
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data as Omit<ArticleRow, "content">[]).map((row) => ({
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    coverImage: row.cover_image,
    author: row.author,
    featured: row.featured,
    createdAt: row.created_at,
    publishAt: row.publish_at ?? undefined,
  }));
}

export async function findArticleById(
  id: string,
  options: ArticleReadOptions = {}
): Promise<Article | undefined> {
  let query = getSupabase().from("articles").select("*").eq("id", id);
  if (!options.includeScheduled) query = query.or(PUBLISHED_FILTER);
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? articleFromRow(data as ArticleRow) : undefined;
}

export async function addArticle(input: Omit<Article, "id" | "createdAt">): Promise<Article> {
  const scheduled = isFutureIso(input.publishAt);
  const { data, error } = await getSupabase()
    .from("articles")
    .insert({
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      cover_image: input.coverImage,
      author: input.author,
      featured: input.featured,
      publish_at: input.publishAt ?? null,
      // An immediate publish notifies from the route that created it, so it's
      // already accounted for. A scheduled one leaves this null, which is
      // exactly what the publish cron looks for.
      notified_at: scheduled ? null : new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return articleFromRow(data as ArticleRow);
}

function isFutureIso(iso?: string): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > Date.now();
}

export async function updateArticle(
  id: string,
  input: Partial<Omit<Article, "id" | "createdAt">>
): Promise<Article | undefined> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.excerpt !== undefined) patch.excerpt = input.excerpt;
  if (input.content !== undefined) patch.content = input.content;
  if (input.coverImage !== undefined) patch.cover_image = input.coverImage;
  if (input.author !== undefined) patch.author = input.author;
  if (input.featured !== undefined) patch.featured = input.featured;
  if (input.publishAt !== undefined) {
    // "" / null from the form means "publish immediately"; a future value
    // re-arms the cron by clearing notified_at, so moving a post's date
    // forward announces it at the new time instead of silently never.
    patch.publish_at = input.publishAt || null;
    if (isFutureIso(input.publishAt)) patch.notified_at = null;
  }

  const { data, error } = await getSupabase().from("articles").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? articleFromRow(data as ArticleRow) : undefined;
}

export async function deleteArticle(id: string): Promise<boolean> {
  const { error, count } = await getSupabase().from("articles").delete({ count: "exact" }).eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Scheduled articles whose time has come and which haven't been announced yet.
 * Visibility doesn't depend on this — PUBLISHED_FILTER already makes them
 * public the moment publish_at passes — only the notification does.
 */
export async function listArticlesDueForNotify(): Promise<Article[]> {
  const { data, error } = await getSupabase()
    .from("articles")
    .select("*")
    .is("notified_at", null)
    .not("publish_at", "is", null)
    .lte("publish_at", "now")
    .order("publish_at", { ascending: true });
  if (error) throw error;
  return (data as ArticleRow[]).map(articleFromRow);
}

/** Conditional on notified_at still being null, so two overlapping cron runs can't both announce. */
export async function markArticleNotified(id: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("articles")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id)
    .is("notified_at", null)
    .select("id");
  if (error) throw error;
  return (data as { id: string }[]).length > 0;
}

/** One row per share-button click. Best-effort: a visitor sharing must not see an error. */
export async function recordArticleShare(input: {
  articleId: string;
  channel: string;
  visitorId?: string;
}): Promise<void> {
  const { error } = await getSupabase().from("article_shares").insert({
    article_id: input.articleId,
    channel: input.channel,
    visitor_id: input.visitorId ?? null,
  });
  if (error) throw error;
}

/** articleId → share count, grouped in JS the same way getPageViewCountsByPrefix does. */
export async function getArticleShareCounts(): Promise<Record<string, number>> {
  const { data, error } = await getSupabase().from("article_shares").select("article_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data as { article_id: string }[]) {
    counts[row.article_id] = (counts[row.article_id] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

/** Public lookup — the certificate holder's own number is all that's needed. */
export async function findCertificateByNumber(number: string): Promise<Certificate | undefined> {
  const { data, error } = await getSupabase()
    .from("certificates")
    .select("*")
    .eq("certificate_number", number.trim())
    .maybeSingle();
  if (error) throw error;
  return data ? certificateFromRow(data as CertificateRow) : undefined;
}

export async function listCertificates(): Promise<Certificate[]> {
  const { data, error } = await getSupabase()
    .from("certificates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as CertificateRow[]).map(certificateFromRow);
}

/** For the profile page's own "Сертификат" section — matched by the signed-in user's phone. */
export async function listCertificatesByPhone(phone: string): Promise<Certificate[]> {
  const { data, error } = await getSupabase()
    .from("certificates")
    .select("*")
    .eq("phone", phone.trim())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as CertificateRow[]).map(certificateFromRow);
}

export type CertificateImportRow = Omit<Certificate, "id" | "createdAt">;

/**
 * Upserts by certificate_number, so re-uploading a spreadsheet with a
 * corrected row fixes it in place instead of creating a duplicate.
 */
function certificateToRow(r: CertificateImportRow) {
  return {
    certificate_number: r.certificateNumber,
    last_name: r.lastName,
    first_name: r.firstName,
    phone: r.phone,
    category: r.category,
    course: r.course,
    issued_date: r.issuedDate,
  };
}

export async function upsertCertificates(rows: CertificateImportRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error, count } = await getSupabase()
    .from("certificates")
    .upsert(rows.map(certificateToRow), { onConflict: "certificate_number", count: "exact" });
  if (error) throw error;
  return count ?? rows.length;
}

export async function createCertificate(input: CertificateImportRow): Promise<Certificate> {
  const { data, error } = await getSupabase()
    .from("certificates")
    .insert({
      certificate_number: input.certificateNumber,
      last_name: input.lastName,
      first_name: input.firstName,
      phone: input.phone,
      category: input.category,
      course: input.course,
      issued_date: input.issuedDate,
    })
    .select("*")
    .single();
  if (error) throw error;
  return certificateFromRow(data as CertificateRow);
}

export async function updateCertificate(
  id: string,
  input: Partial<CertificateImportRow>
): Promise<Certificate | undefined> {
  const patch: Record<string, unknown> = {};
  if (input.certificateNumber !== undefined) patch.certificate_number = input.certificateNumber;
  if (input.lastName !== undefined) patch.last_name = input.lastName;
  if (input.firstName !== undefined) patch.first_name = input.firstName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.category !== undefined) patch.category = input.category;
  if (input.course !== undefined) patch.course = input.course;
  if (input.issuedDate !== undefined) patch.issued_date = input.issuedDate;

  const { data, error } = await getSupabase()
    .from("certificates")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? certificateFromRow(data as CertificateRow) : undefined;
}

/**
 * Issues a certificate to everyone confirmed on a course.
 *
 * Run by hand from the course page once the course is over, rather than on a
 * date: only the teacher knows a course actually finished, and a certificate
 * issued by mistake is awkward to take back.
 *
 * Students and teachers are numbered in separate runs (S… and T…) because
 * that is how the numbers were kept before this existed. Anyone who already
 * holds a certificate for this course is skipped, so pressing the button
 * twice does not issue a second one.
 */
export async function issueCertificatesForProgram(input: {
  programId: string;
  /** Written onto a student's certificate — usually the programme's class. */
  studentCategory: string;
  /** Written onto a teacher's certificate. */
  teacherCategory: string;
  /** The course as it should read on the certificate ("I", "II"). */
  course: string;
  issuedDate: string;
}): Promise<{ created: Certificate[]; skipped: number }> {
  const registrations = (await listRegistrationsByProgram(input.programId)).filter(
    (r) => r.status === "active" && r.user
  );

  // Every number in use, so a new run continues after the last one; and every
  // certificate for this course, so nobody is handed a second.
  const all = await listCertificates();
  const takenForCourse = new Set(
    all.filter((c) => c.course === input.course).map((c) => c.phone)
  );

  const pending = registrations.filter((r) => !takenForCourse.has(r.user!.phone));
  const skipped = registrations.length - pending.length;
  if (pending.length === 0) return { created: [], skipped };

  const numbers = all.map((c) => c.certificateNumber);
  const rows: CertificateImportRow[] = [];
  for (const holder of ["teacher", "student"] as const) {
    const group = pending.filter((r) =>
      holder === "teacher" ? r.user!.role === "teacher" : r.user!.role !== "teacher"
    );
    if (group.length === 0) continue;
    const issued = nextCertificateNumbers(numbers, holder, input.issuedDate, group.length);
    group.forEach((registration, i) => {
      rows.push({
        certificateNumber: issued[i],
        lastName: registration.user!.lastName,
        firstName: registration.user!.firstName,
        phone: registration.user!.phone,
        category: holder === "teacher" ? input.teacherCategory : input.studentCategory,
        course: input.course,
        issuedDate: input.issuedDate,
      });
    });
  }

  const { data, error } = await getSupabase()
    .from("certificates")
    .insert(rows.map(certificateToRow))
    .select("*");
  if (error) throw error;
  return { created: (data as CertificateRow[]).map(certificateFromRow), skipped };
}

/** How often one certificate has been downloaded by its owner and looked up publicly. */
export type CertificateUsage = { downloads: number; verifies: number };

/**
 * Records a download or a public lookup.
 *
 * Never allowed to break the thing it is measuring: a failed insert (the table
 * missing before the migration runs, say) must not stop a student getting
 * their certificate.
 */
export async function logCertificateEvent(
  certificateId: string,
  kind: "download" | "verify"
): Promise<void> {
  try {
    await getSupabase().from("certificate_events").insert({ certificate_id: certificateId, kind });
  } catch {
    // Counting is not worth an error page.
  }
}

/** Usage for every certificate, keyed by id — one query for the whole table. */
export async function getCertificateUsage(): Promise<Record<string, CertificateUsage>> {
  const { data, error } = await getSupabase().from("certificate_events").select("certificate_id, kind");
  if (error) throw error;
  const usage: Record<string, CertificateUsage> = {};
  for (const row of data as { certificate_id: string; kind: string }[]) {
    const entry = (usage[row.certificate_id] ??= { downloads: 0, verifies: 0 });
    if (row.kind === "download") entry.downloads += 1;
    else entry.verifies += 1;
  }
  return usage;
}

export async function deleteCertificate(id: string): Promise<boolean> {
  const { error, count } = await getSupabase().from("certificates").delete({ count: "exact" }).eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function addRegistration(input: Omit<Registration, "id" | "createdAt">): Promise<Registration> {
  const { data, error } = await getSupabase()
    .from("registrations")
    .insert({
      user_id: input.userId,
      program_id: input.programId,
      program_label: input.programLabel,
      price: input.price,
      pay_method: input.payMethod,
      status: input.status,
      // Both set together by the 50/50 plan, or neither: the full price to
      // reach, and the day the second half was promised for.
      total_due: input.totalDue ?? null,
      installment_due_date: input.installmentDueDate ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return registrationFromRow(data as RegistrationRow);
}

/**
 * Admin adding someone by hand (paid in cash, over chat, etc) — created
 * straight to "active" since the admin's own action is the confirmation,
 * no payment step to wait on. `userId` unset means `phone` has no account
 * yet; the row attaches itself the moment one is created for that phone,
 * see linkPendingRegistrationsToUser().
 */
export async function addManualRegistration(input: {
  programId: string;
  programLabel: string;
  price: string;
  phone: string;
  userId?: string;
}): Promise<Registration> {
  const { data, error } = await getSupabase()
    .from("registrations")
    .insert({
      user_id: input.userId ?? null,
      phone: input.userId ? null : input.phone,
      program_id: input.programId,
      program_label: input.programLabel,
      price: input.price,
      pay_method: "manual",
      status: "active",
    })
    .select("*")
    .single();
  if (error) throw error;
  const registration = registrationFromRow(data as RegistrationRow);
  await notifyRegistrationActive(registration);
  return registration;
}

/** Attaches any phone-only registrations (added by admin before this account existed) to the account that just claimed that phone number. */
export async function linkPendingRegistrationsToUser(phone: string, userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("registrations")
    .update({ user_id: userId, phone: null })
    .eq("phone", phone)
    .neq("status", "cancelled")
    .is("user_id", null);
  if (error) throw error;
}

export async function findRegistrationById(id: string): Promise<Registration | undefined> {
  if (!isUuid(id)) return undefined;
  const { data, error } = await getSupabase().from("registrations").select("*").eq("id", id).maybeSingle();
  if (error) {
    // Kept as a backstop: the shape check above is what normally prevents it.
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? registrationFromRow(data as RegistrationRow) : undefined;
}

/** Used to resume a QPay checkout the student closed before paying, instead of bouncing off the (user_id, program_id) unique index. */
export async function findRegistrationByUserAndProgram(
  userId: string,
  programId: string
): Promise<Registration | undefined> {
  const { data, error } = await getSupabase()
    .from("registrations")
    .select("*")
    // A cancelled row is history, not something to resume — and it must not
    // stand in the way of registering for the same course again. The unique
    // indexes exclude cancelled rows for the same reason.
    .neq("status", "cancelled")
    .eq("user_id", userId)
    .eq("program_id", programId)
    .maybeSingle();
  if (error) throw error;
  return data ? registrationFromRow(data as RegistrationRow) : undefined;
}

export async function updateRegistration(
  id: string,
  patch: Record<string, unknown>
): Promise<Registration | undefined> {
  const { data, error } = await getSupabase()
    .from("registrations")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? registrationFromRow(data as RegistrationRow) : undefined;
}

/**
 * Fired the moment a registration flips pending → active, whichever path
 * caused it (bank approval, QPay confirmation, admin manual add). A no-op
 * for a still-unclaimed phone-only registration — nothing to notify yet.
 */
async function notifyRegistrationActive(registration: Registration): Promise<void> {
  if (!registration.userId) return;
  await createNotification({
    title: "Бүртгэл амжилттай боллоо",
    body: `Таны "${registration.programLabel}" сургалтанд бүртгэлээ. Та Профайл цэснээс сургалтын мэдээллээ харна уу.`,
    targetType: "users",
    userIds: [registration.userId],
    channel: "site",
    // Straight to their own card for this course — the Facebook group and the
    // schedule they were just promised live there.
    link: `/profile?course=${encodeURIComponent(registration.programId)}`,
  });

  // A fixed, hardcoded Latin string rather than transliterated Cyrillic —
  // same convention as the OTP SMS in otp.ts — since the exact wording
  // asked for here doesn't survive the Cyrillic->Latin map unchanged
  // ("профайл" would come out "profail", not "profile"). Never let an SMS
  // hiccup fail the registration that already succeeded.
  const user = await findUserById(registration.userId);
  if (user) {
    await sendSms(
      user.phone,
      "Ganbat bagshiin surgaltand amjilttai burtgegdlee. Ta profile tsesnees surgaltiin medeellee harna uu."
    ).catch((err) => console.error("[notifyRegistrationActive] sms send failed:", err));
  }
}

/**
 * Re-checks a still-pending QPay registration and marks it active if QPay
 * confirms it settled. Safe to call repeatedly — from the callback, a
 * client poll, or a manual "Шалгах" click.
 *
 * The gate is the stored invoice id, deliberately NOT pay_method. A row can
 * carry a live QPay invoice while pay_method still reads "bank" — the student
 * opened the bank-transfer option first, then paid the QR — and gating on
 * pay_method meant QPay's own callback for a PAID invoice was discarded in
 * silence: money in, seat never granted, nothing in any queue to notice it.
 * If QPay says an invoice we issued was paid, that settles the row and
 * pay_method is corrected to match where the money actually came from.
 */
export async function settleRegistrationPayment(id: string): Promise<Registration | undefined> {
  const registration = await findRegistrationById(id);
  if (!registration || registration.status !== "pending" || !registration.qpayInvoiceId) {
    return registration;
  }
  const result = await getPaymentProvider().checkPayment(registration.qpayInvoiceId);
  if (!result.paid) return registration;

  // Scoped to status="pending" so a duplicate/concurrent call (the QPay
  // webhook and a client poll can genuinely land at nearly the same time)
  // can't both "win" this transition and both fire notifyRegistrationActive.
  // updateRegistration() doesn't take a WHERE-status guard, hence the raw
  // query here instead.
  const { data, error } = await getSupabase()
    .from("registrations")
    .update({ status: "active", pay_method: "qpay", qpay_payment_id: result.reference })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return findRegistrationById(id);
  const updated = registrationFromRow(data as RegistrationRow);

  // A 50/50 registration paid only its first half through QPay. Recording it
  // here is what makes the roster's "Үлдэгдэл" the truth — the admin would
  // otherwise have to type in money the gateway already took. Guarded by the
  // status transition above, so this runs once.
  if (updated.totalDue !== undefined && updated.installmentDueDate) {
    const { now } = splitHalves(updated.totalDue);
    await addRegistrationPayment({
      registrationId: updated.id,
      amount: now,
      paidAt: new Date().toISOString().slice(0, 10),
    }).catch(() => {
      // The seat is granted either way; a missing payment row is something
      // the admin can add, a refused enrollment is not.
    });
  }

  await notifyRegistrationActive(updated);
  return updated;
}

/**
 * Marks a pending registration cancelled instead of deleting it, so the admin
 * list still shows what was cancelled and for how much.
 *
 * Scoped to status="pending" like every other transition here: a payment that
 * landed a moment ago must not be cancelled out from under itself. Returns the
 * row as it now stands (undefined only if the id is gone).
 */
export async function cancelPendingRegistration(id: string): Promise<Registration | undefined> {
  const { data, error } = await getSupabase()
    .from("registrations")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return findRegistrationById(id);
  return registrationFromRow(data as RegistrationRow);
}

export async function deleteRegistration(id: string): Promise<boolean> {
  const { error, count } = await getSupabase().from("registrations").delete({ count: "exact" }).eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function setRegistrationTotalDue(id: string, totalDue: number): Promise<Registration | undefined> {
  const { data, error } = await getSupabase()
    .from("registrations")
    .update({ total_due: totalDue })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? registrationFromRow(data as RegistrationRow) : undefined;
}

// ---------------------------------------------------------------------------
// Installment payments — see the schema comment on registration_payments.
// ---------------------------------------------------------------------------

/**
 * Records money that reached the account outside QPay — almost always a bank
 * transfer made by a parent who chose QPay on screen and then paid from their
 * banking app anyway.
 *
 * It rewrites `pay_method` to "bank" rather than leaving "qpay" in place: the
 * row has to say what actually happened, or the books claim a QPay payment
 * that QPay has never heard of. The invoice id is kept for the audit trail.
 *
 * Scoped to status="pending" for the same reason approveRegistration is —
 * a double-click must not notify the student twice.
 */
export async function settleRegistrationOutsideQpay(
  id: string,
  payment: { amount: number; paidAt: string }
): Promise<Registration | undefined> {
  const { data, error } = await getSupabase()
    .from("registrations")
    .update({ status: "active", pay_method: "bank" })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return findRegistrationById(id);

  const registration = registrationFromRow(data as RegistrationRow);
  await addRegistrationPayment({ registrationId: id, amount: payment.amount, paidAt: payment.paidAt });
  await notifyRegistrationActive(registration);
  return registration;
}

export type RegistrationPayment = {
  id: string;
  registrationId: string;
  amount: number;
  paidAt: string;
  createdAt: string;
};

type RegistrationPaymentRow = {
  id: string;
  registration_id: string;
  amount: number;
  paid_at: string;
  created_at: string;
};

function registrationPaymentFromRow(row: RegistrationPaymentRow): RegistrationPayment {
  return {
    id: row.id,
    registrationId: row.registration_id,
    amount: row.amount,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

/** Bulk-fetches every payment for a whole roster at once (~30 rows max) rather than lazily per row. */
export async function listPaymentsForRegistrations(registrationIds: string[]): Promise<RegistrationPayment[]> {
  if (registrationIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("registration_payments")
    .select("*")
    .in("registration_id", registrationIds)
    .order("paid_at", { ascending: true });
  if (error) throw error;
  return (data as RegistrationPaymentRow[]).map(registrationPaymentFromRow);
}

export async function addRegistrationPayment(input: {
  registrationId: string;
  amount: number;
  paidAt: string;
}): Promise<RegistrationPayment> {
  const { data, error } = await getSupabase()
    .from("registration_payments")
    .insert({ registration_id: input.registrationId, amount: input.amount, paid_at: input.paidAt })
    .select("*")
    .single();
  if (error) throw error;
  return registrationPaymentFromRow(data as RegistrationPaymentRow);
}

export async function deleteRegistrationPayment(id: string): Promise<boolean> {
  const { error, count } = await getSupabase()
    .from("registration_payments")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * A registration plus the parts of its course a paid-up student is entitled
 * to: the Facebook group, the Zoom room, and the lesson schedule.
 */
export type RegistrationWithGroup = Registration & {
  /**
   * The course's `tag` ("B АНГИЛАЛ СУРАГЧ"), which the profile list filters on
   * by audience and category. Falls back to `programLabel` — /api/enroll writes
   * it as "<title> (<tag>)" — so static yearly programs and courses whose row
   * has since been deleted stay filterable instead of dropping out of results.
   */
  tag?: string;
  /** The course's start date, so the profile list can sort soonest-first. */
  startDate?: string;
  facebookGroup?: string;
  zoomLink?: string;
  zoomMeetingId?: string;
  zoomPasscode?: string;
  lessons?: Lesson[];
};

type ProgramDetailsRow = {
  id: string;
  tag: string;
  start_date: string | null;
  facebook_group: string | null;
  zoom_link: string | null;
  zoom_meeting_id: string | null;
  zoom_passcode: string | null;
  lessons: Lesson[] | null;
};

export async function listRegistrationsByUser(
  userId: string,
  // Cancelled rows are kept for the admin's records. To the student the
  // registration is gone, which is what it looked like when cancelling deleted
  // the row outright — so they are excluded unless a caller asks for them.
  options: { includeCancelled?: boolean } = {}
): Promise<RegistrationWithGroup[]> {
  let rowQuery = getSupabase().from("registrations").select("*").eq("user_id", userId);
  if (!options.includeCancelled) rowQuery = rowQuery.neq("status", "cancelled");
  const { data, error } = await rowQuery;
  if (error) throw error;
  const registrations = (data as RegistrationRow[]).map(registrationFromRow);

  const courseIds = [
    ...new Set(registrations.filter((r) => UUID_RE.test(r.programId)).map((r) => r.programId)),
  ];
  // Yearly programs have no `courses` row — their ids ("program-c" etc.) live
  // in `yearly_programs` instead, keyed the same opaque-text way.
  const yearlyIds = [
    ...new Set(registrations.filter((r) => !UUID_RE.test(r.programId)).map((r) => r.programId)),
  ];

  const byId = new Map<string, ProgramDetailsRow>();
  if (courseIds.length > 0) {
    const { data: courseRows, error: courseError } = await getSupabase()
      .from("courses")
      .select("id, tag, start_date, facebook_group, zoom_link, zoom_meeting_id, zoom_passcode, lessons")
      .in("id", courseIds);
    if (courseError) throw courseError;
    for (const c of courseRows as ProgramDetailsRow[]) byId.set(c.id, c);
  }
  if (yearlyIds.length > 0) {
    const { data: yearlyRows, error: yearlyError } = await getSupabase()
      .from("yearly_programs")
      .select("id, tag, facebook_group, zoom_link, zoom_meeting_id, zoom_passcode, lessons")
      .in("id", yearlyIds);
    if (yearlyError) throw yearlyError;
    for (const p of yearlyRows as Omit<ProgramDetailsRow, "start_date">[]) {
      byId.set(p.id, { ...p, start_date: null });
    }
  }

  return registrations.map((r) => {
    const course = byId.get(r.programId);
    // Tag and start date are already public on /courses, so they ride along
    // whatever the status — the profile list needs them to sort and filter
    // pending registrations too.
    const withCourse: RegistrationWithGroup = {
      ...r,
      tag: course?.tag ?? r.programLabel,
      startDate: course?.start_date ?? undefined,
    };

    // The group and Zoom links, by contrast, are perks of a confirmed
    // registration, so they are attached server-side only for active ones — a
    // pending registration never carries them in its payload at all, which is
    // what stops an unpaid student from reading the class link out of the
    // network response.
    if (r.status !== "active" || !course) return withCourse;
    return {
      ...withCourse,
      facebookGroup: course.facebook_group ?? undefined,
      zoomLink: course.zoom_link ?? undefined,
      zoomMeetingId: course.zoom_meeting_id ?? undefined,
      zoomPasscode: course.zoom_passcode ?? undefined,
      lessons: course.lessons ?? [],
    };
  });
}

export async function listAllRegistrations(): Promise<(Registration & { user?: PublicUser })[]> {
  const { data, error } = await getSupabase()
    .from("registrations")
    .select("*, users(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data as (RegistrationRow & { users: UserRow | null })[]).map((row) => {
    const { users, ...regRow } = row;
    return {
      ...registrationFromRow(regRow),
      user: users ? toPublicUser(userFromRow(users)) : undefined,
    };
  });
}

/**
 * Seats claimed on a course. Counts 'pending' alongside 'active' because a
 * seat is taken the moment somebody registers — waiting for a bank transfer to
 * clear should not let a nineteenth child in. An abandoned pending row is the
 * admin's to delete from the roster, which frees the seat again.
 *
 * `excludeUserId` answers a different question: not "how full is this class"
 * but "may THIS student proceed". Their own held seat must not count against
 * them, or a student who started a payment and came back to finish it is told
 * the class is full — by their own booking.
 */
export async function countRegistrationsForProgram(
  programId: string,
  options: { excludeUserId?: string } = {}
): Promise<number> {
  let query = getSupabase()
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("program_id", programId)
    .in("status", ["pending", "active"]);
  // `user_id.neq.X` alone would also drop the rows where user_id IS NULL —
  // in SQL, NULL <> 'x' is NULL, not true. Those are the registrations an
  // admin added by phone number for a student with no account, and they hold
  // a seat like any other.
  if (options.excludeUserId) {
    query = query.or(`user_id.is.null,user_id.neq.${options.excludeUserId}`);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function listRegistrationsByProgram(
  programId: string
): Promise<(Registration & { user?: PublicUser })[]> {
  const { data, error } = await getSupabase()
    .from("registrations")
    .select("*, users(*)")
    .eq("program_id", programId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data as (RegistrationRow & { users: UserRow | null })[]).map((row) => {
    const { users, ...regRow } = row;
    return {
      ...registrationFromRow(regRow),
      user: users ? toPublicUser(userFromRow(users)) : undefined,
    };
  });
}

export async function approveRegistration(id: string): Promise<Registration | undefined> {
  // Scoped to status="pending" so this is a true pending→active transition
  // (idempotent against a double-click, and tells us whether to notify) —
  // not an unconditional overwrite.
  const { data, error } = await getSupabase()
    .from("registrations")
    .update({ status: "active" })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return findRegistrationById(id);
  const registration = registrationFromRow(data as RegistrationRow);
  await notifyRegistrationActive(registration);
  return registration;
}

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------

export type DashboardStats = {
  students: number;
  teachers: number;
  /** Distinct students with at least one confirmed registration. */
  studentsInClass: number;
  /** Distinct teachers with at least one confirmed registration. */
  teachersInClass: number;
  courses: number;
  coursesPublished: number;
  coursesDraft: number;
  coursesUpcoming: number;
  coursesVod: number;
  articles: number;
  activeRegistrations: number;
  pendingRegistrations: number;
  /** Value of confirmed registrations. */
  revenue: number;
  /** Value still waiting on an admin to confirm payment. */
  pendingRevenue: number;
  /** The money, as the roster counts it: due, in, and still out. */
  money: {
    /** Everything a live registration is expected to pay — the agreed amount where one was set, the course price otherwise. */
    totalDue: number;
    /** Installments recorded by hand, plus QPay payments the gateway settled. */
    paid: number;
    /** totalDue − paid. */
    outstanding: number;
    /** Of the outstanding: seats not yet confirmed. */
    pendingSeats: number;
    /** Of the outstanding: confirmed students still paying in installments. */
    installmentBalance: number;
    /** Confirmed registrations with neither an agreed amount nor a QPay settlement — counted as unpaid, and worth setting an amount on. */
    unsetAmountCount: number;
  };
  qpayCount: number;
  bankCount: number;
  /** Busiest courses by confirmed registrations. */
  topCourses: { label: string; active: number; pending: number }[];
};

async function countRows(table: string, filters: Record<string, string> = {}): Promise<number> {
  let query = getSupabase().from(table).select("*", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Every figure on the admin dashboard, in one round of queries.
 *
 * Counts come back as head-only queries (no rows transferred). Registrations
 * are the exception: "how many distinct students are in class" needs each
 * row's user and role, so those are fetched and reduced here. That is fine at
 * this school's size; if registrations ever reach tens of thousands this
 * should become a Postgres view.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const [students, teachers, courses, coursesPublished, coursesArchived, coursesUpcoming, coursesVod, articles] =
    await Promise.all([
      countRows("users", { role: "student" }),
      countRows("users", { role: "teacher" }),
      countRows("courses"),
      countRows("courses", { status: "published" }),
      countRows("courses", { status: "archived" }),
      countRows("courses", { kind: "upcoming" }),
      countRows("courses", { kind: "vod" }),
      countRows("articles"),
    ]);

  const { data, error } = await getSupabase()
    .from("registrations")
    .select("id, user_id, program_label, price, total_due, pay_method, status, users(role)");
  if (error) throw error;

  // A registration belongs to exactly one user, but the client types an
  // embedded relation as an array, so accept either shape.
  type JoinedUser = { role: Role } | { role: Role }[] | null;
  const rows = data as unknown as {
    id: string;
    user_id: string;
    program_label: string;
    price: string;
    total_due: number | null;
    pay_method: PayMethod;
    status: RegistrationStatus;
    users: JoinedUser;
  }[];
  const roleOf = (users: JoinedUser): Role | undefined =>
    (Array.isArray(users) ? users[0] : users)?.role;

  // What has actually been received, per registration. Cancelled rows are
  // excluded below, so their payments never reach any total.
  const payments = await listPaymentsForRegistrations(
    rows.filter((r) => r.status !== "cancelled").map((r) => r.id)
  );
  const paidByRegistration = new Map<string, number>();
  for (const payment of payments) {
    paidByRegistration.set(
      payment.registrationId,
      (paidByRegistration.get(payment.registrationId) ?? 0) + payment.amount
    );
  }

  const money = {
    totalDue: 0,
    paid: 0,
    outstanding: 0,
    pendingSeats: 0,
    installmentBalance: 0,
    unsetAmountCount: 0,
  };

  const activeStudentIds = new Set<string>();
  const activeTeacherIds = new Set<string>();
  const byCourse = new Map<string, { active: number; pending: number }>();
  let activeRegistrations = 0;
  let pendingRegistrations = 0;
  let revenue = 0;
  let pendingRevenue = 0;
  let qpayCount = 0;
  let bankCount = 0;

  for (const row of rows) {
    const amount = parsePriceToNumber(row.price);
    const bucket = byCourse.get(row.program_label) ?? { active: 0, pending: 0 };

    // Cancelled rows count towards nothing — they used to be deleted, and a
    // plain `else` here would have quietly filed them under "pending".
    if (row.status === "cancelled") continue;

    if (row.status === "active") {
      activeRegistrations += 1;
      revenue += amount;
      bucket.active += 1;
      if (roleOf(row.users) === "teacher") activeTeacherIds.add(row.user_id);
      else activeStudentIds.add(row.user_id);
    } else {
      pendingRegistrations += 1;
      pendingRevenue += amount;
      bucket.pending += 1;
    }

    byCourse.set(row.program_label, bucket);
    if (row.pay_method === "qpay") qpayCount += 1;
    else bankCount += 1;

    // One rule, shared with the student's payment tab — see registrationBalance.
    const { due, paid, balance: owed, settledByGateway } = registrationBalance(
      {
        price: row.price,
        totalDue: row.total_due ?? undefined,
        status: row.status,
        payMethod: row.pay_method,
      },
      paidByRegistration.get(row.id) ?? 0
    );

    money.totalDue += due;
    money.paid += paid;
    money.outstanding += owed;
    if (row.status === "active") {
      money.installmentBalance += owed;
      if (row.total_due === null && !settledByGateway) money.unsetAmountCount += 1;
    } else {
      money.pendingSeats += owed;
    }
  }

  const topCourses = [...byCourse.entries()]
    .map(([label, counts]) => ({ label, ...counts }))
    .sort((a, b) => b.active + b.pending - (a.active + a.pending))
    .slice(0, 6);

  return {
    students,
    teachers,
    studentsInClass: activeStudentIds.size,
    teachersInClass: activeTeacherIds.size,
    courses,
    coursesPublished,
    coursesDraft: courses - coursesPublished - coursesArchived,
    coursesUpcoming,
    coursesVod,
    articles,
    activeRegistrations,
    pendingRegistrations,
    revenue,
    pendingRevenue,
    money,
    qpayCount,
    bankCount,
    topCourses,
  };
}

// ---------------------------------------------------------------------------
// Analytics (pageviews)
// ---------------------------------------------------------------------------

export async function logPageView(input: { path: string; referrer: string | null; visitorId: string }): Promise<void> {
  const { error } = await getSupabase().from("page_views").insert({
    path: input.path,
    referrer: input.referrer,
    visitor_id: input.visitorId,
  });
  if (error) throw error;
}

/** Total pageview count per exact path, for paths starting with `prefix` — e.g. per-course "Харсан" counts on the admin course list. */
export async function getPageViewCountsByPrefix(prefix: string): Promise<Record<string, number>> {
  const { data, error } = await getSupabase().from("page_views").select("path").like("path", `${prefix}%`);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data as { path: string }[]) {
    counts[row.path] = (counts[row.path] ?? 0) + 1;
  }
  return counts;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** All-time pageview count — a small head-only query, independent of whatever date range the admin has filtered analytics to. */
export async function getTotalPageViews(): Promise<number> {
  return countRows("page_views");
}

export type AnalyticsRangeStats = {
  views: number;
  visitors: number;
  /** Visits: one visitor's run of pages, ended by half an hour of silence. */
  sessions: number;
  /** Time spent on the site across every visit, in minutes. */
  totalMinutes: number;
  /** Average length of a visit, in minutes (one decimal). */
  avgSessionMinutes: number;
  /** Pages per visit (one decimal). */
  pagesPerSession: number;
  /** Percentage of visits that were a single page and nothing more. */
  bounceRate: number;
  /** Visitors whose very first view of the site falls in this range. */
  newVisitors: number;
  topPages: { path: string; views: number }[];
  topReferrers: { referrer: string; views: number }[];
  /** One entry per calendar day in the range, oldest first. */
  daily: { date: string; views: number }[];
  /** Views by hour of the Mongolian day, 0–23 — when people actually come. */
  byHour: { hour: number; views: number }[];
  /** Views by weekday, Monday first. */
  byWeekday: { weekday: string; views: number }[];
  newRegistrations: number;
  newRevenue: number;
  newUsers: number;
};

/**
 * Reads every row a filter matches, not the first page of them.
 *
 * PostgREST caps a response at 1000 rows. The analytics figures were counted
 * off that capped array, so the moment a range held more than a thousand
 * views every number on the page quietly froze at "1000" — which is exactly
 * what the dashboard was showing.
 */
async function fetchAllRows<T>(build: () => {
  range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>;
}): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await build().range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

/** A visit ends after this much silence from the same visitor. */
const SESSION_GAP_MS = 30 * 60 * 1000;
const WEEKDAY_LABELS = ["Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"];

/**
 * Splits one visitor's views into visits and measures them.
 *
 * The last page of a visit has no "next view" to measure against, so a visit
 * is only as long as the gap between its first and last view — a single-page
 * visit counts as zero minutes. That undercounts, but every alternative
 * (assuming an average, pinging from the browser) invents numbers instead.
 */
function measureSessions(
  timestampsByVisitor: Map<string, number[]>
): { sessions: number; totalMs: number; bounces: number } {
  let sessions = 0;
  let totalMs = 0;
  let bounces = 0;

  for (const times of timestampsByVisitor.values()) {
    times.sort((a, b) => a - b);
    let start = times[0];
    let previous = times[0];
    let pages = 1;

    const close = () => {
      sessions += 1;
      totalMs += previous - start;
      if (pages === 1) bounces += 1;
    };

    for (let i = 1; i < times.length; i += 1) {
      if (times[i] - previous > SESSION_GAP_MS) {
        close();
        start = times[i];
        pages = 1;
      } else {
        pages += 1;
      }
      previous = times[i];
    }
    close();
  }

  return { sessions, totalMs, bounces };
}

/**
 * Every analytics figure scoped to one admin-picked date range (calendar
 * dates, inclusive both ends) — pageviews plus, since the admin is already
 * looking at "what happened in this period", the business metrics that
 * answer the same question: how many people signed up or registered, and
 * how much of that turned into confirmed revenue.
 */
export async function getAnalyticsStatsForRange(fromDate: string, toDate: string): Promise<AnalyticsRangeStats> {
  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;

  type ViewRow = { path: string; referrer: string | null; visitor_id: string; created_at: string };

  const [viewRows, earlierVisitorRows, regRows, newUsers] = await Promise.all([
    fetchAllRows<ViewRow>(() =>
      getSupabase()
        .from("page_views")
        .select("path, referrer, visitor_id, created_at")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at")
    ),
    // Who had already been here before this range started — the rest are new.
    fetchAllRows<{ visitor_id: string }>(() =>
      getSupabase().from("page_views").select("visitor_id").lt("created_at", fromIso)
    ),
    getSupabase()
      .from("registrations")
      .select("price, status, created_at")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .then(({ data, error }) => {
        if (error) throw error;
        return data as { price: string; status: RegistrationStatus; created_at: string }[];
      }),
    getSupabase()
      .from("users")
      .select("*", { count: "exact", head: true })
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .then(({ count, error }) => {
        if (error) throw error;
        return count ?? 0;
      }),
  ]);

  const visitors = new Set<string>();
  const byPage = new Map<string, number>();
  const byReferrer = new Map<string, number>();
  const byDay = new Map<string, number>();
  const timesByVisitor = new Map<string, number[]>();
  const hourCounts = new Array(24).fill(0) as number[];
  const weekdayCounts = new Array(7).fill(0) as number[];

  for (const row of viewRows) {
    visitors.add(row.visitor_id);
    byPage.set(row.path, (byPage.get(row.path) ?? 0) + 1);

    const referrerLabel = row.referrer ? (parseHostname(row.referrer) ?? "Бусад") : "Шууд орсон";
    byReferrer.set(referrerLabel, (byReferrer.get(referrerLabel) ?? 0) + 1);

    const day = row.created_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);

    const at = new Date(row.created_at);
    const times = timesByVisitor.get(row.visitor_id) ?? [];
    times.push(at.getTime());
    timesByVisitor.set(row.visitor_id, times);

    // Mongolian wall clock (UTC+8, no DST): "when do people come" has to be
    // answered in the hours a parent here would recognise.
    const local = new Date(at.getTime() + 8 * 60 * 60 * 1000);
    hourCounts[local.getUTCHours()] += 1;
    // getUTCDay() is Sunday-first; the labels start on Monday.
    weekdayCounts[(local.getUTCDay() + 6) % 7] += 1;
  }

  const { sessions, totalMs, bounces } = measureSessions(timesByVisitor);
  const earlierVisitors = new Set(earlierVisitorRows.map((r) => r.visitor_id));
  const newVisitors = [...visitors].filter((id) => !earlierVisitors.has(id)).length;
  const round1 = (value: number) => Math.round(value * 10) / 10;

  const daily: { date: string; views: number }[] = [];
  for (
    let cursor = new Date(fromIso);
    cursor.toISOString().slice(0, 10) <= toDate;
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    const date = cursor.toISOString().slice(0, 10);
    daily.push({ date, views: byDay.get(date) ?? 0 });
  }

  const topPages = [...byPage.entries()]
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);
  const topReferrers = [...byReferrer.entries()]
    .map(([referrer, views]) => ({ referrer, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 6);

  // A cancelled registration is not one this period produced — it read as one
  // fewer here back when cancelling deleted the row, and it still should.
  const liveRegRows = regRows.filter((r) => r.status !== "cancelled");
  let newRevenue = 0;
  for (const r of liveRegRows) {
    if (r.status === "active") newRevenue += parsePriceToNumber(r.price);
  }

  return {
    views: viewRows.length,
    visitors: visitors.size,
    sessions,
    totalMinutes: Math.round(totalMs / 60000),
    avgSessionMinutes: sessions > 0 ? round1(totalMs / 60000 / sessions) : 0,
    pagesPerSession: sessions > 0 ? round1(viewRows.length / sessions) : 0,
    bounceRate: sessions > 0 ? Math.round((bounces / sessions) * 100) : 0,
    newVisitors,
    byHour: hourCounts.map((views, hour) => ({ hour, views })),
    byWeekday: weekdayCounts.map((views, i) => ({ weekday: WEEKDAY_LABELS[i], views })),
    topPages,
    topReferrers,
    daily,
    newRegistrations: liveRegRows.length,
    newRevenue,
    newUsers,
  };
}

// ---------------------------------------------------------------------------
// Notifications — admin broadcasts to users. See supabase/schema.sql for why
// the recipient set is materialized at send time rather than recomputed live.
// ---------------------------------------------------------------------------

export type NotificationTargetType = "all" | "students" | "teachers" | "course" | "users";
export type NotificationChannel = "site" | "sms" | "both";

export type Notification = {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
  /** Where clicking the notification lands. Unset = plain announcement. */
  link?: string;
  targetType: NotificationTargetType;
  targetCourseId?: string;
  targetCourseLabel?: string;
  channel: NotificationChannel;
  recipientCount: number;
  createdAt: string;
};

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  link: string | null;
  target_type: NotificationTargetType;
  target_course_id: string | null;
  target_course_label: string | null;
  channel: NotificationChannel;
  recipient_count: number;
  created_at: string;
};

function notificationFromRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url ?? undefined,
    link: row.link ?? undefined,
    targetType: row.target_type,
    targetCourseId: row.target_course_id ?? undefined,
    targetCourseLabel: row.target_course_label ?? undefined,
    channel: row.channel,
    recipientCount: row.recipient_count,
    createdAt: row.created_at,
  };
}

type NotificationTarget = {
  targetType: NotificationTargetType;
  targetCourseId?: string;
  userIds?: string[];
};

async function resolveNotificationRecipients(target: NotificationTarget): Promise<{ id: string; phone: string }[]> {
  const supabase = getSupabase();

  if (target.targetType === "all") {
    const { data, error } = await supabase.from("users").select("id, phone");
    if (error) throw error;
    return data as { id: string; phone: string }[];
  }

  if (target.targetType === "students" || target.targetType === "teachers") {
    const role = target.targetType === "students" ? "student" : "teacher";
    const { data, error } = await supabase.from("users").select("id, phone").eq("role", role);
    if (error) throw error;
    return data as { id: string; phone: string }[];
  }

  if (target.targetType === "course") {
    if (!target.targetCourseId) return [];
    const { data, error } = await supabase
      .from("registrations")
      .select("user_id, users(id, phone)")
      .eq("program_id", target.targetCourseId)
      .eq("status", "active");
    if (error) throw error;
    type Row = { user_id: string; users: { id: string; phone: string } | { id: string; phone: string }[] | null };
    const seen = new Map<string, string>();
    for (const row of data as unknown as Row[]) {
      const u = Array.isArray(row.users) ? row.users[0] : row.users;
      if (u) seen.set(u.id, u.phone);
    }
    return [...seen.entries()].map(([id, phone]) => ({ id, phone }));
  }

  // "users" — explicit selection
  if (!target.userIds || target.userIds.length === 0) return [];
  const { data, error } = await supabase.from("users").select("id, phone").in("id", target.userIds);
  if (error) throw error;
  return data as { id: string; phone: string }[];
}

export async function createNotification(input: {
  title: string;
  body: string;
  imageUrl?: string;
  targetType: NotificationTargetType;
  targetCourseId?: string;
  targetCourseLabel?: string;
  userIds?: string[];
  channel: NotificationChannel;
  /**
   * Where clicking this notification lands — the bell item and the push
   * notification both. A site-relative path ("/articles/…", "/profile?…") or
   * an absolute URL. Unset means the bell item just shows its text and a push
   * click opens the profile, which is the honest default for announcements
   * that have no single destination.
   */
  link?: string;
}): Promise<{ notification: Notification; smsFailures: number }> {
  const supabase = getSupabase();
  const recipients = await resolveNotificationRecipients({
    targetType: input.targetType,
    targetCourseId: input.targetCourseId,
    userIds: input.userIds,
  });

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      title: input.title,
      body: input.body,
      image_url: input.imageUrl ?? null,
      target_type: input.targetType,
      target_course_id: input.targetCourseId ?? null,
      target_course_label: input.targetCourseLabel ?? null,
      channel: input.channel,
      recipient_count: recipients.length,
      link: input.link ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  const notification = notificationFromRow(data as NotificationRow);

  if (recipients.length > 0) {
    const { error: recError } = await supabase
      .from("notification_recipients")
      .insert(recipients.map((r) => ({ notification_id: notification.id, user_id: r.id })));
    if (recError) throw recError;
  }

  let smsFailures = 0;
  if ((input.channel === "sms" || input.channel === "both") && recipients.length > 0) {
    const message = transliterate(`${input.title}: ${input.body}`).slice(0, 300);
    const results = await Promise.allSettled(recipients.map((r) => sendSms(r.phone, message)));
    smsFailures = results.filter((r) => r.status === "rejected").length;
    for (const r of results) {
      if (r.status === "rejected") console.error("[notifications] sms send failed:", r.reason);
    }
  }

  // Push piggybacks on the site channel rather than being its own selectable
  // option — a push notification's whole purpose is "come look at the one
  // that's already in your bell", so there's no case for push without site.
  if ((input.channel === "site" || input.channel === "both") && recipients.length > 0) {
    await sendPushToUsers(recipients.map((r) => r.id), {
      title: input.title,
      body: input.body,
      url: input.link ?? "/profile",
    }).catch((err) => console.error("[notifications] push send failed:", err));
  }

  return { notification, smsFailures };
}

/**
 * Diffs a course/program's lesson list before vs. after an admin save and
 * notifies that program's active students about any lesson whose
 * recordingLink just went from empty to set. Called from the courses/[id]
 * and yearly/[id] PUT routes right after a successful update — fire-and-
 * forget there, same as every other side-effect notification in this file.
 */
export async function notifyNewRecordings(
  programId: string,
  programLabel: string,
  previousLessons: Lesson[],
  currentLessons: Lesson[]
): Promise<void> {
  const newlyRecorded = currentLessons.filter((lesson, i) => lesson.recordingLink && !previousLessons[i]?.recordingLink);
  if (newlyRecorded.length === 0) return;

  const registrations = await listRegistrationsByProgram(programId);
  const userIds = [...new Set(registrations.filter((r) => r.status === "active" && r.userId).map((r) => r.userId!))];
  if (userIds.length === 0) return;

  // One notification for the whole save, not one per lesson: an admin who
  // pastes a term's worth of links in a single sitting would otherwise send
  // every student eight separate alerts (and eight push messages) at once.
  const topics = newlyRecorded.map((l) => l.topic).filter(Boolean);
  const body =
    topics.length === 1
      ? `"${programLabel}" — "${topics[0]}" хичээлийн бичлэг нэмэгдлээ.`
      : `"${programLabel}" — ${newlyRecorded.length} хичээлийн бичлэг нэмэгдлээ: ${topics.join(", ")}.`;

  await createNotification({
    title: "Хичээлийн бичлэг орлоо",
    body,
    targetType: "users",
    userIds,
    channel: "site",
    // The profile opens scrolled to this course's card, where the new
    // recording's "Бичлэг үзэх" button is.
    link: `/profile?course=${encodeURIComponent(programId)}`,
  });
}

/**
 * Notifies students who've previously actively registered for a course of
 * the same category+audience (see courseTag.ts) when a new one at that same
 * level gets published. Called from the courses/[id] PUT route on the
 * draft -> published transition, not on every save — a course isn't
 * something past students should hear about until it's actually live.
 * Silently no-ops for tags extractCourseCategories can't parse (customLabel
 * courses like "ДАСГАЛЖУУЛАГЧ БАГШ") since there's no reliable "same level"
 * match for those.
 */
export async function notifyNewCourseForPastStudents(course: Course): Promise<void> {
  const categories = extractCourseCategories(course.tag);
  if (categories.length === 0) return;
  const audience = getCourseAudience(course.tag);

  const allCourses = await listCourses(undefined, { includeDrafts: true });
  const sameLevelIds = allCourses
    .filter(
      (c) =>
        c.id !== course.id &&
        getCourseAudience(c.tag) === audience &&
        extractCourseCategories(c.tag).some((cat) => categories.includes(cat))
    )
    .map((c) => c.id);
  if (sameLevelIds.length === 0) return;

  const { data, error } = await getSupabase()
    .from("registrations")
    .select("user_id")
    .in("program_id", sameLevelIds)
    .eq("status", "active")
    .not("user_id", "is", null);
  if (error) throw error;

  const userIds = [...new Set((data as { user_id: string }[]).map((r) => r.user_id))];
  if (userIds.length === 0) return;

  await createNotification({
    title: "Танд тохирсон шинэ сургалт нэмэгдлээ",
    body: `"${course.title}" (${course.tag}) сургалт нээгдлээ.`,
    targetType: "users",
    userIds,
    channel: "site",
    link: courseHref(course),
  });
}

// ---------------------------------------------------------------------------
// Lesson reminders — 30-minutes-before push, sent by the cron route at
// src/app/api/cron/lesson-reminders. sent-table keyed by (program, lesson
// index) is the idempotency guard against the same lesson being caught by
// two consecutive cron ticks.
// ---------------------------------------------------------------------------

export async function listSentReminderKeys(): Promise<Set<string>> {
  const { data, error } = await getSupabase().from("lesson_reminders_sent").select("program_id, lesson_index");
  if (error) throw error;
  return new Set((data as { program_id: string; lesson_index: number }[]).map((r) => `${r.program_id}#${r.lesson_index}`));
}

export async function markLessonReminderSent(programId: string, lessonIndex: number): Promise<void> {
  const { error } = await getSupabase()
    .from("lesson_reminders_sent")
    .upsert({ program_id: programId, lesson_index: lessonIndex }, { onConflict: "program_id,lesson_index" });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Push subscriptions — one row per device a user has enabled notifications
// on (Profile page's "Мэдэгдэл идэвхжүүлэх"). Sending itself lives in
// lib/push.ts; these are just the CRUD the subscribe/unsubscribe API routes
// call.
// ---------------------------------------------------------------------------

export async function savePushSubscription(
  userId: string,
  input: { endpoint: string; p256dh: string; auth: string }
): Promise<void> {
  const { error } = await getSupabase()
    .from("push_subscriptions")
    .upsert(
      { user_id: userId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth },
      { onConflict: "endpoint" }
    );
  if (error) throw error;
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const { error } = await getSupabase().from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
}

export async function listNotificationsForAdmin(limit = 50): Promise<Notification[]> {
  const { data, error } = await getSupabase()
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as NotificationRow[]).map(notificationFromRow);
}

export type NotificationForUser = Notification & { readAt?: string };

export async function listNotificationsForUser(userId: string, limit = 30): Promise<NotificationForUser[]> {
  const supabase = getSupabase();
  const { data: recipientRows, error } = await supabase
    .from("notification_recipients")
    .select("notifications(*)")
    .eq("user_id", userId)
    .limit(limit);
  if (error) throw error;

  type Row = { notifications: NotificationRow | NotificationRow[] | null };
  const notifications = (recipientRows as unknown as Row[])
    .map((r) => (Array.isArray(r.notifications) ? r.notifications[0] : r.notifications))
    .filter((n): n is NotificationRow => Boolean(n))
    .map(notificationFromRow)
    // "sms" channel means the admin picked SMS only — the site/bell list is
    // only for "site" and "both". Recipients are still materialized for
    // sms-only sends (that's how the phone list gets resolved), they just
    // don't surface here.
    .filter((n) => n.channel !== "sms")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (notifications.length === 0) return [];

  const { data: readRows, error: readError } = await supabase
    .from("notification_reads")
    .select("notification_id, read_at")
    .eq("user_id", userId)
    .in(
      "notification_id",
      notifications.map((n) => n.id)
    );
  if (readError) throw readError;
  const readMap = new Map(
    (readRows as { notification_id: string; read_at: string }[]).map((r) => [r.notification_id, r.read_at])
  );

  return notifications.map((n) => ({ ...n, readAt: readMap.get(n.id) }));
}

export async function markNotificationsRead(notificationIds: string[], userId: string): Promise<void> {
  if (notificationIds.length === 0) return;
  const { error } = await getSupabase()
    .from("notification_reads")
    .upsert(notificationIds.map((id) => ({ notification_id: id, user_id: userId })));
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// AI chatbot transcripts (src/app/api/chat). One conversation per visitor
// session; the widget passes its conversation id back so a page navigation
// doesn't restart the thread.
// ---------------------------------------------------------------------------

/**
 * "admin" is a human reply sent from the admin panel during a takeover. The AI
 * providers only accept user/assistant, so anything handed to the model goes
 * through toModelMessages() below rather than being passed straight through.
 */
export type ChatRole = "user" | "assistant" | "admin";
export type ChatChannel = "website" | "messenger";
/** Who answers this conversation right now — see the schema comment on chat_conversations.mode. */
export type ChatMode = "bot" | "admin";

export async function createChatConversation(
  visitorId: string,
  userId?: string,
  channel: ChatChannel = "website"
): Promise<string> {
  const { data, error } = await getSupabase()
    .from("chat_conversations")
    .insert({ visitor_id: visitorId, user_id: userId ?? null, channel })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Scoped by visitorId as well as id so one visitor can't resume someone
 * else's conversation by guessing/replaying an id — the id alone is the only
 * thing the client sends back. Returns the mode too, since every caller that
 * loads a conversation also needs to know whether the bot still owns it.
 */
export async function findChatConversation(
  id: string,
  visitorId: string
): Promise<{ id: string; mode: ChatMode } | undefined> {
  const { data, error } = await getSupabase()
    .from("chat_conversations")
    .select("id, mode")
    .eq("id", id)
    .eq("visitor_id", visitorId)
    .maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return (data as { id: string; mode: ChatMode } | null) ?? undefined;
}

export async function getChatConversationMode(id: string): Promise<ChatMode> {
  const { data, error } = await getSupabase()
    .from("chat_conversations")
    .select("mode")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return "bot";
    throw error;
  }
  return (data as { mode: ChatMode } | null)?.mode ?? "bot";
}

/** Pauses the bot for this conversation, or hands it back. */
export async function setChatConversationMode(id: string, mode: ChatMode): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("chat_conversations")
    .update({ mode, mode_changed_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) {
    if (isInvalidUuidError(error)) return false;
    throw error;
  }
  return (data as { id: string }[]).length > 0;
}

/**
 * Messages newer than `after`, for the visitor's widget to pick up an admin's
 * reply. `after` is exclusive and compared on created_at, so passing the
 * timestamp of the newest message the client already has returns only what it
 * hasn't seen.
 */
export async function listChatMessagesSince(
  conversationId: string,
  after?: string
): Promise<{ role: ChatRole; content: string; createdAt: string }[]> {
  let query = getSupabase()
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(50);
  if (after) query = query.gt("created_at", after);
  const { data, error } = await query;
  if (error) throw error;
  return (data as { role: ChatRole; content: string; created_at: string }[]).map((m) => ({
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
  }));
}

/** Oldest-first, and capped: only the tail of a long thread is worth re-sending to the model. */
export async function listChatMessages(conversationId: string, limit = 20): Promise<{ role: ChatRole; content: string }[]> {
  const { data, error } = await getSupabase()
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as { role: ChatRole; content: string }[]).reverse();
}

/**
 * Collapses the transcript into the two roles an AI provider accepts. A human
 * admin's reply is context the model must see when the conversation is handed
 * back — dropping it would make the bot repeat what the admin already said —
 * so it arrives as an assistant turn.
 */
export function toModelMessages(
  messages: { role: ChatRole; content: string }[]
): { role: "user" | "assistant"; content: string }[] {
  return messages.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
}

export async function insertChatMessage(
  conversationId: string,
  role: ChatRole,
  content: string,
  meta?: { tokensUsed?: number; modelUsed?: string }
): Promise<void> {
  const { error } = await getSupabase().from("chat_messages").insert({
    conversation_id: conversationId,
    role,
    content,
    tokens_used: meta?.tokensUsed ?? null,
    model_used: meta?.modelUsed ?? null,
  });
  if (error) throw error;
}

/**
 * Resumes a returning visitor's most recent thread instead of starting from
 * scratch. The widget keeps its conversation id in sessionStorage, which
 * closing the tab wipes — without this, every new visit lost the history.
 *
 * Scoped to the last 24 hours on purpose: resuming a weeks-old thread is
 * confusing to the visitor and drags stale context (and its token cost) into
 * every later question. A signed-in user is matched on user_id so their
 * thread follows them across devices; an anonymous visitor falls back to the
 * per-browser `vid` cookie.
 */
export async function findLatestChatConversation(visitorId: string, userId?: string): Promise<string | undefined> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let query = getSupabase().from("chat_conversations").select("id").gte("started_at", since);
  query = userId ? query.eq("user_id", userId) : query.eq("visitor_id", visitorId);
  const { data, error } = await query.order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id;
}

/**
 * Claims an anonymous conversation for an account once its visitor signs in,
 * so the thread they started before logging in keeps going. Guarded on
 * user_id being null — never reassigns a conversation that already belongs
 * to someone.
 */
export async function attachChatConversationUser(conversationId: string, userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("chat_conversations")
    .update({ user_id: userId })
    .eq("id", conversationId)
    .is("user_id", null);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Admin views over the chat transcripts, plus the complaint log the bot
// feeds (see src/lib/ai/issues.ts for how a row gets here). Separate from
// the visitor-scoped functions above on purpose: these join user identity
// and keep timestamps, which the widget-facing queries deliberately don't.
// ---------------------------------------------------------------------------

type ChatUserJoin = { last_name: string; first_name: string; phone: string } | { last_name: string; first_name: string; phone: string }[] | null;

function chatUserFromJoin(join: ChatUserJoin): { lastName: string; firstName: string; phone: string } | undefined {
  const u = Array.isArray(join) ? join[0] : join;
  return u ? { lastName: u.last_name, firstName: u.first_name, phone: u.phone } : undefined;
}

export type AdminChatConversation = {
  id: string;
  channel: ChatChannel;
  mode: ChatMode;
  startedAt: string;
  user?: { lastName: string; firstName: string; phone: string };
  messageCount: number;
  lastMessage?: { role: ChatRole; content: string; createdAt: string };
};

type AdminChatConversationRow = {
  id: string;
  channel: ChatChannel;
  mode: ChatMode;
  started_at: string;
  users: ChatUserJoin;
  msg_count: { count: number }[];
  last_message: { role: ChatRole; content: string; created_at: string }[];
};

// Two embeds of the same chat_messages relation, disambiguated by alias: one
// aggregates the count, the other is ordered+limited to the newest row so the
// list can show a preview without pulling whole transcripts.
const ADMIN_CHAT_SELECT =
  "id, channel, mode, started_at, users(last_name, first_name, phone), msg_count:chat_messages(count), last_message:chat_messages(role, content, created_at)";

function adminChatFromRow(row: AdminChatConversationRow): AdminChatConversation {
  const last = row.last_message?.[0];
  return {
    id: row.id,
    channel: row.channel,
    mode: row.mode,
    startedAt: row.started_at,
    user: chatUserFromJoin(row.users),
    messageCount: row.msg_count?.[0]?.count ?? 0,
    lastMessage: last ? { role: last.role, content: last.content, createdAt: last.created_at } : undefined,
  };
}

export async function listChatConversationsForAdmin(limit = 100): Promise<AdminChatConversation[]> {
  const { data, error } = await getSupabase()
    .from("chat_conversations")
    .select(ADMIN_CHAT_SELECT)
    .order("started_at", { ascending: false })
    .order("created_at", { referencedTable: "last_message", ascending: false })
    .limit(1, { referencedTable: "last_message" })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as AdminChatConversationRow[]).map(adminChatFromRow);
}

export async function listChatConversationsByUser(userId: string): Promise<AdminChatConversation[]> {
  const { data, error } = await getSupabase()
    .from("chat_conversations")
    .select(ADMIN_CHAT_SELECT)
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .order("created_at", { referencedTable: "last_message", ascending: false })
    .limit(1, { referencedTable: "last_message" });
  if (error) throw error;
  return (data as unknown as AdminChatConversationRow[]).map(adminChatFromRow);
}

export type AdminChatMessage = { role: ChatRole; content: string; modelUsed?: string; createdAt: string };

/** Full transcript with timestamps — listChatMessages above intentionally drops them for the model's context window. */
export async function listChatMessagesForAdmin(conversationId: string): Promise<AdminChatMessage[]> {
  const { data, error } = await getSupabase()
    .from("chat_messages")
    .select("role, content, model_used, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as { role: ChatRole; content: string; model_used: string | null; created_at: string }[]).map((m) => ({
    role: m.role,
    content: m.content,
    modelUsed: m.model_used ?? undefined,
    createdAt: m.created_at,
  }));
}

export type ChatIssueStatus = "new" | "resolved";

export type ChatIssue = {
  id: string;
  conversationId: string;
  channel: string;
  message: string;
  status: ChatIssueStatus;
  createdAt: string;
  resolvedAt?: string;
  user?: { lastName: string; firstName: string; phone: string };
};

type ChatIssueRow = {
  id: string;
  conversation_id: string;
  channel: string;
  message: string;
  status: ChatIssueStatus;
  created_at: string;
  resolved_at: string | null;
  users: ChatUserJoin;
};

function chatIssueFromRow(row: ChatIssueRow): ChatIssue {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    channel: row.channel,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    user: chatUserFromJoin(row.users),
  };
}

export async function createChatIssue(input: {
  conversationId: string;
  userId?: string;
  channel: ChatChannel;
  message: string;
}): Promise<void> {
  const { error } = await getSupabase().from("chat_issues").insert({
    conversation_id: input.conversationId,
    user_id: input.userId ?? null,
    channel: input.channel,
    message: input.message,
  });
  if (error) throw error;
}

export async function listChatIssues(limit = 100): Promise<ChatIssue[]> {
  const { data, error } = await getSupabase()
    .from("chat_issues")
    .select("id, conversation_id, channel, message, status, created_at, resolved_at, users(last_name, first_name, phone)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as ChatIssueRow[]).map(chatIssueFromRow);
}

/** Returns false when the id doesn't exist, so the route can 404 instead of pretending. */
export async function setChatIssueStatus(id: string, status: ChatIssueStatus): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("chat_issues")
    .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) {
    if (isInvalidUuidError(error)) return false;
    throw error;
  }
  return (data as unknown[]).length > 0;
}
