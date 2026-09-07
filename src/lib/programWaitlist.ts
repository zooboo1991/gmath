import { getSupabase } from "./supabase";
import { toPublicUser, userFromRow, type PublicUser, type UserRow } from "./db";

/**
 * Хөтөлбөрийн бүртгэл хаагдсан үеийн дараалал.
 *
 * waitlist_requests-ээс тусдаа: тэр нь "манай ангид хичээл алга" гэсэн
 * ерөнхий хүсэлт, энэ нь яг нэг хөтөлбөрийн дараалал. Сурагчид хэлдэг
 * дугаарыг хадгалдаггүй — өмнөх мөрүүдийг тоолж уншихдаа гаргана. Тиймээс
 * хэн нэг нь гармагц ардчуудынх нь дугаар өөрөө урагшилна.
 */

export type ProgramWaitlistStatus = "waiting" | "notified" | "closed";

export type ProgramWaitlistEntry = {
  id: string;
  userId: string;
  programId: string;
  programLabel: string;
  status: ProgramWaitlistStatus;
  createdAt: string;
  notifiedAt?: string;
};

export type ProgramWaitlistEntryWithUser = ProgramWaitlistEntry & {
  /** Дараалал дахь байр — зөвхөн хүлээж буй мөрүүдийг тооцно. */
  position: number;
  user?: PublicUser;
  /**
   * Энэ хүн аль хэдийн бүртгэлтэй сургалтууд (цуцлагдсанаас бусад).
   *
   * Дарааллын мөр өөрөө буруу байж болохыг админд шууд хэлэх зорилготой:
   * өөрийнхөө сургалтын дараалалд зогссон хүн рүү "суудал гарлаа" гэж
   * залгах нь эвгүй. sameProgram нь энэ хөтөлбөрийнх мөн эсэх.
   */
  registrations: { programId: string; programLabel: string; status: string; sameProgram: boolean }[];
};

type Row = {
  id: string;
  user_id: string;
  program_id: string;
  program_label: string;
  status: ProgramWaitlistStatus;
  created_at: string;
  notified_at: string | null;
};

/** Дараалалд байр эзэлдэг төлөвүүд — хаагдсан мөр байрыг эзлэхээ болино. */
const QUEUED: ProgramWaitlistStatus[] = ["waiting", "notified"];

function fromRow(row: Row): ProgramWaitlistEntry {
  return {
    id: row.id,
    userId: row.user_id,
    programId: row.program_id,
    programLabel: row.program_label,
    status: row.status,
    createdAt: row.created_at,
    notifiedAt: row.notified_at ?? undefined,
  };
}

/**
 * Дараалалд орно, эсвэл аль хэдийн байгаа мөрөө буцаана.
 *
 * Давхар дарах, хоёр таб зэрэг нээх зэргээс болж хоёр удаа орох ёсгүй тул
 * (user_id, program_id) дээрх unique түлхүүрт тулгуурлан upsert хийнэ.
 * Байрыг нь ЭХНИЙ орсон огноогоор тооцох тул давтан дарахад ард ордоггүй.
 */
