import { getSupabase } from "./supabase";
import { fetchAllRows } from "./fetchAll";
import { publicUserFromJoin, type PublicUser } from "./db";
import { isBookableDay, todayInUb } from "./parentMeeting";

/**
 * Багштай хийх уулзалтын цаг — өгөгдлийн давхарга.
 *
 * Хоёр хүснэгт: админаас нээсэн өдрүүд (`parent_meeting_days`) ба захиалга
 * (`parent_meetings`). Өдөр нээгээгүй бол сурагчдад цаг огт харагдахгүй.
 */

export type MeetingStatus = "booked" | "came" | "missed" | "cancelled";

export type ParentMeeting = {
  id: string;
  userId: string;
  /** YYYY-MM-DD. */
  meetingDate: string;
  /** "09:00–09:20". */
  slot: string;
  status: MeetingStatus;
  note?: string;
  createdAt: string;
};

export type ParentMeetingWithUser = ParentMeeting & { user?: PublicUser };

type Row = {
  id: string;
  user_id: string;
  meeting_date: string;
  slot: string;
  status: MeetingStatus;
  note: string | null;
  created_at: string;
};

function isInvalidUuidError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "22P02";
}

function fromRow(row: Row): ParentMeeting {
  return {
    id: row.id,
    userId: row.user_id,
    meetingDate: row.meeting_date,
    slot: row.slot,
    status: row.status,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

/* -------------------------------------------------------------------------
 * Админаас нээсэн өдрүүд
 * ---------------------------------------------------------------------- */

/**
 * Нээлттэй өдрүүд, эртнийх нь эхэндээ.
 *
 * `upcomingOnly` нь өнгөрсөн өдрийг хасна — сурагчид зөвхөн ирээдүйг
 * харна, харин админ өнгөрсөн өдрөө ч харж цэгцэлнэ.
 */
export async function listMeetingDays(opts: { upcomingOnly?: boolean } = {}): Promise<string[]> {
  const rows = await fetchAllRows<{ meeting_date: string }>(() =>
    getSupabase().from("parent_meeting_days").select("meeting_date").order("meeting_date")
  );
  const dates = rows.map((row) => row.meeting_date);
  return opts.upcomingOnly ? dates.filter((date) => isBookableDay(date)) : dates;
}

export async function addMeetingDay(date: string): Promise<void> {
  // Хоёр дахь удаа нэмэхийг алдаа гэж үзэхгүй — админ хоёр таб нээсэн байж
  // болно, үр дүн нь аль ч тохиолдолд "тэр өдөр нээлттэй".
  const { error } = await getSupabase()
    .from("parent_meeting_days")
    .upsert({ meeting_date: date }, { onConflict: "meeting_date" });
  if (error) throw error;
}

/**
 * Өдрийг хаана.
 *
 * Захиалсан цагуудыг УСТГАХГҮЙ: эцэг эхчүүд аль хэдийн төлөвлөчихсөн байж
 * болно. Өдөр нь зөвхөн шинээр захиалахад хаагдана, багшийн жагсаалтад
 * хуучин захиалгууд хэвээр харагдана.
 */
export async function removeMeetingDay(date: string): Promise<void> {
  const { error } = await getSupabase()
    .from("parent_meeting_days")
    .delete()
    .eq("meeting_date", date);
  if (error) throw error;
}

/* -------------------------------------------------------------------------
 * Захиалга
 * ---------------------------------------------------------------------- */

/**
 * Тухайн хүний ИРЭХ уулзалт — өнөөдрөөс хойшхи, болиогүй.
 *
 * Өнгөрсөн уулзалтыг тоохгүй: эзний шийдвэрээр хүүхэд нэг ээлжид нэг л
 * уулзалттай ч дараагийн ээлжид (админ шинэ өдрүүд нээхэд) дахин захиална.
 * Өнгөрсөн уулзалтыг тоолбол нэг удаа уулзсан хүүхэд хэзээ ч дахин цаг
 * авч чадахгүй болно. Мөн өнгөрсөн уулзалтыг картан дээр "товлосон цагтаа
 * ирээрэй" гэж харуулах нь утгагүй.
 */
export async function findUpcomingMeeting(
  userId: string,
  now = new Date()
): Promise<ParentMeeting | undefined> {
  const { data, error } = await getSupabase()
    .from("parent_meetings")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "booked")
    .gte("meeting_date", todayInUb(now))
    .order("created_at")
    .order("id")
    .limit(1);
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  const rows = (data ?? []) as Row[];
  return rows[0] ? fromRow(rows[0]) : undefined;
}

/** Аль цагууд аль хэдийн авагдсан бэ — өдөр бүрээр. */
export async function listTakenSlots(dates: string[]): Promise<Map<string, Set<string>>> {
  const taken = new Map<string, Set<string>>();
  if (dates.length === 0) return taken;
  const rows = await fetchAllRows<{ meeting_date: string; slot: string }>(() =>
    getSupabase()
      .from("parent_meetings")
      .select("meeting_date, slot")
      .in("meeting_date", dates)
      .neq("status", "cancelled")
      .order("meeting_date")
      .order("slot")
  );
  for (const row of rows) {
    const set = taken.get(row.meeting_date) ?? new Set<string>();
    set.add(row.slot);
    taken.set(row.meeting_date, set);
  }
  return taken;
}

export type BookResult =
  | { ok: true; meeting: ParentMeeting }
  | { ok: false; reason: "slot_taken" | "already_booked" };

/**
 * Цаг захиална.
 *
 * Хоёр дүрэм, хоёр өөр газар барина:
 *
 * - Нэг цагт нэг гэр бүл — өгөгдлийн сангийн unique индекс
 *   (`parent_meetings_slot_idx`). Хоёр гэр бүл яг зэрэг дарахад нэг нь
 *   23505 авна.
 * - Нэг хүүхэд нэг ИРЭХ уулзалттай — энд, кодоор. Индексээр барих боломжгүй:
 *   "ирэх" гэдэг нь өнөөдрөөс хамаардаг, харин индексийн нөхцөлд өнөөдрийг
 *   ашиглаж болдоггүй.
 *
 * Хоёр таб зэрэг дарвал хоёулаа урьдчилсан шалгалтыг давж болно. Тиймээс
 * оруулсны дараа дахин тоолж, илүү гарвал хамгийн эхний (created_at, id)
 * мөрийг үлдээгээд бусдыг нь болиулна — хоёр хүсэлт хоёулаа өөрийгөө
 * устгаж хоосон үлдэхгүйн тулд "эхнийх үлдэнэ" гэсэн нэг дүрмээр шийднэ.
 */
export async function bookMeeting(input: {
  userId: string;
  meetingDate: string;
  slot: string;
}): Promise<BookResult> {
  if (await findUpcomingMeeting(input.userId)) {
    return { ok: false, reason: "already_booked" };
  }

  const { data, error } = await getSupabase()
    .from("parent_meetings")
    .insert({ user_id: input.userId, meeting_date: input.meetingDate, slot: input.slot })
    .select("*")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false, reason: "slot_taken" };
    throw error;
  }
  const mine = fromRow(data as Row);

  const first = await findUpcomingMeeting(input.userId);
  if (first && first.id !== mine.id) {
    await getSupabase()
      .from("parent_meetings")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", mine.id);
    return { ok: false, reason: "already_booked" };
  }
  return { ok: true, meeting: mine };
}

