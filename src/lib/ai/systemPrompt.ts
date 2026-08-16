import type { ChatChannel } from "../db";
import { listArticles, listPublishedCourseSummaries, listRegistrationsByUser, listYearlyPrograms } from "../db";
import { courseAboutItems, siteAchievements, siteFaqs, siteFeatures } from "../siteContent";
import { SITE_URL } from "../siteUrl";
import { courseHref } from "@/lib/courseHref";

const BASE_PROMPT = `Та бол gmath.mn сайтын туслах чатбот. gmath.mn нь Б.Ганбат багшийн олимпиадын математикийн онлайн сургалтын сайт бөгөөд 4–12-р ангийн сурагчид болон багш нарт зориулсан сургалт, түвшин тогтоох үнэлгээ, сертификатын үйлчилгээ үзүүлдэг.

Дүрэм:
- Үргэлж монгол хэлээр, товч бөгөөд эелдэгээр хариулна уу. Хариултад монгол хэлнээс өөр хэлний үг, тэмдэгт (англи, япон, хятад г.м) хэзээ ч оруулж болохгүй.
- Зөвхөн доор өгөгдсөн мэдээлэлд тулгуурлан хариулна уу. Үнэ, хуваарь, хичээлийн агуулгыг өөрөө зохиож болохгүй.
- Мэдэхгүй бол "Уучлаарай, тэр талаар надад мэдээлэл байхгүй. Б.Ганбат багштай холбогдоно уу." гэж шууд хэлнэ үү.
- Хувийн мэдээлэл (нэвтрэх нэр, нууц үг, төлбөрийн дэлгэрэнгүй) хэзээ ч асуухгүй.
- Хариултаа 3-4 өгүүлбэрт багтаана уу.
- ГОМДОЛ ИЛРҮҮЛЭХ: Хэрэглэгч үйлчилгээний асуудал мэдээлбэл — жишээ нь төлбөр төлсөн ч сургалт идэвхжээгүй, хичээлийн бичлэг ажиллахгүй, Zoom-д орж чадахгүй, буруу дүн татагдсан, системд алдаа гарсан — хэвийн тусархуу хариултаа өгсний ДАРАА хамгийн сүүлийн мөрөнд яг <<ГОМДОЛ>> гэж тусад нь бичнэ үү. Энэ тэмдэглэгээг зөвхөн бодит асуудал мэдээлсэн үед л бичнэ; энгийн асуулт, сонирхол, үнэ асуухад хэзээ ч бичихгүй. Хэрэглэгчид энэ тэмдэглэгээ харагдахгүй тул түүний талаар дурдахгүй.
- Холбоос: зөвхөн доор бичигдсэн хаягуудыг л ашиглана уу, өөрөө хаяг зохиож болохгүй. Тухайн сургалтын талаар асуувал бүх сургалтын жагсаалтыг биш, тэр сургалтын өөрийн хуудсыг санал болгоно уу.

Холбоо барих (сайтын footer дээр нийтэд байгаа мэдээлэл):
- Утас: 9077 7400, 9939 5945
- Имэйл: math.ganbat@gmail.com
- Facebook: https://www.facebook.com/ganbat.surgalt/
- Хаяг: Улаанбаатар, Сүхбаатар дүүрэг, 1-р хороо, 1-р сургуулийн замын эсрэг талд, Чонон бүрт төв, 403 тоот`;

/** A 100-lesson yearly programme would swamp the prompt; the first chunk plus a total is enough to answer "хэзээ эхлэх вэ". */
const MAX_LESSONS_IN_PROMPT = 20;

/**
 * The homepage's own copy — selling points, teacher record and FAQ — pulled
 * from the same module the page renders from (../siteContent). Added because
 * the bot used to answer "мэдээлэл байхгүй" to things like "сургалтын онцлог
 * давуу тал юу вэ" when the answer was right there on the site; it only ever
 * saw the structured course rows. Sharing the source means editing the page
 * copy changes what the bot says, with nothing to keep in sync.
 */