export async function joinProgramWaitlist(input: {
  userId: string;
  programId: string;
  programLabel: string;
}): Promise<ProgramWaitlistEntry> {
  const existing = await findProgramWaitlistEntry(input.userId, input.programId);
  if (existing) return existing;

  const { data, error } = await getSupabase()
    .from("program_waitlist")
    .upsert(
      {
        user_id: input.userId,
        program_id: input.programId,
        program_label: input.programLabel,
        status: "waiting",
        notified_at: null,
      },
      { onConflict: "user_id,program_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as Row);
}

export async function findProgramWaitlistEntry(
  userId: string,
  programId: string
): Promise<ProgramWaitlistEntry | undefined> {
  const { data, error } = await getSupabase()
    .from("program_waitlist")
    .select("*")
    .eq("user_id", userId)
    .eq("program_id", programId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : undefined;
}

/**
 * Тухайн мөрийн дараалал дахь байр (1-ээс эхэлнэ).
 *
 * Өөрөөсөө өмнө орсон, дараалалд байр эзэлж буй мөрүүдийг тоолно. Хаагдсан
 * мөр тоологдохгүй тул урд хүн гармагц бусдын дугаар урагшилна.
 */
export async function positionInProgramWaitlist(entry: ProgramWaitlistEntry): Promise<number> {
  if (!QUEUED.includes(entry.status)) return 0;
  const { count, error } = await getSupabase()
    .from("program_waitlist")
    .select("id", { count: "exact", head: true })
    .eq("program_id", entry.programId)
    .in("status", QUEUED)
    .lt("created_at", entry.createdAt);
  if (error) throw error;
  return (count ?? 0) + 1;
}

/** Хөтөлбөрийн бүтэн дараалал, байр ба хэрэглэгчийн мэдээлэлтэй. */
export async function listProgramWaitlist(
  programId: string
): Promise<ProgramWaitlistEntryWithUser[]> {
  const { data, error } = await getSupabase()
    .from("program_waitlist")
    .select("*, users(*)")
    .eq("program_id", programId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as (Row & { users: UserRow | null })[];

  // Дарааллынхны бүртгэлийг нэг дуудалтаар: мөр бүрд асуувал жагсаалт
  // урсах тусам дуудлага өснө.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: regs } = userIds.length
    ? await getSupabase()
        .from("registrations")
        .select("user_id, program_id, program_label, status")
        .in("user_id", userIds)
        .neq("status", "cancelled")
    : { data: [] };
  const byUser = new Map<string, { programId: string; programLabel: string; status: string }[]>();
  for (const r of (regs ?? []) as {
    user_id: string;
    program_id: string;
    program_label: string;
    status: string;
  }[]) {
    byUser.set(r.user_id, [
      ...(byUser.get(r.user_id) ?? []),
      { programId: r.program_id, programLabel: r.program_label, status: r.status },
    ]);
  }

  let position = 0;
  return rows.map((row) => {
    const entry = fromRow(row);
    if (QUEUED.includes(entry.status)) position += 1;
    return {
      ...entry,
      position: QUEUED.includes(entry.status) ? position : 0,
      user: row.users ? toPublicUser(userFromRow(row.users)) : undefined,
      registrations: (byUser.get(row.user_id) ?? []).map((r) => ({
        ...r,
        sameProgram: r.programId === programId,
      })),
    };
  });
}

export async function findProgramWaitlistEntryById(
  id: string
): Promise<ProgramWaitlistEntry | undefined> {
  const { data, error } = await getSupabase()
    .from("program_waitlist")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : undefined;
}

/**
 * Нэг хүний бүх дараалал, байртай нь — профайлд харуулахад.
 *
 * Байрыг мөр тус бүрд тоолно: хүн ихдээ хоёр хөтөлбөрт байх тул
 * дуудлагын тоо асуудалгүй.
 */
export async function listProgramWaitlistByUser(
  userId: string
): Promise<(ProgramWaitlistEntry & { position: number })[]> {
  const { data, error } = await getSupabase()
    .from("program_waitlist")
    .select("*")
    .eq("user_id", userId)
    .in("status", QUEUED)
    .order("created_at");
  if (error) throw error;

  const entries = ((data ?? []) as Row[]).map(fromRow);
  return Promise.all(
    entries.map(async (entry) => ({ ...entry, position: await positionInProgramWaitlist(entry) }))
  );
}

export async function setProgramWaitlistStatus(
  id: string,
  status: ProgramWaitlistStatus
): Promise<ProgramWaitlistEntry | undefined> {
  const { data, error } = await getSupabase()
    .from("program_waitlist")
    .update({
      status,
      notified_at: status === "notified" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Row) : undefined;
}

/** Сурагч өөрөө дараалалаас гарах. */
export async function leaveProgramWaitlist(userId: string, programId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("program_waitlist")
    .delete()
    .eq("user_id", userId)
    .eq("program_id", programId);
  if (error) throw error;
}

/**
 * Бүртгэл амжилттай үүсмэгц дараалал дахь мөрийг хаана.
 *
 * Холбогдсон хүн бүртгүүлчихээд жагсаалтад "хүлээж байгаа" мэт үлдвэл
 * админ дахин залгана; мөр нь байхгүй бол юу ч хийхгүй. Бүртгэлийн урсгалыг
 * унагаах ёсгүй тул дуудагч талдаа catch-тэй дуудна.
 */
export async function markProgramWaitlistEnrolled(userId: string, programId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("program_waitlist")
    .update({ status: "closed" })
    .eq("user_id", userId)
    .eq("program_id", programId);
  if (error) throw error;
}
