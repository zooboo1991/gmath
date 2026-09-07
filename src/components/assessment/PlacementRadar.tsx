/**
 * Сэдэв бүрийн ойлголтын radar диаграм. Гадны сангүй — цэвэр SVG, сайтын
 * өнгөний токеноор буддаг тул хар/цайвар горимд хоёуланд нь уншигдана.
 *
 * Тэнхлэг бүр нэг сэдэв, утга нь 0-3: 0 нь хөнгөн бодлогыг ч чадаагүй,
 * 3 нь гүнзгийг чадсан.
 *
 * viewBox нь дөрвөлжин биш: шошго тойргоос гадагш бичигддэг тул хэвтээ
 * тэнхлэгт нэмэлт зай хэрэгтэй. Дөрвөлжин байхад "Зэрэг, язгуур" мэт
 * шошго ирмэгээр тасарч байсан.
 */
const MAX_SCORE = 3;
const WIDTH = 540;
const HEIGHT = 380;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const RADIUS = 108;
/** Шошго бичих зай — тойргоос гадагш. */
const LABEL_RADIUS = RADIUS + 20;
const LINE_HEIGHT = 13;

/**
 * Урт шошгыг хоёр мөр болгоно.
 *
 * Хэвтээ зайг хамгийн их иддэг нь "Илэрхийлэл хялбарчлах" мэт хос үгтэй
 * нэрс — тэдгээрийг таслал эсвэл зайгаар нь тэнцүү ойролцоо хуваана.
 */
function wrapLabel(label: string): string[] {
  if (label.length <= 12) return [label];
  const middle = Math.floor(label.length / 2);
  // Дундажид хамгийн ойр зай/таслалыг олно.
  let best = -1;
  for (let i = 0; i < label.length; i += 1) {
    if (label[i] !== " ") continue;
    if (best === -1 || Math.abs(i - middle) < Math.abs(best - middle)) best = i;
  }
  if (best === -1) return [label];
  return [label.slice(0, best).trim(), label.slice(best + 1).trim()];
}

export default function PlacementRadar({
  topics,
}: {
  topics: { topic: string; score: number }[];
}) {
  if (topics.length < 3) return null; // гурваас цөөн тэнхлэгтэй radar уншигдахгүй

  const angle = (index: number) => (Math.PI * 2 * index) / topics.length - Math.PI / 2;
  const point = (index: number, value: number): [number, number] => [
    CENTER_X + Math.cos(angle(index)) * RADIUS * (value / MAX_SCORE),
    CENTER_Y + Math.sin(angle(index)) * RADIUS * (value / MAX_SCORE),
  ];

  const ring = (value: number) => topics.map((_, i) => point(i, value).join(",")).join(" ");
  const shape = topics
    .map((t, i) => point(i, Math.max(0, Math.min(MAX_SCORE, t.score))).join(","))
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Сэдэв бүрийн түвшин: ${topics.map((t) => `${t.topic} ${t.score}/3`).join(", ")}`}
      className="w-full max-w-[520px] mx-auto"
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
            x1={CENTER_X}
            y1={CENTER_Y}
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
        const x = CENTER_X + Math.cos(a) * LABEL_RADIUS;
        const y = CENTER_Y + Math.sin(a) * LABEL_RADIUS;
        const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
        const lines = wrapLabel(t.topic);
        // Хоёр мөртэй шошгыг цэгийнхээ эргэн тойронд төвлөрүүлнэ.
        const firstY = y - ((lines.length - 1) * LINE_HEIGHT) / 2;
        return (
          <text
            key={i}
            textAnchor={anchor}
            className="fill-[var(--color-ink-2)]"
            style={{ fontSize: 11, fontWeight: 700 }}
          >
            {lines.map((line, index) => (
              <tspan key={index} x={x} y={firstY + index * LINE_HEIGHT} dominantBaseline="middle">
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}
