import { listPublishedCourseSummaries, listRegistrationsByUser, listYearlyPrograms } from "../db";

const BASE_PROMPT = `Та бол gmath.mn сайтын туслах чатбот. gmath.mn нь Б.Ганбат багшийн олимпиадын математикийн онлайн сургалтын сайт бөгөөд 4–12-р ангийн сурагчид болон багш нарт зориулсан сургалт, түвшин тогтоох үнэлгээ, сертификатын үйлчилгээ үзүүлдэг.

Дүрэм:
- Үргэлж монгол хэлээр, товч бөгөөд эелдэгээр хариулна уу. Хариултад монгол хэлнээс өөр хэлний үг, тэмдэгт (англи, япон, хятад г.м) хэзээ ч оруулж болохгүй.
- Зөвхөн доор өгөгдсөн мэдээлэлд тулгуурлан хариулна уу. Үнэ, хуваарь, хичээлийн агуулгыг өөрөө зохиож болохгүй.
- Мэдэхгүй бол "Уучлаарай, тэр талаар надад мэдээлэл байхгүй. Б.Ганбат багштай холбогдоно уу." гэж шууд хэлнэ үү.
- Хувийн мэдээлэл (нэвтрэх нэр, нууц үг, төлбөрийн дэлгэрэнгүй) хэзээ ч асуухгүй.
- Хариултаа 3-4 өгүүлбэрт багтаана уу.
- Холбоос: зөвхөн доор бичигдсэн хаягуудыг л ашиглана уу, өөрөө хаяг зохиож болохгүй. Тухайн сургалтын талаар асуувал ерөнхий /courses хуудсыг биш, тэр сургалтын өөрийн хуудсыг санал болгоно уу.
- Холбоосыг үргэлж [Уншигдахуйц нэр](/хаяг) хэлбэрээр бичнэ үү, урт хаягийг нүцгэн тавьж болохгүй. Жишээ: [B ангилал сургалт](/courses/abc123) хуудсыг үзнэ үү.

Сайтын хуудсууд:
- /courses — бүх сургалтын жагсаалт
- /assessment — түвшин тогтоох үнэлгээ (сурагчийн ангиллыг тодорхойлох)
- /certificate — багшийн сертификат шалгах
- /articles — нийтлэлүүд
- /profile — хэрэглэгчийн хувийн хуудас (бүртгэл, хичээлийн бичлэг, ирц)
- /team/ganbat — Б.Ганбат багшийн танилцуулга

Холбоо барих (сайтын footer дээр нийтэд байгаа мэдээлэл):
- Утас: 9077 7400, 9939 5945
- Имэйл: math.ganbat@gmail.com
- Facebook: https://www.facebook.com/ganbat.surgalt/
- Хаяг: Улаанбаатар, Сүхбаатар дүүрэг, 1-р хороо, 1-р сургуулийн замын эсрэг талд, Чонон бүрт төв, 403 тоот`;

/** A 100-lesson yearly programme would swamp the prompt; the first chunk plus a total is enough to answer "хэзээ эхлэх вэ". */
const MAX_LESSONS_IN_PROMPT = 20;

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
export async function buildSystemPrompt(userId?: string): Promise<string> {
  const [courses, yearly] = await Promise.all([listPublishedCourseSummaries(), listYearlyPrograms()]);

  const sections = [BASE_PROMPT];

  // `period` already carries its own leading slash ("/ сар"), so it's
  // concatenated rather than joined with another one.
  const catalogue = [
    ...courses.map((c) => `- ${c.title} (${c.tag}) — ${c.price}${c.period}. ${c.topics} Хуудас: /courses/${c.id}`),
    // Yearly programs aren't in the courses table and don't follow the
    // course-id URL pattern — they're hand-written pages at /courses/c and
    // /courses/d, same mapping as src/components/Courses.tsx uses.
    ...yearly.map(
      (p) =>
        `- ${p.title} (${p.tag}) — ${p.price}${p.period}. ${p.topics} Хуудас: /courses/${p.id.replace("program-", "")}`
    ),
  ];
  sections.push(
    catalogue.length > 0
      ? `Одоо нээлттэй сургалтууд:\n${catalogue.join("\n")}`
      : "Одоогоор нээлттэй сургалт байхгүй байна."
  );

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
          lines.push(`    … бусад ${r.lessons.length - shown.length} хичээлийг /profile хуудаснаас харна.`);
        }
      }
      return lines.join("\n");
    });
    sections.push(
      mine.length > 0
        ? `Энэ хэрэглэгчийн бүртгүүлсэн сургалтууд. Доорх Facebook групп, Zoom холбоос, хичээлийн хуваарийг зөвхөн энэ хэрэглэгчид л асуувал хэлж болно:\n${mine.join("\n")}`
        : "Энэ хэрэглэгч одоогоор ямар ч сургалтад бүртгүүлээгүй байна."
    );
  } else {
    sections.push("Хэрэглэгч нэвтрээгүй байна. Хувийн бүртгэлийн талаар асуувал нэвтрэхийг санал болгоно уу.");
  }

  return sections.join("\n\n");
}
