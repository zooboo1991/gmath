import { getSupabase } from "../supabase";

/**
 * Data access for Zoom attendance tracking. Lessons themselves stay in
 * courses.lessons jsonb (see lib/db.ts) — these tables key off
 * (course_id, lesson_index), the tradeoff explained in schema.sql.
 */

export type LessonMeeting = {
  id: string;
  courseId: string;
  lessonIndex: number;
  zoomMeetingId: string;
  joinUrl: string;
  startUrl?: string;
  createdAt: string;
};

type LessonMeetingRow = {
  id: string;
  course_id: string;
  lesson_index: number;
  zoom_meeting_id: string;
  join_url: string;
  start_url: string | null;
  created_at: string;
};

function lessonMeetingFromRow(row: LessonMeetingRow): LessonMeeting {
  return {
    id: row.id,
    courseId: row.course_id,
    lessonIndex: row.lesson_index,
    zoomMeetingId: row.zoom_meeting_id,
    joinUrl: row.join_url,
    startUrl: row.start_url ?? undefined,
    createdAt: row.created_at,
  };
}

export async function createLessonMeeting(input: {
  courseId: string;
  lessonIndex: number;
  zoomMeetingId: string;
  joinUrl: string;
  startUrl?: string;
}): Promise<LessonMeeting> {
  const { data, error } = await getSupabase()
    .from("lesson_meetings")
    .insert({
      course_id: input.courseId,
      lesson_index: input.lessonIndex,
      zoom_meeting_id: input.zoomMeetingId,
      join_url: input.joinUrl,
      start_url: input.startUrl ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return lessonMeetingFromRow(data as LessonMeetingRow);
}

export async function findLessonMeeting(courseId: string, lessonIndex: number): Promise<LessonMeeting | undefined> {
  const { data, error } = await getSupabase()
    .from("lesson_meetings")
    .select("*")
    .eq("course_id", courseId)
    .eq("lesson_index", lessonIndex)
    .maybeSingle();
  if (error) throw error;
  return data ? lessonMeetingFromRow(data as LessonMeetingRow) : undefined;
}

export async function listLessonMeetingsForCourse(courseId: string): Promise<LessonMeeting[]> {
  const { data, error } = await getSupabase().from("lesson_meetings").select("*").eq("course_id", courseId);
  if (error) throw error;
  return (data as LessonMeetingRow[]).map(lessonMeetingFromRow);
}

export async function findLessonMeetingByZoomId(zoomMeetingId: string): Promise<LessonMeeting | undefined> {
  const { data, error } = await getSupabase()
    .from("lesson_meetings")
    .select("*")
    .eq("zoom_meeting_id", zoomMeetingId)
    .maybeSingle();
  if (error) throw error;
  return data ? lessonMeetingFromRow(data as LessonMeetingRow) : undefined;
}

// ---------------------------------------------------------------------------
// Registrants — one per student per lesson meeting, created lazily the first
// time they click "Хичээлд орох". Their join_url is personal; Zoom's webhook
// events carry the registrant_id back, which is what lets lesson_attendance
// attribute a join to a specific user instead of an anonymous Zoom guest.
// ---------------------------------------------------------------------------

export type LessonRegistrant = {
  id: string;
  lessonMeetingId: string;
  userId: string;
  zoomRegistrantId: string;
  joinUrl: string;
  createdAt: string;
};

type LessonRegistrantRow = {
  id: string;
  lesson_meeting_id: string;
  user_id: string;
  zoom_registrant_id: string;
  join_url: string;
  created_at: string;
};

function lessonRegistrantFromRow(row: LessonRegistrantRow): LessonRegistrant {
  return {
    id: row.id,
    lessonMeetingId: row.lesson_meeting_id,
    userId: row.user_id,
    zoomRegistrantId: row.zoom_registrant_id,
    joinUrl: row.join_url,
    createdAt: row.created_at,
  };
}

export async function findRegistrant(lessonMeetingId: string, userId: string): Promise<LessonRegistrant | undefined> {
  const { data, error } = await getSupabase()
    .from("lesson_registrants")
    .select("*")
    .eq("lesson_meeting_id", lessonMeetingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? lessonRegistrantFromRow(data as LessonRegistrantRow) : undefined;
}

export async function findRegistrantByZoomId(zoomRegistrantId: string): Promise<LessonRegistrant | undefined> {
  const { data, error } = await getSupabase()
    .from("lesson_registrants")
    .select("*")
    .eq("zoom_registrant_id", zoomRegistrantId)
    .maybeSingle();
  if (error) throw error;
  return data ? lessonRegistrantFromRow(data as LessonRegistrantRow) : undefined;
}

export async function createRegistrant(input: {
  lessonMeetingId: string;
  userId: string;
  zoomRegistrantId: string;
  joinUrl: string;
}): Promise<LessonRegistrant> {
  const { data, error } = await getSupabase()
    .from("lesson_registrants")
    .insert({
      lesson_meeting_id: input.lessonMeetingId,
      user_id: input.userId,
      zoom_registrant_id: input.zoomRegistrantId,
      join_url: input.joinUrl,
    })
    .select("*")
    .single();
  if (error) throw error;
  return lessonRegistrantFromRow(data as LessonRegistrantRow);
}

// ---------------------------------------------------------------------------
// Attendance — one row per join. A dropped connection and rejoin during the
// same lesson produces a second row rather than overwriting the first.
// ---------------------------------------------------------------------------

export type LessonAttendance = {
  id: string;
  lessonMeetingId: string;
  userId: string;
  zoomParticipantUuid?: string;
  joinedAt: string;
  leftAt?: string;
  createdAt: string;
};

type LessonAttendanceRow = {
  id: string;
  lesson_meeting_id: string;
  user_id: string;
  zoom_participant_uuid: string | null;
  joined_at: string;
  left_at: string | null;
  created_at: string;
};

function lessonAttendanceFromRow(row: LessonAttendanceRow): LessonAttendance {
  return {
    id: row.id,
    lessonMeetingId: row.lesson_meeting_id,
    userId: row.user_id,
    zoomParticipantUuid: row.zoom_participant_uuid ?? undefined,
    joinedAt: row.joined_at,
    leftAt: row.left_at ?? undefined,
    createdAt: row.created_at,
  };
}

export async function recordJoin(input: {
  lessonMeetingId: string;
  userId: string;
  zoomParticipantUuid?: string;
  joinedAt: string;
}): Promise<LessonAttendance> {
  const { data, error } = await getSupabase()
    .from("lesson_attendance")
    .insert({
      lesson_meeting_id: input.lessonMeetingId,
      user_id: input.userId,
      zoom_participant_uuid: input.zoomParticipantUuid ?? null,
      joined_at: input.joinedAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return lessonAttendanceFromRow(data as LessonAttendanceRow);
}

/**
 * Closes the open attendance row matching a "left" event — prefers an exact
 * zoom_participant_uuid match (Zoom's per-join session id) and falls back to
 * the most recently opened still-open row for that user if the uuid wasn't
 * captured on join for some reason. Returns false if nothing open was found.
 */
export async function recordLeave(input: {
  lessonMeetingId: string;
  userId: string;
  zoomParticipantUuid?: string;
  leftAt: string;
}): Promise<boolean> {
  const sb = getSupabase();

  if (input.zoomParticipantUuid) {
    const { data, error } = await sb
      .from("lesson_attendance")
      .update({ left_at: input.leftAt })
      .eq("lesson_meeting_id", input.lessonMeetingId)
      .eq("zoom_participant_uuid", input.zoomParticipantUuid)
      .is("left_at", null)
      .select("id");
    if (error) throw error;
    if (data && data.length > 0) return true;
  }

  const { data: openRows, error: selectError } = await sb
    .from("lesson_attendance")
    .select("id")
    .eq("lesson_meeting_id", input.lessonMeetingId)
    .eq("user_id", input.userId)
    .is("left_at", null)
    .order("joined_at", { ascending: false })
    .limit(1);
  if (selectError) throw selectError;
  if (!openRows || openRows.length === 0) return false;

  const { error: updateError } = await sb
    .from("lesson_attendance")
    .update({ left_at: input.leftAt })
    .eq("id", openRows[0].id);
  if (updateError) throw updateError;
  return true;
}

export async function listAttendanceForLesson(lessonMeetingId: string): Promise<LessonAttendance[]> {
  const { data, error } = await getSupabase()
    .from("lesson_attendance")
    .select("*")
    .eq("lesson_meeting_id", lessonMeetingId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data as LessonAttendanceRow[]).map(lessonAttendanceFromRow);
}

export type LessonAttendanceWithName = LessonAttendance & { lastName: string; firstName: string; phone: string };

/** Admin's per-lesson attendance list — names included, since "some user_id joined" isn't useful on its own. */
export async function listAttendanceForLessonWithNames(lessonMeetingId: string): Promise<LessonAttendanceWithName[]> {
  const { data, error } = await getSupabase()
    .from("lesson_attendance")
    .select("*, users(last_name, first_name, phone)")
    .eq("lesson_meeting_id", lessonMeetingId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data as (LessonAttendanceRow & { users: { last_name: string; first_name: string; phone: string } | null })[]).map(
    (row) => ({
      ...lessonAttendanceFromRow(row),
      lastName: row.users?.last_name ?? "",
      firstName: row.users?.first_name ?? "",
      phone: row.users?.phone ?? "",
    })
  );
}

export async function listAttendanceForUser(
  userId: string,
  lessonMeetingIds: string[]
): Promise<LessonAttendance[]> {
  if (lessonMeetingIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("lesson_attendance")
    .select("*")
    .eq("user_id", userId)
    .in("lesson_meeting_id", lessonMeetingIds)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data as LessonAttendanceRow[]).map(lessonAttendanceFromRow);
}
