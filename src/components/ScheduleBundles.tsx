import type { ScheduleBundle } from "@/lib/weeklySchedule";

/**
 * Сонгоны бүх ангид сонгож болох хуваарийн багцууд.
 *
 * Анги бүр өөрийн хуваарийг харуулдаг байсныг сольсон: цагийг уулзалтаар
 * тохирдог болсон тул хуудас бүр ижил бүтэн жагсаалтыг үзүүлнэ. Аль багц
 * аль ангид ногдохыг энд хэлдэггүй — тэр шийдвэр шалгалтын дараа гардаг.
 */
export default function ScheduleBundles({ bundles }: { bundles: ScheduleBundle[] }) {
  if (bundles.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 nav:grid-cols-4 gap-4">
      {bundles.map((bundle) => (
        <div key={bundle.number} className="bg-surface border border-line rounded-md px-4 py-3.5">
          <b className="block text-[.78rem] font-extrabold tracking-[.08em] uppercase text-blue-strong mb-2">
            {`Хуваарь №${bundle.number}`}
          </b>
          <ul className="flex flex-col">
            {bundle.slots.map((slot, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 text-[.85rem] border-b border-line last:border-0 py-1.5"
              >
                <span className="font-bold text-ink-2">{slot.day}</span>
                <span className="font-extrabold text-ink tabular-nums">{slot.time}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
