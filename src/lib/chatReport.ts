import { getSupabase } from "./supabase";
import { routeChat } from "./ai/router";

/** The model's answer, in the shape the report page renders. */
export type ChatReportSummary = {
  /** One line the admin can read and stop there. */
  headline: string;
  themes: { theme: string; count: number; example?: string }[];
  faq: { question: string; answer?: string }[];
  attention: { issue: string; detail?: string }[];
  suggestions: string[];
};

export type ChatReport = {
  id: string;
  fromDate: string;
  toDate: string;
  messageCount: number;
  conversationCount: number;
  summary: ChatReportSummary;
  createdBy?: string;
  createdAt: string;
};

type ChatReportRow = {
  id: string;
  from_date: string;
  to_date: string;
  message_count: number;
  conversation_count: number;
  summary: ChatReportSummary;
  created_by: string | null;
  created_at: string;
};

function fromRow(row: ChatReportRow): ChatReport {
  return {
    id: row.id,
    fromDate: row.from_date,
    toDate: row.to_date,
    messageCount: row.message_count,
    conversationCount: row.conversation_count,
    summary: row.summary,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listChatReports(limit = 30): Promise<ChatReport[]> {
  const { data, error } = await getSupabase()
    .from("chat_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ChatReportRow[]).map(fromRow);
}

/** Trimmed so one very long message cannot crowd out fifty short ones. */
const MAX_MESSAGE_CHARS = 400;
const MAX_MESSAGES = 600;

const SYSTEM = `Чи Монголын математикийн сургалтын төвийн чатбот руу ирсэн
хэрэглэгчийн мессежүүдийг задлан шинжилж, удирдлагад зориулсан товч тайлан
бичдэг туслах. Хариултаа ЗӨВХӨН JSON хэлбэрээр, өөр ямар ч тайлбаргүйгээр буцаа.

Бүтэц:
{
  "headline": "1-2 өгүүлбэрээр энэ хугацааны гол дүр зураг",
  "themes": [{"theme": "сэдвийн нэр", "count": тоо, "example": "жишээ асуулт"}],
  "faq": [{"question": "их асуугдсан асуулт", "answer": "санал болгох богино хариу"}],
  "attention": [{"issue": "анхаарах ёстой зүйл", "detail": "яагаад чухал вэ"}],
  "suggestions": ["хийвэл зохих богино арга хэмжээ"]
}

Дүрэм:
- Бүгдийг монгол хэлээр, кирилл үсгээр бич.
- ТОВЧ бич. themes дээд тал нь 6, faq 5, attention 4, suggestions 3.
- Мөр бүр 90 тэмдэгтээс богино байх. Урт өгүүлбэр бүү бич.
- themes-ийг олон давтагдсанаар нь эрэмбэл.
- attention-д гомдол, төлбөрийн маргаан, ойлгомжгүй байсан зүйл, хариу
  аваагүй мэт харагдсан асуултыг оруул. Байхгүй бол хоосон массив.
- Хүний нэр, утасны дугаарыг тайландаа бүү бич.
- Мессежийн дугаар, дугаарын жагсаалтыг бүү дурд — тоо нь утасны дугаар мэт
  уншигдаж, уншигчид ямар ч утгагүй. Оронд нь юу болсныг үгээр тайлбарла.
- Тоо зохиож болохгүй — өгөгдсөн мессежээс тоол.`;

/**
 * Reads a date range of visitor messages and asks the model to sort them out.
 *
 * Only what people wrote is sent, never the bot's own replies: the question
 * is what the school is being asked, and the answers double the tokens while
 * adding nothing to that.
 */
export async function buildChatReport(input: {
  fromDate: string;
  toDate: string;
  createdBy?: string;
}): Promise<ChatReport> {
  const supabase = getSupabase();
  const fromIso = `${input.fromDate}T00:00:00.000Z`;
  const toIso = `${input.toDate}T23:59:59.999Z`;

  const { data, error } = await supabase
    .from("chat_messages")
    .select("conversation_id, content, created_at")
    .eq("role", "user")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at")
    .limit(MAX_MESSAGES);
  if (error) throw error;

  const messages = (data ?? []) as { conversation_id: string; content: string; created_at: string }[];
  const conversationCount = new Set(messages.map((m) => m.conversation_id)).size;

  if (messages.length === 0) {
    return saveReport({
      ...input,
      messageCount: 0,
      conversationCount: 0,
      summary: {
        headline: "Энэ хугацаанд чатаар ирсэн мессеж алга байна.",
        themes: [],
        faq: [],
        attention: [],
        suggestions: [],
      },
    });
  }

  // No line numbers: given them, the model cites "(164, 183, 231)" in the
  // report, which reads like phone numbers and means nothing to the reader.
  const transcript = messages
    .map((m) => `[${m.created_at.slice(0, 10)}] ${m.content.slice(0, MAX_MESSAGE_CHARS)}`)
    .join("\n");

  const prompt = `Хугацаа: ${input.fromDate} — ${input.toDate}\nНийт ${messages.length} мессеж, ${conversationCount} харилцан яриа.\n\n${transcript}`;

  // Asked once; asked again, more sternly, if the answer came back as
  // something JSON.parse refuses. On a long range the model occasionally
  // slips — one retry is cheaper than handing the admin an empty report.
  let summary = parseSummary(await ask(SYSTEM, prompt));
  if (!summary) {
    summary = parseSummary(
      await ask(
        `${SYSTEM}\n\nӨМНӨХ ОРОЛДЛОГО БҮТСЭНГҮЙ: хариу нь зөв JSON биш байлаа.
Энэ удаад зөвхөн цэвэр JSON бич — код блок, тайлбар, шинэ мөр дотор
хашилт бүү оруул. Богино байлга.`,
        prompt
      )
    );
  }

  return saveReport({
    ...input,
    messageCount: messages.length,
    conversationCount,
    summary: summary ?? FAILED_SUMMARY,
  });
}

const FAILED_SUMMARY: ChatReportSummary = {
  headline: "Тайланг боловсруулж чадсангүй. Хугацааны хязгаарыг богиносгоод дахин оролдоно уу.",
  themes: [],
  faq: [],
  attention: [],
  suggestions: [],
};

async function ask(system: string, prompt: string): Promise<string> {
  const result = await routeChat({
    system,
    // A report is not a chat reply: it needs the better model and room to
    // finish its JSON. Mongolian Cyrillic costs roughly two and a half tokens
    // per character, so a page of it eats a budget that looks generous — at
    // 4000 the answer stopped mid-string and could not be parsed at all.
    tier: "smart",
    maxTokens: 8000,
    messages: [{ role: "user", content: prompt }],
  });
  return result.text;
}

/** The model is asked for bare JSON; a stray code fence must not lose the report. */
function parseSummary(text: string): ChatReportSummary | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<ChatReportSummary>;
    if (!parsed.headline && !Array.isArray(parsed.themes)) return null;
    return {
      headline: parsed.headline ?? FAILED_SUMMARY.headline,
      themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 8) : [],
      faq: Array.isArray(parsed.faq) ? parsed.faq.slice(0, 8) : [],
      attention: Array.isArray(parsed.attention) ? parsed.attention.slice(0, 8) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 6) : [],
    };
  } catch {
    return null;
  }
}

async function saveReport(input: {
  fromDate: string;
  toDate: string;
  messageCount: number;
  conversationCount: number;
  summary: ChatReportSummary;
  createdBy?: string;
}): Promise<ChatReport> {
  const { data, error } = await getSupabase()
    .from("chat_reports")
    .insert({
      from_date: input.fromDate,
      to_date: input.toDate,
      message_count: input.messageCount,
      conversation_count: input.conversationCount,
      summary: input.summary,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as ChatReportRow);
}
