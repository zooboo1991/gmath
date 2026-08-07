/** Small presentational pieces shared by CourseObjectPage and YearlyProgramObjectPage — same 4-tab layout for both. */

export function AnchorTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 font-extrabold text-[.86rem] px-4 py-3 border-b-[2.5px] transition-colors ${
        active ? "border-blue text-blue-strong" : "border-transparent text-ink-3 hover:text-ink-2"
      }`}
    >
      {label}
    </button>
  );
}

export function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card-flat px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-extrabold text-[1rem] text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function KpiTile({ label, value, tone }: { label: string; value: string; tone?: "green" | "gold" | "blue" }) {
  const toneClass =
    tone === "green"
      ? "text-green"
      : tone === "gold"
      ? "text-gold-strong"
      : tone === "blue"
      ? "text-blue-strong"
      : "text-ink";
  return (
    <div className="card-flat px-4 py-4">
      <b className={`text-[1.55rem] font-extrabold block leading-none ${toneClass}`}>{value}</b>
      <span className="text-ink-3 font-bold text-[.8rem] mt-1.5 block">{label}</span>
    </div>
  );
}
