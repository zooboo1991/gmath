import { getSupabase } from "./supabase";
import { fetchAllRows } from "./fetchAll";
import { publicUserFromJoin, type PublicUser } from "./db";

/**
 * Танхимд ирж түвшин тогтоолгох цагийн захиалга.
 *
 * Сургалтад бүртгүүлэхээс тусдаа зүйл: төлбөр ч алга, суудал ч
 * баталгаажихгүй — зөвхөн "энэ өдөр, энэ цагт ирж уулзъя" гэсэн амлалт.
 */

export type BookingStatus = "booked" | "came" | "missed" | "cancelled";

export type PlacementBooking = {
  id: string;
  userId: string;
  /** YYYY-MM-DD. */
  bookedDate: string;
  /** "10:30–11:30". */
  slot: string;
  status: BookingStatus;
  note?: string;
  createdAt: string;
};

export type PlacementBookingWithUser = PlacementBooking & { user?: PublicUser };

type Row = {
  id: string;
  user_id: string;
  booked_date: string;
  slot: string;
  status: BookingStatus;
  note: string | null;
  created_at: string;
};

function isInvalidUuidError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "22P02";
}

function fromRow(row: Row): PlacementBooking {
  return {
    id: row.id,
    userId: row.user_id,
    bookedDate: row.booked_date,
    slot: row.slot,
    status: row.status,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

/** Тухайн хүний хүлээгдэж буй захиалга — нэгээс олон байх боломжгүй. */
export async function findActiveBooking(userId: string): Promise<PlacementBooking | undefined> {
  const { data, error } = await getSupabase()
    .from("placement_bookings")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "booked")
    .maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? fromRow(data as Row) : undefined;
}

export type BookResult =
  | { ok: true; booking: PlacementBooking }
  | { ok: false; reason: "already_booked" };

/**
 * Цаг захиална.
 *
 * Хүлээгдэж буй захиалга нэгээс олон байж болохгүй гэдгийг хэсэгчилсэн
 * unique индекс барьдаг — хоёр таб зэрэг дарахад нэг нь 23505 авна, тэр нь
 * алдаа биш, "аль хэдийн захиалсан байна" гэсэн үг.
 */
export async function bookPlacement(input: {
  userId: string;
  bookedDate: string;
  slot: string;
}): Promise<BookResult> {
  const { data, error } = await getSupabase()
    .from("placement_bookings")
    .insert({ user_id: input.userId, booked_date: input.bookedDate, slot: input.slot })
    .select("*")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false, reason: "already_booked" };
    throw error;
  }
  return { ok: true, booking: fromRow(data as Row) };
}

/**
 * Захиалгаа болих — эзэн нь өөрөө.
 *
 * Мөрийг устгахгүй, `cancelled` болгоно: багш "энэ хүүхэд цагаа болисон"
 * гэдгийг харах нь "огт захиалаагүй" гэж харагдахаас дээр.
 */
export async function cancelOwnBooking(id: string, userId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("placement_bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "booked")
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
 * Болисон захиалгыг оруулахгүй: багшийн жагсаалт нь хэн ирэхийг харуулах
 * ёстой. Хуудасласан — нэг хичээлийн жилд олон зуун мөр хуримтлагдана.
 */
export async function listBookings(
  opts: { fromDate?: string } = {}
): Promise<PlacementBookingWithUser[]> {
  const rows = await fetchAllRows<Row & { users: unknown }>(() => {
    let query = getSupabase()
      .from("placement_bookings")
      .select("*, users(*)")
      .neq("status", "cancelled")
      .order("booked_date")
      .order("slot")
      .order("id");
    if (opts.fromDate) query = query.gte("booked_date", opts.fromDate);
    return query;
  });
  return rows.map((row) => {
    const { users, ...rest } = row;
    return { ...fromRow(rest as Row), user: publicUserFromJoin(users) };
  });
}

/** Багш ирсэн/ирээгүйг тэмдэглэх, тэмдэглэл үлдээх. */
export async function setBookingOutcome(
  id: string,
  input: { status: BookingStatus; note?: string }
): Promise<PlacementBooking | undefined> {
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.note !== undefined) patch.note = input.note || null;
  const { data, error } = await getSupabase()
    .from("placement_bookings")
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
