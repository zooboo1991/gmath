import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSection } from "@/lib/adminAccess";
import { findAssessment } from "@/lib/assessment/db";
import { findUserById } from "@/lib/db";
import {
  listPlacementProblemsByIds,
  listPlacementSteps,
  type PlacementProblem,
} from "@/lib/assessment/placementDb";
import { overallLevel, topicScore, PLACEMENT_LEVEL_LABELS } from "@/lib/assessment/placement";
import { renderBoxedAnswer } from "@/lib/assessment/answerShape";
import { filledTemplate } from "@/lib/assessment/answerTemplate";
import PlacementRadar from "@/components/assessment/PlacementRadar";
import MathText from "@/components/assessment/MathText";
import { Card } from "@/components/admin/AdminObjectPageParts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Шалгалтын дэлгэрэнгүй — Админ" };

/** Бодлогод тохируулсан зөв хариултыг багшид уншигдах нэг мөр болгоно. */
function expectedAnswer(problem: PlacementProblem): string {
  if (problem.answerType === "template") return filledTemplate(problem.answerTemplate);
  if (problem.answerType !== "text") {
    return renderBoxedAnswer(problem.answerType, problem.answerBoxes.map((b) => b.value));
  }
  return problem.answers.join("; ");
}

export default async function PlacementSittingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminSection("placement");
  const { id } = await params;

  const assessment = await findAssessment(id);
  if (!assessment || assessment.track !== "placement") notFound();

  const [user, steps] = await Promise.all([
    findUserById(assessment.userId),
    listPlacementSteps(id),
  ]);
  const problems = await listPlacementProblemsByIds(steps.map((s) => s.problemId));
  const problemById = new Map(problems.map((p) => [p.id, p]));

  // Сэдэв бүрийн оноо — сурагчийн урсгалын ижил дүрмээр, алхмуудаас нь.
  const orders = [...new Set(steps.map((s) => s.topicOrder))].sort((a, b) => a - b);
  const topics = orders.map((order) => {
    const own = steps.filter((s) => s.topicOrder === order && s.isCorrect !== undefined);
    const name = problemById.get(steps.find((s) => s.topicOrder === order)!.problemId)?.topic ?? `Сэдэв ${order}`;
    return {
      topicOrder: order,
      topic: name,
      score: topicScore({
        topicOrder: order,
        steps: own.map((s) => ({ level: s.level, isCorrect: s.isCorrect === true })),
      }),
    };
  });
  const level =
    assessment.estimatedLevel && assessment.estimatedLevel >= 1 && assessment.estimatedLevel <= 3
      ? (assessment.estimatedLevel as 1 | 2 | 3)
      : overallLevel(topics.map((t) => t.score));
  const answered = steps.filter((s) => s.isCorrect !== undefined);

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[880px]">
      <Link href="/admin/placement/results" className="text-ink-3 font-bold text-[.85rem] hover:text-ink">
        ← Өгсөн шалгалтууд
      </Link>

      <div className="flex items-end justify-between gap-4 flex-wrap mt-3 mb-5">
        <div>
          <h1 className="text-[1.4rem] font-extrabold">
            {[user?.lastName, user?.firstName].filter(Boolean).join(" ") || "Нэр тодорхойгүй"}
          </h1>
          <p className="text-ink-3 font-semibold text-[.88rem] mt-1">
            {[
              user?.phone,
              assessment.quizGrade ? `${assessment.quizGrade}-р анги` : null,
              new Date(assessment.createdAt).toLocaleDateString("mn-MN"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {assessment.status === "completed" && (
          <span className="inline-flex items-center px-4 py-2 rounded-full bg-blue-soft">
            <b className="font-extrabold text-blue-strong">{PLACEMENT_LEVEL_LABELS[level]}</b>
          </span>
        )}
      </div>

      {assessment.status !== "completed" && (
        <p className="bg-gold-soft text-gold-strong font-bold text-[.88rem] rounded-sm px-4 py-3 mb-5">
          Шалгалт дуусаагүй — доорх мэдээлэл одоогийн явц.
        </p>
      )}

      {topics.length >= 3 && (
        <Card title="Сэдэв бүрийн ойлголт">
          <PlacementRadar topics={topics} />
        </Card>
      )}

      <div className="mt-5">
        <Card title={`Хариултууд (${answered.length})`}>
          {answered.length === 0 ? (
            <p className="text-ink-3 font-semibold text-[.9rem]">Хариулт ирээгүй байна.</p>
          ) : (
            <div className="divide-y divide-line">
              {answered.map((step) => {
                const problem = problemById.get(step.problemId);
                return (
                  <div key={step.id} className="py-3">
                    <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                      <span
                        className={`text-[.74rem] font-extrabold px-2 py-0.5 rounded-full ${
                          step.isCorrect ? "bg-green-soft/20 text-green" : "bg-red-soft/12 text-red-soft"
                        }`}
                      >
                        {step.isCorrect ? "Зөв" : "Буруу"}
                      </span>
                      <b className="text-[.82rem] font-extrabold text-ink-2">
                        {problem?.topic ?? `Сэдэв ${step.topicOrder}`} · {step.level}-р түвшин
                      </b>
                    </div>
                    {problem && (
                      <div className="text-[.9rem] leading-[1.65] mb-1.5">
                        <MathText source={problem.bodyLatex} />
                      </div>
                    )}
                    <p className="text-[.85rem] font-semibold text-ink-2">
                      Өгсөн хариулт: <b className="font-extrabold">{step.givenAnswer ?? "—"}</b>
                      {!step.isCorrect && problem && (
                        <span className="text-ink-3">{` · Зөв хариулт: ${expectedAnswer(problem)}`}</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {assessment.aiRecommendation && (
        <div className="mt-5">
          <Card title="AI дүгнэлт">
            <p className="text-ink-2 font-medium leading-[1.75] whitespace-pre-wrap text-[.92rem]">
              {assessment.aiRecommendation}
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
