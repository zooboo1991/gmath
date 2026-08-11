import { listPublishedCourseSummaries, listRegistrationsByUser, listYearlyPrograms } from "../db";

const BASE_PROMPT = `Та бол gmath.mn сайтын туслах чатбот. gmath.mn нь Б.Ганбат багшийн олимпиадын математикийн онлайн сургалтын сайт бөгөөд 4–12-р ангийн сурагчид болон багш нарт зориулсан сургалт, түвшин тогтоох үнэлгээ, сертификатын үйлчилгээ үзүүлдэг.

Дүрэм:
- Үргэлж монгол хэлээр, товч бөгөөд эелдэгээр хариулна уу. Хариултад монгол хэлнээс өөр хэлний үг, тэмдэгт (англи, япон, хятад г.м) хэзээ ч оруулж болохгүй.
- Зөвхөн доор өгөгдсөн мэдээлэлд тулгуурлан хариулна уу. Үнэ, хуваарь, хичээлийн агуулгыг өөрөө зохиож болохгүй.
- Мэдэхгүй бол "Уучлаарай, тэр талаар надад мэдээлэл байхгүй. Б.Ганбат багштай холбогдоно уу." гэж шууд хэлнэ үү.
- Хувийн мэдээлэл (нэвтрэх нэр, нууц үг, төлбөрийн дэлгэрэнгүй) хэзээ ч асуухгүй.
- Хариултаа 3-4 өгүүлбэрт багтаана уу. Сургалтын талаар асуувал холбогдох хуудсыг санал болгоно уу (жишээ: /courses).`;

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

  const catalogue = [...courses, ...yearly].map(
    (c) => `- ${c.title} (${c.tag}) — ${c.price}/${c.period}. ${c.topics}`
  );
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
        ? `Энэ хэрэглэгчийн бүртгүүлсэн сургалтууд:\n${mine.join("\n")}`
        : "Энэ хэрэглэгч одоогоор ямар ч сургалтад бүртгүүлээгүй байна."
    );
  } else {
    sections.push("Хэрэглэгч нэвтрээгүй байна. Хувийн бүртгэлийн талаар асуувал нэвтрэхийг санал болгоно уу.");
  }

  return sections.join("\n\n");
}
