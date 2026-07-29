import { getSupabase } from "./supabase";
import { hashPassword, verifyPassword as verifyPasswordHash } from "./password";

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

type UserRow = {
  id: string;
  role: Role;
  last_name: string;
  first_name: string;
  phone: string;
  email: string;
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

function userFromRow(row: UserRow): User {
  return {
    id: row.id,
    role: row.role,
    lastName: row.last_name,
    firstName: row.first_name,
    phone: row.phone,
    email: row.email,
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

export async function deleteCourse(id: string): Promise<boolean> {
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
