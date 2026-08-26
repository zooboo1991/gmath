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
- themes-ийг олон давтагдсанаар нь эрэмбэл, дээд тал нь 8.
- attention-д гомдол, төлбөрийн маргаан, ойлгомжгүй байсан зүйл, хариу
  аваагүй мэт харагдсан асуултыг оруул. Байхгүй бол хоосон массив.
- Хүний нэр, утасны дугаарыг тайландаа бүү бич.
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

  const transcript = messages
    .map((m, i) => `${i + 1}. [${m.created_at.slice(0, 10)}] ${m.content.slice(0, MAX_MESSAGE_CHARS)}`)
    .join("\n");

  const result = await routeChat({
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Хугацаа: ${input.fromDate} — ${input.toDate}\nНийт ${messages.length} мессеж, ${conversationCount} харилцан яриа.\n\n${transcript}`,
      },
    ],
  });

  return saveReport({
    ...input,
    messageCount: messages.length,
    conversationCount,
    summary: parseSummary(result.text),
  });
}

/** The model is asked for bare JSON; a stray code fence must not lose the report. */
function parseSummary(text: string): ChatReportSummary {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const empty: ChatReportSummary = {
    headline: "Тайланг боловсруулж чадсангүй. Дахин оролдоно уу.",
    themes: [],
    faq: [],
    attention: [],
    suggestions: [],
  };
  if (start === -1 || end <= start) return empty;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<ChatReportSummary>;
    return {
      headline: parsed.headline ?? empty.headline,
      themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 8) : [],
      faq: Array.isArray(parsed.faq) ? parsed.faq.slice(0, 8) : [],
      attention: Array.isArray(parsed.attention) ? parsed.attention.slice(0, 8) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 6) : [],
    };
  } catch {
    return empty;
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
