import { getSupabase } from "./supabase";
import { fetchAllRows } from "./fetchAll";
import { publicUserFromJoin, type PublicUser } from "./db";
import { getPaymentProvider } from "./payment";

/**
 * Танхимд ирж түвшин тогтоолгох цагийн захиалга.
 *
 * Сургалтад бүртгүүлэхээс тусдаа зүйл: суудал баталгаажихгүй, зөвхөн "энэ
 * өдөр, энэ цагт ирж уулзъя" гэсэн амлалт. Гэхдээ үнэгүй биш — 20,000₮
 * төлж байж цаг баталгаажна, тэр мөнгө нь сонгоны ангид бүртгүүлэхэд
 * эхний төлөлтөөс хасагдана.
 *
 * Тиймээс мөр хоёр амьдралтай: `awaiting_payment` (нэхэмжлэх үүссэн, мөнгө
 * ороогүй — багшийн жагсаалтад гарахгүй) ба `booked` (төлөгдсөн).
 */

export type BookingStatus =
  | "awaiting_payment"
  | "booked"
  | "came"
  | "missed"
  | "cancelled";

/** Багшийн жагсаалтад гарах, өөр цаг захиалахад саад болох төлөвүүд. */
const ACTIVE_STATUSES = ["awaiting_payment", "booked"] as const;

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
  /** Төлөх ёстой дүн, төгрөгөөр. Мөрөнд хадгална — тариф өөрчлөгдвөл хуучин захиалга хэвээрээ. */
  feeAmount: number;
  /** Мөнгө орсон мөч. Хоосон бол захиалга баталгаажаагүй. */
  paidAt?: string;
  qpayInvoiceId?: string;
  qpayQrImage?: string;
  qpayShortUrl?: string;
  /** Хөнгөлөлт аль бүртгэлд орсон. Хоосон бол хараахан ашиглагдаагүй. */
  creditedRegistrationId?: string;
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
  fee_amount: number;
  paid_at: string | null;
  qpay_invoice_id: string | null;
  qpay_qr_image: string | null;
  qpay_short_url: string | null;
  credited_registration_id: string | null;
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
    feeAmount: row.fee_amount,
    paidAt: row.paid_at ?? undefined,
    qpayInvoiceId: row.qpay_invoice_id ?? undefined,
    qpayQrImage: row.qpay_qr_image ?? undefined,
    qpayShortUrl: row.qpay_short_url ?? undefined,
    creditedRegistrationId: row.credited_registration_id ?? undefined,
  };
}

/**
 * Тухайн хүний хүлээгдэж буй захиалга — нэгээс олон байх боломжгүй.
 *
 * Төлөгдөөгүйг нь ч буцаана: төлбөрийн цонхоо хаачихсан хүн буцаж ирэхэд
 * ижил QR-аа олох ёстой, шинэ нэхэмжлэх үүсгэх нь QPay дээр хог үлдээнэ.
 */
