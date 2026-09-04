/**
 * Сэдэв бүрийн ойлголтын radar диаграм. Гадны сангүй — цэвэр SVG, сайтын
 * өнгөний токеноор буддаг тул хар/цайвар горимд хоёуланд нь уншигдана.
 *
 * Тэнхлэг бүр нэг сэдэв, утга нь 0-3: 0 нь хөнгөн бодлогыг ч чадаагүй,
 * 3 нь гүнзгийг чадсан.
 */
const MAX_SCORE = 3;
const SIZE = 340;
const CENTER = SIZE / 2;
const RADIUS = 108;
/** Шошго бичих зай — тойргоос гадагш. */
const LABEL_RADIUS = RADIUS + 26;

export default function PlacementRadar({
  topics,
}: {
  topics: { topic: string; score: number }[];
}) {
  if (topics.length < 3) return null; // гурваас цөөн тэнхлэгтэй radar уншигдахгүй

  const angle = (index: number) => (Math.PI * 2 * index) / topics.length - Math.PI / 2;
  const point = (index: number, value: number): [number, number] => [
    CENTER + Math.cos(angle(index)) * RADIUS * (value / MAX_SCORE),
    CENTER + Math.sin(angle(index)) * RADIUS * (value / MAX_SCORE),
  ];

  const ring = (value: number) =>
    topics.map((_, i) => point(i, value).join(",")).join(" ");
  const shape = topics.map((t, i) => point(i, Math.max(0, Math.min(MAX_SCORE, t.score))).join(",")).join(" ");

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={`Сэдэв бүрийн түвшин: ${topics.map((t) => `${t.topic} ${t.score}/3`).join(", ")}`}
      className="w-full max-w-[420px] mx-auto"
    >
      {/* Жишиг цагирагууд: 1, 2, 3 түвшин. */}
      {[1, 2, 3].map((value) => (
        <polygon
          key={value}
          points={ring(value)}
          fill="none"
          stroke="var(--color-line-2)"
          strokeWidth={value === MAX_SCORE ? 1.5 : 1}
        />
      ))}
      {/* Тэнхлэгүүд. */}
      {topics.map((_, i) => {
        const [x, y] = point(i, MAX_SCORE);
        return (
          <line
            key={i}
            x1={CENTER}
            y1={CENTER}
            x2={x}
            y2={y}
            stroke="var(--color-line)"
            strokeWidth={1}
          />
        );
      })}
      {/* Сурагчийн дүрс. */}
      <polygon
        points={shape}
        fill="var(--color-blue)"
        fillOpacity={0.18}
        stroke="var(--color-blue-strong)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {topics.map((t, i) => {
        const [x, y] = point(i, Math.max(0, Math.min(MAX_SCORE, t.score)));
        return <circle key={i} cx={x} cy={y} r={3.5} fill="var(--color-blue-strong)" />;
      })}
      {/* Сэдвийн шошго: байрлалаасаа хамаарч зүүн/баруун тийш зэрэгцэнэ. */}
      {topics.map((t, i) => {
        const a = angle(i);
        const x = CENTER + Math.cos(a) * LABEL_RADIUS;
        const y = CENTER + Math.sin(a) * LABEL_RADIUS;
        const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="fill-[var(--color-ink-2)]"
            style={{ fontSize: 11, fontWeight: 700 }}
          >
            {t.topic.length > 18 ? `${t.topic.slice(0, 17)}…` : t.topic}
          </text>
        );
      })}
    </svg>
  );
}
