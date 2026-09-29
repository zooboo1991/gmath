import { getSupabase } from "./supabase";
import { fetchAllRows } from "./fetchAll";
import { publicUserFromJoin, type PublicUser } from "./db";
import {
  isBookableDay,
  meetingRoomSchedule,
  meetingRoomTopic,
  todayInUb,
  type MeetingMode,
} from "./parentMeeting";
import { addRegistrant, createMeeting, deleteMeeting } from "./zoom/client";

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
  /** Танхимаар эсвэл өдрийн Zoom өрөөнд онлайнаар. */
  mode: MeetingMode;
  note?: string;
  createdAt: string;
  /** Гэр бүлийн хувийн Zoom холбоос — анх "Zoom-оор орох" дарахад үүснэ. */
  zoomJoinUrl?: string;
};

export type ParentMeetingWithUser = ParentMeeting & { user?: PublicUser };

type Row = {
  id: string;
  user_id: string;
  meeting_date: string;
  slot: string;
  status: MeetingStatus;
  mode: MeetingMode | null;
  note: string | null;
  created_at: string;
  zoom_join_url: string | null;
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
    // Багана нэмэгдэхээс өмнөх мөрүүд танхимаар гэж тооцогдоно.
    mode: row.mode ?? "in_person",
    note: row.note ?? undefined,
    createdAt: row.created_at,
    zoomJoinUrl: row.zoom_join_url ?? undefined,
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
  mode: MeetingMode;
}): Promise<BookResult> {
  if (await findUpcomingMeeting(input.userId)) {
    return { ok: false, reason: "already_booked" };
  }

  const { data, error } = await getSupabase()
    .from("parent_meetings")
    .insert({
      user_id: input.userId,
      meeting_date: input.meetingDate,
      slot: input.slot,
      mode: input.mode,
    })
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
 * Хүүхдийн 1 жилийн хөтөлбөр — идэвхтэй бүртгэлтэй бол түүний id.
 *
 * Жилийн хөтөлбөрүүдийн id нь "program-c"/"program-d" — `courses` хүснэгтэд
 * мөргүй тул зөвхөн энэ угтвараар нь ялгана (schema.sql-ийн тайлбар).
 * Хоёуланд нь бүртгэлтэй бол эрэмбээр эхнийх — түвшин тогтоох шалгалт руу
 * чиглүүлэх холбоосонд л хэрэгтэй.
 */
export async function findYearlyProgramme(userId: string): Promise<string | undefined> {
  const { data, error } = await getSupabase()
    .from("registrations")
    .select("program_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .like("program_id", "program-%")
    .order("program_id")
    .limit(1);
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return ((data ?? []) as { program_id: string }[])[0]?.program_id;
}

/**
 * Түвшин тогтоох шалгалтыг хэр зэрэг өгсөн бэ.
 *
 * - `done` — бодолтоо илгээсэн. Багш дүгнэсэн эсэх хамаагүй: бодит
 *   өгөгдлөөр (2026-09-29) илгээсэн 28 хүүхдээс багш ганцыг л дүгнэсэн тул
 *   дүгнэлтийг шаардвал бараг хэн ч цаг авч чадахгүй. Сайт өөрөө ч
 *   "Түвшин тогтоох өгсөн" гэдгийг ингэж тоолдог (FreeExamBox).
 * - `started` — эхлүүлсэн ч илгээгээгүй (асуулга бөглөсөн, төлбөр төлсөн).
 * - `none` — огт эхлээгүй.
 *
 * Зөвхөн түвшин тогтоох төрлүүд (олимпиад, placement): "Энгийн/Сонгон
 * ангийн тест" нь өөр зүйл. Цуцлагдсан оролдлогыг тоохгүй.
 */
export type PlacementExamState = "done" | "started" | "none";

const HANDED_IN = new Set(["problems_submitted", "grading", "completed"]);

export async function placementExamState(userId: string): Promise<PlacementExamState> {
  const { data, error } = await getSupabase()
    .from("assessments")
    .select("status")
    .eq("user_id", userId)
    .in("track", ["olympiad", "placement"])
    .neq("status", "cancelled");
  if (error) {
    if (isInvalidUuidError(error)) return "none";
    throw error;
  }
  const statuses = ((data ?? []) as { status: string }[]).map((row) => row.status);
  if (statuses.some((status) => HANDED_IN.has(status))) return "done";
  return statuses.length > 0 ? "started" : "none";
}

/* -------------------------------------------------------------------------
 * Онлайн уулзалтын Zoom өрөө
 * ---------------------------------------------------------------------- */

/**
 * Тухайн өдрийн Zoom өрөө — байхгүй бол үүсгэнэ.
 *
 * Хоёр гэр бүл яг зэрэг анх удаа дарвал хоёулаа Zoom дээр уулзалт үүсгэж
 * магадгүй. `meeting_date` нь primary key тул нэг л мөр бичигдэнэ; ялагдсан
 * тал нь өөрийн үүсгэснийг Zoom-оос устгаад ялагчийнхыг хэрэглэнэ — нэг
 * өдөрт хоёр өрөө болбол багш аль нэгэнд нь хэнийг ч хүлээхгүй сууна.
 */
export async function ensureMeetingRoom(date: string): Promise<string> {
  const existing = await findMeetingRoom(date);
  if (existing) return existing;

  const created = await createMeeting(meetingRoomTopic(date), meetingRoomSchedule(date), {
    waitingRoom: true,
  });
  const { error } = await getSupabase()
    .from("parent_meeting_rooms")
    .insert({ meeting_date: date, zoom_meeting_id: created.id });
  if (!error) return created.id;
  if ((error as { code?: string }).code !== "23505") throw error;

  await deleteMeeting(created.id).catch(() => {});
  const winner = await findMeetingRoom(date);
  if (!winner) throw new Error("Zoom өрөө бүртгэгдсэнгүй");
  return winner;
}

export async function findMeetingRoom(date: string): Promise<string | undefined> {
  const { data, error } = await getSupabase()
    .from("parent_meeting_rooms")
    .select("zoom_meeting_id")
    .eq("meeting_date", date)
    .maybeSingle();
  if (error) throw error;
  return (data as { zoom_meeting_id: string } | null)?.zoom_meeting_id;
}

/**
 * Гэр бүлийн хувийн Zoom холбоос — байхгүй бол бүртгэнэ.
 *
 * Хичээлийн "Хичээлд орох"-той адил: анх дарахад өдрийн өрөөнд бүртгээд
 * хувийн холбоосыг нь хадгална, дараагийн дарахад тэр л холбоосыг өгнө.
 * Хоёр таб зэрэг дарвал нөхцөлт UPDATE нэгийг нь л хадгална.
 */
export async function ensureMeetingJoinUrl(
  meeting: ParentMeeting,
  person: { email: string; firstName: string; lastName: string }
): Promise<string> {
  if (meeting.zoomJoinUrl) return meeting.zoomJoinUrl;

  const roomId = await ensureMeetingRoom(meeting.meetingDate);
  const registrant = await addRegistrant(roomId, person);
  const { data, error } = await getSupabase()
    .from("parent_meetings")
    .update({
      zoom_registrant_id: registrant.registrantId,
      zoom_join_url: registrant.joinUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", meeting.id)
    .is("zoom_join_url", null)
    .select("zoom_join_url")
    .maybeSingle();
  if (error) throw error;
  if (data) return (data as { zoom_join_url: string }).zoom_join_url;

  // Өөр таб түрүүлсэн — түүний хадгалсныг хэрэглэнэ.
  const { data: again, error: readError } = await getSupabase()
    .from("parent_meetings")
    .select("zoom_join_url")
    .eq("id", meeting.id)
    .single();
  if (readError) throw readError;
  return (again as { zoom_join_url: string }).zoom_join_url;
}