/**
 * Цагаа болих — эзэн нь өөрөө.
 *
 * Мөрийг устгахгүй, `cancelled` болгоно: багш "энэ гэр бүл цагаа болисон"
 * гэдгийг харах нь "огт захиалаагүй" гэж харагдахаас дээр. Болисон цаг нь
 * бусдад шууд сул болж харагдана.
 */
export async function cancelOwnMeeting(id: string, userId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("parent_meetings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .select("id");
  if (error) {
    if (isInvalidUuidError(error)) return false;
    throw error;
  }
  return (data ?? []).length > 0;
}

/**
 * Багш, админд зориулсан жагсаалт — өдрөөр, дараа нь цагаар.
 *
 * Болисныг оруулахгүй: жагсаалт нь хэн ирэхийг харуулах ёстой.
 */
export async function listMeetings(
  opts: { fromDate?: string } = {}
): Promise<ParentMeetingWithUser[]> {
  const rows = await fetchAllRows<Row & { users: unknown }>(() => {
    let query = getSupabase()
      .from("parent_meetings")
      .select("*, users(*)")
      .neq("status", "cancelled")
      .order("meeting_date")
      .order("slot")
      .order("id");
    if (opts.fromDate) query = query.gte("meeting_date", opts.fromDate);
    return query;
  });
  return rows.map((row) => {
    const { users, ...rest } = row;
    return { ...fromRow(rest as Row), user: publicUserFromJoin(users) };
  });
}

/** Багш ирсэн/ирээгүйг тэмдэглэх, тэмдэглэл үлдээх. */
export async function setMeetingOutcome(
  id: string,
  input: { status?: MeetingStatus; note?: string }
): Promise<ParentMeeting | undefined> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status) patch.status = input.status;
  if (input.note !== undefined) patch.note = input.note || null;
  const { data, error } = await getSupabase()
    .from("parent_meetings")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? fromRow(data as Row) : undefined;
}

/**
 * Энэ хүн уулзалт захиалах эрхтэй юу — 1 жилийн хөтөлбөрт идэвхтэй
 * бүртгэлтэй эсэх.
 *
 * Жилийн хөтөлбөрүүдийн id нь "program-c"/"program-d" — `courses` хүснэгтэд
 * мөргүй тул зөвхөн энэ угтвараар нь ялгана (schema.sql-ийн тайлбар).
 */
export async function hasYearlyProgramme(userId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("registrations")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .like("program_id", "program-%")
    .limit(1);
  if (error) {
    if (isInvalidUuidError(error)) return false;
    throw error;
  }
  return (data ?? []).length > 0;
}
