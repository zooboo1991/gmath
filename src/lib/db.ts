import { getPaymentProvider } from "./payment";
import { getSupabase } from "./supabase";
import { hashPassword, verifyPassword as verifyPasswordHash } from "./password";
import { parsePriceToNumber } from "./price";
import { transliterate } from "./mnTransliterate";
import { sendPushToUsers } from "./push";
import { sendSms } from "./sms/skytel";
import { compareMn } from "./sortMn";
import { extractCourseCategories, getCourseAudience } from "./courseTag";

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

function parseHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type Role = "teacher" | "student";
export type PayMethod = "qpay" | "bank" | "manual";
export type RegistrationStatus = "pending" | "active";
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

type UserRow = {
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

function userFromRow(row: UserRow): User {
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

// Enforces one active session per user: any existing session row for this
// user is deleted before the new one is created, so an older device's
// session id no longer resolves (see findSessionUserId) the next time it's
// checked.
export async function createSession(userId: string): Promise<string> {
  const supabase = getSupabase();
  const { error: deleteError } = await supabase.from("sessions").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;
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

export async function updateUserPassword(userId: string, newPassword: string): Promise<User | undefined> {
  const { hash, salt } = hashPassword(newPassword);
  const { data, error } = await getSupabase()
    .from("users")
    .update({ password_hash: hash, password_salt: salt })
    .eq("id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? userFromRow(data as UserRow) : undefined;
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
export type CourseSummary = Pick<Course, "id" | "tag" | "title" | "topics" | "price" | "period">;

/** Used by the "related courses" strip, which never renders lessons. */
export async function listPublishedCourseSummaries(limit?: number): Promise<CourseSummary[]> {
  let query = getSupabase()
    .from("courses")
    .select("id, tag, title, topics, price, period")
    .eq("status", "published");
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data as CourseSummary[];
}

/** Homepage's "Сургалтууд" section — admin opts a course in via a checkbox on its edit page. */
export async function listHomepageCourses(): Promise<CourseSummary[]> {
  const { data, error } = await getSupabase()
    .from("courses")
    .select("id, tag, title, topics, price, period")
    .eq("status", "published")
    .eq("show_on_homepage", true);
  if (error) throw error;
  return data as CourseSummary[];
}

export async function findCourseById(id: string): Promise<Course | undefined> {
  const { data, error } = await getSupabase().from("courses").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? courseFromRow(data as CourseRow) : undefined;
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
  input: Partial<Omit<Course, "id">>
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

  const { error, count } = await getSupabase().from("courses").delete({ count: "exact" }).eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function listArticles(): Promise<Article[]> {
  const { data, error } = await getSupabase()
    .from("articles")
    .select("*")
    .order("created_at", { ascending: false });
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
export async function listArticleSummaries(limit?: number): Promise<ArticleSummary[]> {
  let query = getSupabase()
    .from("articles")
    .select("id, title, excerpt, cover_image, author, featured, created_at")
    .order("created_at", { ascending: false });
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
  }));
}

export async function findArticleById(id: string): Promise<Article | undefined> {
  const { data, error } = await getSupabase().from("articles").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? articleFromRow(data as ArticleRow) : undefined;
}

export async function addArticle(input: Omit<Article, "id" | "createdAt">): Promise<Article> {
  const { data, error } = await getSupabase()
    .from("articles")
    .insert({
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      cover_image: input.coverImage,
      author: input.author,
      featured: input.featured,
    })
    .select("*")
    .single();
  if (error) throw error;
  return articleFromRow(data as ArticleRow);
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

  const { data, error } = await getSupabase().from("articles").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? articleFromRow(data as ArticleRow) : undefined;
}

export async function deleteArticle(id: string): Promise<boolean> {
  const { error, count } = await getSupabase().from("articles").delete({ count: "exact" }).eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
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
export async function upsertCertificates(rows: CertificateImportRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error, count } = await getSupabase()
    .from("certificates")
    .upsert(
      rows.map((r) => ({
        certificate_number: r.certificateNumber,
        last_name: r.lastName,
        first_name: r.firstName,
        phone: r.phone,
        category: r.category,
        course: r.course,
        issued_date: r.issuedDate,
      })),
      { onConflict: "certificate_number", count: "exact" }
    );
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
    .is("user_id", null);
  if (error) throw error;
}

export async function findRegistrationById(id: string): Promise<Registration | undefined> {
  const { data, error } = await getSupabase().from("registrations").select("*").eq("id", id).maybeSingle();
  if (error) {
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
 */
export async function settleRegistrationPayment(id: string): Promise<Registration | undefined> {
  const registration = await findRegistrationById(id);
  if (
    !registration ||
    registration.status !== "pending" ||
    registration.payMethod !== "qpay" ||
    !registration.qpayInvoiceId
  ) {
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
    .update({ status: "active", qpay_payment_id: result.reference })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return findRegistrationById(id);
  const updated = registrationFromRow(data as RegistrationRow);
  await notifyRegistrationActive(updated);
  return updated;
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function listRegistrationsByUser(userId: string): Promise<RegistrationWithGroup[]> {
  const { data, error } = await getSupabase().from("registrations").select("*").eq("user_id", userId);
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
    .select("user_id, program_label, price, pay_method, status, users(role)");
  if (error) throw error;

  // A registration belongs to exactly one user, but the client types an
  // embedded relation as an array, so accept either shape.
  type JoinedUser = { role: Role } | { role: Role }[] | null;
  const rows = data as unknown as {
    user_id: string;
    program_label: string;
    price: string;
    pay_method: PayMethod;
    status: RegistrationStatus;
    users: JoinedUser;
  }[];
  const roleOf = (users: JoinedUser): Role | undefined =>
    (Array.isArray(users) ? users[0] : users)?.role;

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
  topPages: { path: string; views: number }[];
  topReferrers: { referrer: string; views: number }[];
  /** One entry per calendar day in the range, oldest first. */
  daily: { date: string; views: number }[];
  newRegistrations: number;
  newRevenue: number;
  newUsers: number;
};

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

  const [viewRows, regRows, newUsers] = await Promise.all([
    getSupabase()
      .from("page_views")
      .select("path, referrer, visitor_id, created_at")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .then(({ data, error }) => {
        if (error) throw error;
        return data as { path: string; referrer: string | null; visitor_id: string; created_at: string }[];
      }),
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

  for (const row of viewRows) {
    visitors.add(row.visitor_id);
    byPage.set(row.path, (byPage.get(row.path) ?? 0) + 1);

    const referrerLabel = row.referrer ? (parseHostname(row.referrer) ?? "Бусад") : "Шууд орсон";
    byReferrer.set(referrerLabel, (byReferrer.get(referrerLabel) ?? 0) + 1);

    const day = row.created_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

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

  let newRevenue = 0;
  for (const r of regRows) {
    if (r.status === "active") newRevenue += parsePriceToNumber(r.price);
  }

  return {
    views: viewRows.length,
    visitors: visitors.size,
    topPages,
    topReferrers,
    daily,
    newRegistrations: regRows.length,
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
  /** Where a push notification's click should land — defaults to the profile page's bell list. The lesson reminder is the one caller that points this at a Zoom link instead. */
  pushUrl?: string;
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
      url: input.pushUrl ?? "/profile",
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

  for (const lesson of newlyRecorded) {
    await createNotification({
      title: "Хичээлийн бичлэг орлоо",
      body: `"${programLabel}" — "${lesson.topic}" хичээлийн бичлэг нэмэгдлээ.`,
      targetType: "users",
      userIds,
      channel: "site",
    });
  }
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
    pushUrl: `/courses/${course.id}`,
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

export type ChatRole = "user" | "assistant";
export type ChatChannel = "website" | "messenger";

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
 * thing the client sends back.
 */
export async function findChatConversation(id: string, visitorId: string): Promise<{ id: string } | undefined> {
  const { data, error } = await getSupabase()
    .from("chat_conversations")
    .select("id")
    .eq("id", id)
    .eq("visitor_id", visitorId)
    .maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return (data as { id: string } | null) ?? undefined;
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
  startedAt: string;
  user?: { lastName: string; firstName: string; phone: string };
  messageCount: number;
  lastMessage?: { role: ChatRole; content: string; createdAt: string };
};

type AdminChatConversationRow = {
  id: string;
  channel: ChatChannel;
  started_at: string;
  users: ChatUserJoin;
  msg_count: { count: number }[];
  last_message: { role: ChatRole; content: string; created_at: string }[];
};

// Two embeds of the same chat_messages relation, disambiguated by alias: one
// aggregates the count, the other is ordered+limited to the newest row so the
// list can show a preview without pulling whole transcripts.
const ADMIN_CHAT_SELECT =
  "id, channel, started_at, users(last_name, first_name, phone), msg_count:chat_messages(count), last_message:chat_messages(role, content, created_at)";

function adminChatFromRow(row: AdminChatConversationRow): AdminChatConversation {
  const last = row.last_message?.[0];
  return {
    id: row.id,
    channel: row.channel,
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
