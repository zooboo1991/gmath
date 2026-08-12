import { claudeChat } from "../ai/providers/claude";
import { deepseekChat } from "../ai/providers/deepseek";
import { listPublishedCourseSummaries, listYearlyPrograms } from "../db";
import { SITE_URL } from "../siteUrl";
import { TRACK_LABELS, type QuizTrack } from "./types";

/**
 * Writes the personalised зөвлөмж a completed quiz shows.
 *
 * One model call per completed test — smart tier, because this is the single
 * paid deliverable of the quiz and a clumsy recommendation is the whole
 * product failing. The catalogue is injected so the model recommends a course
 * that actually exists; rule 4 of the prompt keeps it from inventing one.
 *
 * Never throws: the caller stores whatever comes back, and if the provider is
 * down the student gets the deterministic fallback instead of an error page.
 */
export async function writeQuizRecommendation(input: {
  track: QuizTrack;
  grade: number;
  score: number;
  total: number;
  wrongTopics: string[];
}): Promise<string> {
  try {
    const [courses, programs] = await Promise.all([
      listPublishedCourseSummaries().catch(() => []),
      listYearlyPrograms().catch(() => []),
    ]);

    const catalogue = [
      ...programs.map((p) => `- ${p.label || p.title}: ${p.price} ${p.period} — ${SITE_URL}/courses/${p.id.replace(/^program-/, "")}`),
      ...courses.map((c) => `- ${c.title} (${c.tag}): ${c.price} ${c.period} — ${SITE_URL}/courses/${c.id}`),
    ].join("\n");

    const wrong = summariseTopics(input.wrongTopics);
    const system = `Чи Б.Ганбат багшийн математикийн сургалтын туслах. Түвшин тогтоох тест өгсөн сурагчид зөвлөмж бичнэ.

Дүрэм:
1. Зөвхөн монгол хэлээр, эцэг эхэд ойлгомжтой, урам өгсөн өнгөөр бич. Гадаад үг бүү хэрэглэ.
2. 120-180 үгтэй, 3 хэсэгтэй: (а) үр дүнгийн товч үнэлгээ, (б) алдсан сэдвүүд дээр юуг давтах, (в) тохирох сургалтын санал.
3. Оноог өөрөө дахин бүү тоол — өгөгдсөн тоог ашигла.
4. Сургалт санал болгохдоо ЗӨВХӨН доорх жагсаалтаас сонго, нэр болон холбоосыг нь яг хуул. Жагсаалтад тохирох нь байхгүй бол сургалт нэрлэлгүй ${SITE_URL}/courses хуудсыг санал болго.
5. Markdown бүү хэрэглэ — энгийн текст, холбоосыг шууд бичнэ.

Боломжит сургалтууд:
${catalogue || "(одоогоор жагсаалт хоосон)"}`;

    const user = `Тестийн үр дүн:
- Төрөл: ${TRACK_LABELS[input.track]}
- Анги: ${input.grade}-р анги
- Оноо: ${input.total} асуултаас ${input.score} зөв
${wrong ? `- Алдсан сэдвүүд: ${wrong}` : "- Бүх асуултад зөв хариулсан"}

Энэ сурагчид зөвлөмж бич.`;

    const chat = process.env.AI_PROVIDER === "deepseek" ? deepseekChat : claudeChat;
    const result = await chat({ system, messages: [{ role: "user", content: user }], tier: "smart" });
    const text = result.text.trim();
    if (text) return text;
  } catch (err) {
    console.error("[quiz] AI recommendation failed, using fallback:", err);
  }
  return fallbackRecommendation(input);
}

/** "геометр (2), бодлого (1)" — repeated topics collapse into counts. */
function summariseTopics(topics: string[]): string {
  const counts = new Map<string, number>();
  for (const t of topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => (n > 1 ? `${t} (${n} асуулт)` : t))
    .join(", ");
}

/**
 * Score-banded plain text for when the model is unreachable. Deliberately
 * generic — it names no course, only the catalogue page — so it can never
 * contradict whatever the catalogue holds that day.
 */
function fallbackRecommendation(input: { score: number; total: number; wrongTopics: string[] }): string {
  const ratio = input.total > 0 ? input.score / input.total : 0;
  const topics = summariseTopics(input.wrongTopics);
  const repeat = topics ? ` Дараах сэдвүүдийг давтахыг зөвлөж байна: ${topics}.` : "";

  if (ratio >= 0.8) {
    return `Маш сайн! ${input.total} асуултаас ${input.score}-д нь зөв хариулсан нь суурь мэдлэг сайтайг харуулж байна.${repeat} Дараагийн шатны сургалтыг ${SITE_URL}/courses хуудаснаас сонгоорой — түвшиндээ тохирсон ангид суувал ахиц хамгийн хурдан гарна.`;
  }
  if (ratio >= 0.5) {
    return `Сайн байна. ${input.total} асуултаас ${input.score}-д нь зөв хариулсан нь суурь ойлголт байгааг харуулж байна.${repeat} Тогтмол дасгал хийвэл богино хугацаанд мэдэгдэхүйц ахина. Танд тохирох сургалтуудыг ${SITE_URL}/courses хуудаснаас үзээрэй.`;
  }
  return `Эхлэл болгоход зүгээр. ${input.total} асуултаас ${input.score}-д нь зөв хариулсан байна — суурь ойлголтоо бататгахаас эхэлье.${repeat} Багшийн системтэй хөтөлбөрөөр суурийг тавьбал итгэлтэй урагшилна: ${SITE_URL}/courses.`;
}
