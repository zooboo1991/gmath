import { getSupabase } from "./supabase";
import { hashPassword, verifyPassword as verifyPasswordHash } from "./password";
import { parsePriceToNumber } from "./price";

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
export type PayMethod = "qpay" | "bank";
export type RegistrationStatus = "pending" | "active";
export type CourseKind = "upcoming" | "vod";
export type CourseStatus = "draft" | "published";

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
  zoom?: string;
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

export type Lesson = {
  topic: string;
  schedule?: string;
  /** Room for this lesson. Falls back to the course's link when unset. */
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
  userId: string;
  programId: string;
  programLabel: string;
  price: string;
  payMethod: PayMethod;
  status: RegistrationStatus;
  createdAt: string;
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
  zoom: string | null;
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
  user_id: string;
  program_id: string;
  program_label: string;
  price: string;
  pay_method: PayMethod;
  status: RegistrationStatus;
  created_at: string;
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
    zoom: row.zoom ?? undefined,
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
    userId: row.user_id,
    programId: row.program_id,
    programLabel: row.program_label,
    price: row.price,
    payMethod: row.pay_method,
    status: row.status,
    createdAt: row.created_at,
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
      zoom: input.zoom ?? null,
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
  input: Partial<Pick<User, "lastName" | "firstName" | "school" | "grade" | "email" | "facebook" | "zoom">>
): Promise<User | undefined> {
  const patch: Record<string, unknown> = {};
  if (input.lastName !== undefined) patch.last_name = input.lastName;
  if (input.firstName !== undefined) patch.first_name = input.firstName;
  if (input.school !== undefined) patch.school = input.school;
  if (input.grade !== undefined) patch.grade = input.grade || null;
  if (input.email !== undefined) patch.email = input.email;
  if (input.facebook !== undefined) patch.facebook = input.facebook || null;
  if (input.zoom !== undefined) patch.zoom = input.zoom || null;

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

  const { data, error } = await getSupabase().from("courses").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? courseFromRow(data as CourseRow) : undefined;
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
 * A registration plus the parts of its course a paid-up student is entitled
 * to: the Facebook group, the Zoom room, and the lesson schedule.
 */
export type RegistrationWithGroup = Registration & {
  facebookGroup?: string;
  zoomLink?: string;
  zoomMeetingId?: string;
  zoomPasscode?: string;
  lessons?: Lesson[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CoursePerksRow = {
  id: string;
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

  // The group and Zoom links are perks of a confirmed registration, so they
  // are attached server-side only for active ones — a pending registration
  // never carries them in its payload at all, which is what stops an unpaid
  // student from reading the class link out of the network response. Static
  // yearly programs have no course row, and so no perks.
  const courseIds = [
    ...new Set(
      registrations.filter((r) => r.status === "active" && UUID_RE.test(r.programId)).map((r) => r.programId)
    ),
  ];
  if (courseIds.length === 0) return registrations;

  const { data: courseRows, error: courseError } = await getSupabase()
    .from("courses")
    .select("id, facebook_group, zoom_link, zoom_meeting_id, zoom_passcode, lessons")
    .in("id", courseIds);
  if (courseError) throw courseError;

  const byId = new Map((courseRows as CoursePerksRow[]).map((c) => [c.id, c]));
  return registrations.map((r) => {
    if (r.status !== "active") return r;
    const course = byId.get(r.programId);
    if (!course) return r;
    return {
      ...r,
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
  const { data, error } = await getSupabase()
    .from("registrations")
    .update({ status: "active" })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? registrationFromRow(data as RegistrationRow) : undefined;
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
  const [students, teachers, courses, coursesPublished, coursesUpcoming, coursesVod, articles] =
    await Promise.all([
      countRows("users", { role: "student" }),
      countRows("users", { role: "teacher" }),
      countRows("courses"),
      countRows("courses", { status: "published" }),
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
    coursesDraft: courses - coursesPublished,
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

export type AnalyticsStats = {
  viewsAllTime: number;
  viewsToday: number;
  viewsWeek: number;
  viewsMonth: number;
  visitorsToday: number;
  visitorsWeek: number;
  visitorsMonth: number;
  topPages: { path: string; views: number }[];
  topReferrers: { referrer: string; views: number }[];
  /** One entry per day, oldest first, covering the last 30 days. */
  daily: { date: string; views: number }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reads the last 30 days of raw rows once and derives every breakdown from
 * that in memory — cheap at this school's traffic, and it avoids needing a
 * separate round trip (or a Postgres view) per stat. viewsAllTime is the one
 * figure that reaches further back, so it's a head-only count instead of a
 * row fetch.
 */
export async function getAnalyticsStats(): Promise<AnalyticsStats> {
  const now = Date.now();
  const since = new Date(now - 30 * DAY_MS).toISOString();

  const [viewsAllTime, recent] = await Promise.all([
    countRows("page_views"),
    getSupabase()
      .from("page_views")
      .select("path, referrer, visitor_id, created_at")
      .gte("created_at", since)
      .then(({ data, error }) => {
        if (error) throw error;
        return data as { path: string; referrer: string | null; visitor_id: string; created_at: string }[];
      }),
  ]);

  const todayStart = now - DAY_MS;
  const weekStart = now - 7 * DAY_MS;

  let viewsToday = 0;
  let viewsWeek = 0;
  let viewsMonth = 0;
  const visitorsToday = new Set<string>();
  const visitorsWeek = new Set<string>();
  const visitorsMonth = new Set<string>();
  const byPage = new Map<string, number>();
  const byReferrer = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const row of recent) {
    const t = new Date(row.created_at).getTime();
    viewsMonth += 1;
    visitorsMonth.add(row.visitor_id);
    if (t >= weekStart) {
      viewsWeek += 1;
      visitorsWeek.add(row.visitor_id);
    }
    if (t >= todayStart) {
      viewsToday += 1;
      visitorsToday.add(row.visitor_id);
    }

    byPage.set(row.path, (byPage.get(row.path) ?? 0) + 1);

    const referrerLabel = row.referrer ? (parseHostname(row.referrer) ?? "Бусад") : "Шууд орсон";
    byReferrer.set(referrerLabel, (byReferrer.get(referrerLabel) ?? 0) + 1);

    const day = row.created_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const daily: { date: string; views: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
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

  return {
    viewsAllTime,
    viewsToday,
    viewsWeek,
    viewsMonth,
    visitorsToday: visitorsToday.size,
    visitorsWeek: visitorsWeek.size,
    visitorsMonth: visitorsMonth.size,
    topPages,
    topReferrers,
    daily,
  };
}
