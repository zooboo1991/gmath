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
- /team/ganbat — Б.Ганбат багшийн танилцуулга`;

/**
 * Phase 1's "knowledge base": the live published catalogue, fetched fresh on
 * every request rather than embedded/chunked. Good enough while the answerable
 * questions are all about structured data we already have in Postgres; a real
 * vector-search knowledge base (for uploaded PDFs and the like) is Phase 2.
 *
 * When `userId` is given, that student's own registrations are appended so
 * "миний хичээл хэзээ эхэлдэг вэ" can be answered truthfully. Nothing secret
 * goes in — no Zoom links or passcodes, which are only ever revealed through
 * the authenticated profile page.
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
    const mine = registrations.map(
      (r) => `- ${r.programLabel} — төлөв: ${r.status === "active" ? "төлбөр төлсөн, эхлэхэд бэлэн" : "төлбөр хүлээгдэж байна"}${r.startDate ? `, эхлэх өдөр: ${r.startDate}` : ""}`
    );
    sections.push(
      mine.length > 0
        ? `Энэ хэрэглэгчийн бүртгүүлсэн сургалтууд (дэлгэрэнгүйг /profile хуудаснаас харна):\n${mine.join("\n")}`
        : "Энэ хэрэглэгч одоогоор ямар ч сургалтад бүртгүүлээгүй байна."
    );
  } else {
    sections.push("Хэрэглэгч нэвтрээгүй байна. Хувийн бүртгэлийн талаар асуувал нэвтрэхийг санал болгоно уу.");
  }

  return sections.join("\n\n");
}
