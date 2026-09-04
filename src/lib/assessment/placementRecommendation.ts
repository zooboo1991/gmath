import { claudeChat } from "../ai/providers/claude";
import { deepseekChat } from "../ai/providers/deepseek";
import { listPublishedCourseSummaries, listYearlyPrograms } from "../db";
import { SITE_URL } from "../siteUrl";
import { courseHref } from "@/lib/courseHref";
import type { PlacementResult } from "./placementEngine";

/**
 * Шаталсан шалгалтын AI дүгнэлт — quizRecommendation-ий ижил зарчим:
 * нэг дуудалт, ухаалаг түвшний модел, каталог шахаж өгнө, хэзээ ч
 * унадаггүй (fallback-тай).
 *
 * Квизээс ялгаатай нь оролт: нийт оноо биш, СЭДЭВ БҮРИЙН 0-3 түвшин.
 * Тиймээс дүгнэлт нь "аль сэдэвдээ хүчтэй, альд нь суурь тавих" гэсэн
 * задаргаатай гарна — radar-тай зэрэгцэж уншигдана.
 */
export async function writePlacementRecommendation(input: {
  grade: number;
  result: PlacementResult;
}): Promise<string> {
  const { result } = input;
  try {
    const [courses, programs] = await Promise.all([
      listPublishedCourseSummaries().catch(() => []),
      listYearlyPrograms().catch(() => []),
    ]);
    const catalogue = [
      ...programs.map((p) => `- ${p.label || p.title}: ${p.price} ${p.period} — ${SITE_URL}/courses/${p.id.replace(/^program-/, "")}`),
      ...courses.map((c) => `- ${c.title} (${c.tag}): ${c.price} ${c.period} — ${SITE_URL}${courseHref(c)}`),
    ].join("\n");

    const topicLines = result.topics
      .map((t) => `- ${t.topic}: ${t.score}/3`)
      .join("\n");

    const system = `Чи Б.Ганбат багшийн математикийн сургалтын туслах. Шаталсан түвшин тогтоох шалгалт өгсөн сурагчид дүгнэлт бичнэ.

Шалгалтын зарчим: сэдэв бүр дунд түвшний бодлогоос эхэлж, зөв бол гүнзгий, буруу бол хөнгөн бодлого өгөгдсөн. Сэдэв бүрийн оноо 0-3: 0 нь хөнгөнийг ч чадаагүй, 3 нь гүнзгийг чадсан гэсэн үг.

Дүрэм:
1. Зөвхөн монгол хэлээр, эцэг эхэд ойлгомжтой, урам өгсөн өнгөөр бич. Гадаад үг бүү хэрэглэ.
2. 120-180 үгтэй, 3 хэсэгтэй: (а) ерөнхий түвшний товч үнэлгээ, (б) сайн болон сул сэдвүүд — сул дээр нь юуг давтах, (в) тохирох сургалтын санал.
3. Оноог өөрөө дахин бүү тоол — өгөгдсөн тоог ашигла.
4. Сургалт санал болгохдоо ЗӨВХӨН доорх жагсаалтаас сонго, нэр болон холбоосыг нь яг хуул. Тохирох нь байхгүй бол сургалт нэрлэлгүй ${SITE_URL}/courses хуудсыг санал болго.
5. Markdown бүү хэрэглэ — энгийн текст, холбоосыг шууд бичнэ.

Боломжит сургалтууд:
${catalogue || "(одоогоор жагсаалт хоосон)"}`;

    const user = `Шалгалтын үр дүн:
- Анги: ${input.grade}-р анги
- Тогтоосон түвшин: ${result.levelLabel}
- Сэдэв бүрийн оноо (0-3):
${topicLines}

Энэ сурагчид дүгнэлт бич.`;

    const chat = process.env.AI_PROVIDER === "deepseek" ? deepseekChat : claudeChat;
    const reply = await chat({ system, messages: [{ role: "user", content: user }], tier: "smart" });
    const text = reply.text.trim();
    if (text) return text;
  } catch (err) {
    console.error("[placement] AI recommendation failed, using fallback:", err);
  }
  return fallbackRecommendation(input.grade, result);
}

/** Модел унасан үеийн детерминист дүгнэлт — сургалт нэрлэхгүй. */
function fallbackRecommendation(grade: number, result: PlacementResult): string {
  const strong = result.topics.filter((t) => t.score >= 2).map((t) => t.topic);
  const weak = result.topics.filter((t) => t.score <= 1).map((t) => t.topic);
  const strongLine = strong.length ? ` Сайн сэдвүүд: ${strong.join(", ")}.` : "";
  const weakLine = weak.length ? ` Давтах хэрэгтэй сэдвүүд: ${weak.join(", ")}.` : "";
  return `${grade}-р ангийн шалгалтаар ${result.levelLabel} тогтоогдлоо.${strongLine}${weakLine} Түвшиндээ тохирсон ангид суувал ахиц хамгийн хурдан гарна — сургалтуудыг ${SITE_URL}/courses хуудаснаас үзээрэй.`;
}