const SITE_COPY = [
  `Сургалтын онцлог, давуу тал:\n${siteFeatures.map((f) => `- ${f.title}: ${f.text}`).join("\n")}`,
  `Хичээл хэрхэн явагддаг (бүх сургалтад хамаарна):\n${courseAboutItems
    .map((i) => `- ${i.title}: ${i.text}`)
    .join("\n")}`,
  `Б.Ганбат багшийн үзүүлэлт:\n${siteAchievements.map((a) => `- ${a.value} — ${a.label}`).join("\n")}`,
  `Байнга асуудаг асуултууд (сайтын Асуулт хариулт хэсгээс):\n${siteFaqs
    .map((f) => `- ${f.q}\n  ${f.a}`)
    .join("\n")}`,
].join("\n\n");

/** Titles only — the bodies would be tens of thousands of tokens, and a title plus its link is enough to recommend the right read. */
const MAX_ARTICLES_IN_PROMPT = 40;

/**
 * The two channels need different link conventions. The website widget renders
 * a markdown subset and does client-side nav, so relative paths are ideal.
 * Messenger renders neither — markdown shows up as literal asterisks and
 * brackets, and a relative path means nothing inside the Facebook app — so it
 * gets plain text and absolute URLs.
 */
function channelRules(channel: ChatChannel): string {
  if (channel === "messenger") {
    return `- Холбоосыг бүтэн хаягаар (${SITE_URL}/... ) бичнэ үү. Markdown хэлбэр (**тод**, [нэр](хаяг)) ХЭРЭГЛЭЖ БОЛОХГҮЙ — Messenger дээр тэр нь зүгээр од, хаалт болж харагдана. Зөвхөн энгийн текст бичнэ үү.`;
  }
  return `- Холбоосыг үргэлж [Уншигдахуйц нэр](/хаяг) хэлбэрээр бичнэ үү, урт хаягийг нүцгэн тавьж болохгүй. Жишээ: [B ангилал сургалт](/courses/abc123) хуудсыг үзнэ үү.`;
}

/** Site pages, relative for the widget and absolute for Messenger. */
function sitePages(channel: ChatChannel): string {
  const base = channel === "messenger" ? SITE_URL : "";
  return `Сайтын хуудсууд:
- ${base}/courses — бүх сургалтын жагсаалт
- ${base}/assessment — түвшин тогтоох үнэлгээ (сурагчийн ангиллыг тодорхойлох)
- ${base}/certificate — багшийн сертификат шалгах
- ${base}/articles — нийтлэлүүд
- ${base}/profile — хэрэглэгчийн хувийн хуудас (бүртгэл, хичээлийн бичлэг, ирц)
- ${base}/team/ganbat — Б.Ганбат багшийн танилцуулга`;
}

/**
 * Phase 1's "knowledge base": the live published catalogue, fetched fresh on
 * every request rather than embedded/chunked. Good enough while the answerable
 * questions are all about structured data we already have in Postgres; a real
 * vector-search knowledge base (for uploaded PDFs and the like) is Phase 2.
 *
 * When `userId` is given, that student's own registrations are appended so
 * "миний хичээл хэзээ эхэлдэг вэ" can be answered truthfully.
 *
 * Those registrations carry the Facebook group, Zoom room and lesson
 * schedule — but only for *active* ones, because listRegistrationsByUser
 * attaches those fields server-side only when status is "active" (see its
 * comment in db.ts). So this is the same data, behind the same paid-and-
 * confirmed gate, that /profile already shows the same signed-in student.
 * An earlier version withheld them out of caution, which just meant a paying
 * student asking "фэйсбүүк группын линк юу вэ" got told we didn't know.
 */
