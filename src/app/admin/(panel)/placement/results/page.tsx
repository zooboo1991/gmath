import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminSection } from "@/lib/adminAccess";
import { listPlacementSittings } from "@/lib/assessment/placementDb";
import { PLACEMENT_LEVEL_LABELS } from "@/lib/assessment/placement";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Өгсөн шалгалтууд — Админ" };

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  awaiting_payment: { text: "Төлбөр хүлээгдэж", cls: "bg-gold-soft text-gold-strong" },
  paid: { text: "Явагдаж байна", cls: "bg-blue-soft text-blue-strong" },
  completed: { text: "Дууссан", cls: "bg-green-soft/20 text-green" },
};

/**
 * Шаталсан шалгалт өгсөн сурагчдын жагсаалт — шинэ нь эхэндээ.
 * Мөр бүр дэлгэрэнгүй рүү хөтөлнө: сэдэв бүрийн оноо, хариулт, AI дүгнэлт.
 */
export default async function PlacementResultsPage() {
  await requireAdminSection("placement");
  const sittings = await listPlacementSittings().catch(() => []);

  return (
    <div className="px-6 lg:px-10 py-8">
      <Link
        href="/admin/placement"
        className="text-ink-3 font-bold text-[.85rem] hover:text-ink"
      >
        ← Шаталсан шалгалтын сан
      </Link>
      <h1 className="text-[1.5rem] font-extrabold mt-3 mb-5">{`Өгсөн шалгалтууд (${sittings.length})`}</h1>

      {sittings.length === 0 ? (
        <p className="text-ink-3 font-semibold">Одоогоор хэн ч шалгалт өгөөгүй байна.</p>
      ) : (
        <div className="card-flat divide-y divide-line max-w-[880px]">
          {sittings.map((s) => {
            const status = STATUS_LABEL[s.status] ?? { text: s.status, cls: "bg-bg-soft text-ink-3" };
            const level =
              s.estimatedLevel && s.estimatedLevel >= 1 && s.estimatedLevel <= 3
                ? PLACEMENT_LEVEL_LABELS[s.estimatedLevel as 1 | 2 | 3]
                : null;
            return (
              <Link
                key={s.id}
                href={`/admin/placement/results/${s.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-bg-soft transition-colors flex-wrap"
              >
                <span className="text-[.8rem] font-bold text-ink-3 tabular-nums w-[86px] shrink-0">
                  {new Date(s.createdAt).toLocaleDateString("mn-MN")}
                </span>
                <span className="flex-1 min-w-[160px]">
                  <b className="font-extrabold text-[.92rem] block">
                    {[s.user?.lastName, s.user?.firstName].filter(Boolean).join(" ") || "Нэр тодорхойгүй"}
                  </b>
                  <span className="text-[.8rem] font-semibold text-ink-3">
                    {s.user?.phone ?? "—"}
                  </span>
                </span>
                <span className="text-[.85rem] font-bold text-ink-2 w-[72px] shrink-0">
                  {s.quizGrade ? `${s.quizGrade}-р анги` : "—"}
                </span>
                {level && <b className="text-[.85rem] font-extrabold text-blue-strong">{level}</b>}
                <span className={`text-[.76rem] font-extrabold px-2.5 py-1 rounded-full shrink-0 ${status.cls}`}>
                  {status.text}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