export async function findActiveBooking(userId: string): Promise<PlacementBooking | undefined> {
  const { data, error } = await getSupabase()
    .from("placement_bookings")
    .select("*")
    .eq("user_id", userId)
    .in("status", ACTIVE_STATUSES)
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
 * Цаг захиална — төлбөр хүлээж буй төлөвт.
 *
 * Хүлээгдэж буй захиалга нэгээс олон байж болохгүй гэдгийг хэсэгчилсэн
 * unique индекс барьдаг — хоёр таб зэрэг дарахад нэг нь 23505 авна, тэр нь
 * алдаа биш, "аль хэдийн захиалсан байна" гэсэн үг.
 *
 * Тарифыг мөрөнд хуулж бичнэ: дараа нь үнэ өөрчлөгдөхөд өмнө төлсөн хүний
 * хөнгөлөлт өөрөө өөрчлөгдөх ёсгүй.
 */
export async function bookPlacement(input: {
  userId: string;
  bookedDate: string;
  slot: string;
  feeAmount: number;
}): Promise<BookResult> {
  const { data, error } = await getSupabase()
    .from("placement_bookings")
    .insert({
      user_id: input.userId,
      booked_date: input.bookedDate,
      slot: input.slot,
      status: "awaiting_payment",
      fee_amount: input.feeAmount,
    })
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
    .in("status", ACTIVE_STATUSES)
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
 * Болисон болон төлөгдөөгүй захиалгыг оруулахгүй: багшийн жагсаалт нь хэн
 * ирэхийг харуулах ёстой, төлбөрийн цонх нээгээд орхисон хүн тэнд байх нь
 * багшийг хоосон хүлээлгэнэ. Хуудасласан — нэг хичээлийн жилд олон зуун
 * мөр хуримтлагдана.
 */
export async function listBookings(
  opts: { fromDate?: string } = {}
): Promise<PlacementBookingWithUser[]> {
  const rows = await fetchAllRows<Row & { users: unknown }>(() => {
    let query = getSupabase()
      .from("placement_bookings")
      .select("*, users(*)")
      .not("status", "in", "(cancelled,awaiting_payment)")
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

/** Нэхэмжлэхийг захиалгад холбоно — QR-ыг дахин үзүүлэхэд хэрэгтэй. */
export async function attachBookingInvoice(
  id: string,
  invoice: { invoiceId: string; qrImage: string; shortUrl: string }
): Promise<PlacementBooking | undefined> {
  const { data, error } = await getSupabase()
    .from("placement_bookings")
    .update({
      qpay_invoice_id: invoice.invoiceId,
      qpay_qr_image: invoice.qrImage,
      qpay_short_url: invoice.shortUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : undefined;
}

/**
 * QPay-ээс төлбөрийг шалгаад, орсон бол захиалгыг баталгаажуулна.
 *
 * Нөхцөлт UPDATE: webhook болон хуудасны асуулга бараг зэрэг ирдэг тул
 * `status = 'awaiting_payment'` гэсэн нөхцөлгүйгээр хоёулаа "би анх
 * баталгаажууллаа" гэж бодно.
 */
export async function settleBookingPayment(id: string): Promise<PlacementBooking | undefined> {
  const booking = await findBookingById(id);
  if (!booking || booking.status !== "awaiting_payment" || !booking.qpayInvoiceId) {
    return booking;
  }
  const result = await getPaymentProvider().checkPayment(booking.qpayInvoiceId);
  if (!result.paid) return booking;

  const { data, error } = await getSupabase()
    .from("placement_bookings")
    .update({ status: "booked", paid_at: result.paidAt, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "awaiting_payment")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : findBookingById(id);
}

export async function findBookingById(id: string): Promise<PlacementBooking | undefined> {
  const { data, error } = await getSupabase()
    .from("placement_bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  return data ? fromRow(data as Row) : undefined;
}

/**
 * Хүний төлсөн захиалга — хөнгөлөлт ашигласан эсэхээс үл хамааран.
 *
 * Болисон, ирээгүй захиалгыг ч хамруулна: мөнгө төлөгдсөн бол хөнгөлөлт
 * хүчинтэй гэж шийдсэн.
 */
export async function findPaidBooking(userId: string): Promise<PlacementBooking | undefined> {
  const { data, error } = await getSupabase()
    .from("placement_bookings")
    .select("*")
    .eq("user_id", userId)
    .not("paid_at", "is", null)
    .order("paid_at")
    .order("id")
    .limit(1);
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  const rows = (data ?? []) as Row[];
  return rows[0] ? fromRow(rows[0]) : undefined;
}

/**
 * Хөнгөлөлтийг нэг бүртгэлд эзэмшүүлнэ.
 *
 * Нөхцөлт UPDATE нь атомын үйлдэл: хоёр өөр ангид зэрэг бүртгүүлэх гэж
 * оролдвол зөвхөн нэг нь 20,000₮-ийн хөнгөлөлт авна. `credited_registration_id`
 * дээрх unique индекс нь хоёр дахь давхаргын хамгаалалт.
 */
export async function claimBookingCredit(
  userId: string,
  registrationId: string
): Promise<PlacementBooking | undefined> {
  const { data, error } = await getSupabase()
    .from("placement_bookings")
    .update({ credited_registration_id: registrationId, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .not("paid_at", "is", null)
    .is("credited_registration_id", null)
    .select("*");
  if (error) {
    if (isInvalidUuidError(error)) return undefined;
    throw error;
  }
  const rows = (data ?? []) as Row[];
  return rows[0] ? fromRow(rows[0]) : undefined;
}

/**
 * Хөнгөлөлтийг бүртгэлээс салгана.
 *
 * Хэрэгтэй тохиолдол: эцэг эх нэг ангид бүртгүүлж эхлээд, төлөхөөсөө өмнө
 * бодлоо өөрчилж өөр анги сонгох. Мөнгө ороогүй бүртгэл хөнгөлөлтийг
 * барьж үлдэх ёсгүй.
 */
export async function releaseBookingCredit(registrationId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("placement_bookings")
    .update({ credited_registration_id: null, updated_at: new Date().toISOString() })
    .eq("credited_registration_id", registrationId);
  if (error && !isInvalidUuidError(error)) throw error;
}