export async function buildSystemPrompt({
  userId,
  channel = "website",
}: { userId?: string; channel?: ChatChannel } = {}): Promise<string> {
  const [courses, yearly, articles] = await Promise.all([
    listPublishedCourseSummaries(),
    listYearlyPrograms(),
    listArticles(),
  ]);

  const base = channel === "messenger" ? SITE_URL : "";
  const sections = [BASE_PROMPT, channelRules(channel), sitePages(channel), SITE_COPY];

  // `period` already carries its own leading slash ("/ сар"), so it's
  // concatenated rather than joined with another one.
  const catalogue = [
    ...courses.map(
      (c) => `- ${c.title} (${c.tag}) — ${c.price}${c.period}. ${c.topics} Хуудас: ${base}${courseHref(c)}`
    ),
    // Yearly programs aren't in the courses table and don't follow the
    // course-id URL pattern — they're hand-written pages at /courses/c and
    // /courses/d, same mapping as src/components/Courses.tsx uses.
    ...yearly.map(
      (p) =>
        `- ${p.title} (${p.tag}) — ${p.price}${p.period}. ${p.topics} Хуудас: ${base}/courses/${p.id.replace("program-", "")}`
    ),
  ];
  sections.push(
    catalogue.length > 0
      ? `Одоо нээлттэй сургалтууд:\n${catalogue.join("\n")}`
      : "Одоогоор нээлттэй сургалт байхгүй байна."
  );

  // Titles + links only. Enough for "хүүхэд минь бодлого бодохдоо гацдаг" to
  // get pointed at the article that actually covers it, without pulling 36
  // article bodies into every request.
  if (articles.length > 0) {
    const list = articles
      .slice(0, MAX_ARTICLES_IN_PROMPT)
      .map((a) => `- ${a.title} → ${base}/articles/${a.id}`)
      .join("\n");
    sections.push(
      `Сайт дээрх нийтлэлүүд. Хэрэглэгчийн асуултад тохирох нийтлэл байвал холбоосыг санал болгоно уу (агуулгыг зохиож болохгүй, зөвхөн гарчигт таарвал зөвлөнө):\n${list}`
    );
  }

  if (userId) {
    const registrations = await listRegistrationsByUser(userId);
    const mine = registrations.map((r) => {
      const lines = [
        `- ${r.programLabel} — төлөв: ${r.status === "active" ? "төлбөр төлсөн, эхлэхэд бэлэн" : "төлбөр хүлээгдэж байна"}${r.startDate ? `, эхлэх өдөр: ${r.startDate}` : ""}`,
      ];
      // Everything below is attached only for active registrations, so a
      // pending one simply has nothing extra to show.
      if (r.facebookGroup) lines.push(`  Facebook групп: ${r.facebookGroup}`);
      if (r.zoomLink) {
        const extras = [r.zoomMeetingId && `ID: ${r.zoomMeetingId}`, r.zoomPasscode && `код: ${r.zoomPasscode}`]
          .filter(Boolean)
          .join(", ");
        lines.push(`  Zoom: ${r.zoomLink}${extras ? ` (${extras})` : ""}`);
      }
      if (r.lessons && r.lessons.length > 0) {
        const shown = r.lessons.slice(0, MAX_LESSONS_IN_PROMPT);
        lines.push(`  Хичээлүүд (нийт ${r.lessons.length}):`);
        shown.forEach((lesson, i) => {
          const bits = [lesson.schedule, lesson.recordingLink ? "бичлэг орсон" : undefined].filter(Boolean);
          lines.push(`    ${i + 1}. ${lesson.topic}${bits.length ? ` — ${bits.join(", ")}` : ""}`);
        });
        if (r.lessons.length > shown.length) {
          lines.push(`    … бусад ${r.lessons.length - shown.length} хичээлийг ${base}/profile хуудаснаас харна.`);
        }
      }
      return lines.join("\n");
    });
    sections.push(
      mine.length > 0
        ? `Энэ хэрэглэгчийн бүртгүүлсэн сургалтууд. Доорх Facebook групп, Zoom холбоос, хичээлийн хуваарийг зөвхөн энэ хэрэглэгчид л асуувал хэлж болно:\n${mine.join("\n")}`
        : "Энэ хэрэглэгч одоогоор ямар ч сургалтад бүртгүүлээгүй байна."
    );
  } else if (channel === "messenger") {
    // The account-linking button was taken off the profile page while Facebook
    // app verification is stuck, so the bot must not send anyone looking for
    // it. Personal data still lives behind a login on the website — that is
    // the only instruction that is true right now.
    sections.push(
      `Энэ Facebook хэрэглэгчийг gmath.mn дээрх бүртгэлтэй нь таних боломжгүй. Хувийн бүртгэл, хичээлийн хуваарь, Facebook групп, Zoom холбоосын талаар асуувал: "Эдгээр мэдээлэл ${SITE_URL}/profile хуудсанд нэвтэрснээр харагдана" гэж хэлнэ үү. Ямар нэг товч дарж холбохыг санал болгож БОЛОХГҮЙ. Ерөнхий асуултад хэвийн хариулна уу.`
    );
  } else {
    sections.push("Хэрэглэгч нэвтрээгүй байна. Хувийн бүртгэлийн талаар асуувал нэвтрэхийг санал болгоно уу.");
  }

  return sections.join("\n\n");
}
