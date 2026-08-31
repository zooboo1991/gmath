import { getSupabase } from "./supabase";

/**
 * Хичээлийн бичлэгийг хэн үзсэнийг тэмдэглэнэ.
 *
 * Гарын үсэгтэй холбоос авах бүрд дуудагдана — өөрөөр хэлбэл тоглуулагчийг
 * нээх бүрд. Хэдэн минут үзсэнийг Bunny-гээс мэдэх боломжтой ч энд
 * шаардлагагүй: ирцийн хуудсанд зөвхөн "нөхөж үзсэн эсэх" л хэрэгтэй.
 */
export type RecordingView = {
  courseId: string;
  lessonIndex: number;
  userId: string;
  firstViewedAt: string;
  lastViewedAt: string;
  viewCount: number;
};

type Row = {
  course_id: string;
  lesson_index: number;
  user_id: string;
  first_viewed_at: string;
  last_viewed_at: string;
  view_count: number;
};

function fromRow(row: Row): RecordingView {
  return {
    courseId: row.course_id,
    lessonIndex: row.lesson_index,
    userId: row.user_id,
    firstViewedAt: row.first_viewed_at,
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count,
  };
}

/**
 * Үзсэн гэж тэмдэглэнэ. Бичлэг үзэх замд сууж байгаа тул алдаа гарвал
 * дуугүй өнгөрнө — тоолуурын төлөө хүүхдийг бичлэггүй үлдээхгүй.
 */
export async function recordRecordingView(input: {
  courseId: string;
  lessonIndex: number;
  userId: string;
}): Promise<void> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("lesson_recording_views")
    .select("view_count")
    .eq("course_id", input.courseId)
    .eq("lesson_index", input.lessonIndex)
    .eq("user_id", input.userId)
    .maybeSingle();

  const now = new Date().toISOString();
  const previous = (data as { view_count: number } | null)?.view_count ?? 0;

  await supabase.from("lesson_recording_views").upsert(
    {
      course_id: input.courseId,
      lesson_index: input.lessonIndex,
      user_id: input.userId,
      last_viewed_at: now,
      view_count: previous + 1,
      ...(previous === 0 ? { first_viewed_at: now } : {}),
    },
    { onConflict: "course_id,lesson_index,user_id" }
  );
}

/** Нэг сурагчийн нэг сургалт дээр үзсэн бичлэгүүд. */
export async function listRecordingViews(
  userId: string,
  courseId: string
): Promise<RecordingView[]> {
  const { data, error } = await getSupabase()
    .from("lesson_recording_views")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId);
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}
