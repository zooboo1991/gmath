import { NextResponse } from "next/server";
import { REFUSED, requireCapability } from "@/lib/adminAccess";
import { writePlacementRecommendation } from "@/lib/assessment/placementRecommendation";
import { overallLevel, PLACEMENT_LEVEL_LABELS } from "@/lib/assessment/placement";

/**
 * Туршилтын AI дүгнэлт — админ, багшид.
 *
 * Сурагчийн бодит шалгалтын дараах дүгнэлттэй яг нэг үүсгэгчийг дуудна:
 * ижил промпт, ижил каталог, ижил fallback. Ингэж байж багш сурагчид юу
 * очихыг бодитоор нь урьдчилж харна. Юг ч хадгалахгүй — зөвхөн текст буцаана.
 */
export async function POST(request: Request) {
  if (!(await requireCapability("placementBank")).ok) {
    return NextResponse.json(REFUSED, { status: 401 });
  }

  const data = await request.json().catch(() => ({}));
  const grade = Number(data.grade);
  if (!Number.isInteger(grade) || grade < 4 || grade > 12) {
    return NextResponse.json({ ok: false, error: "Анги буруу байна" }, { status: 400 });
  }
  const topics = Array.isArray(data.topics)
    ? data.topics
        .slice(0, 30)
        .map((raw: unknown) => {
          const t = (raw ?? {}) as Record<string, unknown>;
          const topic = typeof t.topic === "string" ? t.topic.trim().slice(0, 100) : "";
          const score = Number(t.score);
          return { topic, score };
        })
        .filter((t: { topic: string; score: number }) =>
          t.topic !== "" && Number.isInteger(t.score) && t.score >= 0 && t.score <= 3
        )
    : [];
  if (topics.length === 0) {
    return NextResponse.json({ ok: false, error: "Сэдвийн оноо дутуу байна" }, { status: 400 });
  }

  // Түвшинг клиентээс авахгүй — оноонуудаас нь сурагчийн урсгалын ижил
  // дүрмээр бодно, тэгж байж дүгнэлт нь бодит шалгалттай зөрөхгүй.
  const level = overallLevel(topics.map((t: { score: number }) => t.score));
  const recommendation = await writePlacementRecommendation({
    grade,
    result: {
      level,
      levelLabel: PLACEMENT_LEVEL_LABELS[level],
      // topicOrder дүгнэлтийн промптод ордоггүй ч төрлийн бүрэн бүтэн байдалд хэрэгтэй.
      topics: topics.map((t: { topic: string; score: number }, i: number) => ({ topicOrder: i + 1, ...t })),
      answered: topics.length * 2,
      total: topics.length * 2,
    },
  });
  return NextResponse.json({ ok: true, recommendation });
}
