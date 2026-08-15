import { IconCheckCircle, IconClock, IconPerson, IconTarget } from "@/components/icons";
import { TRACK_LABELS } from "@/lib/assessment/types";

/**
 * What a parent sees before anything asks them to sign in or pay.
 *
 * The page used to render a bare "Эхлээд нэвтэрнэ үү" card, so a visitor who
 * clicked "Түвшин тогтоох" from the homepage learned nothing about the price,
 * the length, or what they'd get back — and left. This is the answer to those
 * three questions, rendered on the server so it costs nothing and is indexable.
 *
 * Server component on purpose: prices and the turnaround promise come from the
 * database, and none of it needs interactivity.
 */
export default function AssessmentIntro({
  quizFee,
  olympiadFee,
  sla,
}: {
  quizFee: string;
  olympiadFee: string;
  sla: string;
}) {
  const tracks = [
    {
      title: TRACK_LABELS.regular,
      fee: quizFee,
      minutes: "≈10 минут",
      result: "Оноо, алдсан сэдэв, хиймэл оюуны зөвлөмж — тест дуусмагц шууд",
      forWhom: "Ангийн хөтөлбөрөө хэр эзэмшсэнийг мэдэхийг хүсвэл",
    },
    {
      title: TRACK_LABELS.advanced,
      fee: quizFee,
      minutes: "≈15 минут",
      result: "Оноо, алдсан сэдэв, хиймэл оюуны зөвлөмж — тест дуусмагц шууд",
      forWhom: "Сонгоны ангид сурдаг, эсвэл хөтөлбөрөөс дээгүүр хүүхдэд",
    },
    {
      title: TRACK_LABELS.olympiad,
      fee: olympiadFee,
      minutes: "≈30-40 минут",
      result: `1-10 хүртэлх түвшин, багшийн бичсэн дүгнэлт, тохирох сургалт — ${sla}ийн дотор`,
      forWhom: "Олимпиадад бэлдэх, эсвэл аль хэдийн оролцож байсан хүүхдэд",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="card-flat px-[26px] py-[26px]">
        <h2 className="text-[1.3rem] font-extrabold">Түвшин тогтоох гэж юу вэ?</h2>
        <p className="text-ink-2 font-medium mt-2.5 leading-[1.75]">
          Хүүхэд яг одоо хаана байгааг тодруулж, дараа нь юуг давтах, аль сургалт тохирохыг
          тодорхой болгодог. Зорилго нь дүн тавих биш — <b>хаанаас эхлэхийг</b> зөв олох.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          {[
            { icon: IconTarget, title: "Түвшин", text: "Хэт хөнгөн ч, хэт хүнд ч биш ангид суух" },
            { icon: IconCheckCircle, title: "Сул тал", text: "Аль сэдвийг давтах нь тодорхой болно" },
            { icon: IconPerson, title: "Зөвлөмж", text: "Дараагийн 2-3 алхмыг бичгээр авна" },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="bg-bg-soft rounded-md px-4 py-4">
              <span className="w-9 h-9 rounded-[12px] bg-blue-soft text-blue-strong grid place-items-center">
                <Icon className="w-[18px] h-[18px]" />
              </span>
              <b className="block font-extrabold text-[.95rem] mt-2.5">{title}</b>
              <span className="text-ink-2 font-medium text-[.85rem] leading-[1.5]">{text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card-flat px-[26px] py-[26px]">
        <h2 className="text-[1.15rem] font-extrabold">Гурван төрөл</h2>
        <p className="text-ink-3 font-semibold text-[.88rem] mt-1">
          Эргэлзвэл Энгийнээс эхлэхэд болно — үр дүн дээр тохирохыг зөвлөнө.
        </p>
        <div className="flex flex-col gap-3 mt-4">
          {tracks.map((t) => (
            <div key={t.title} className="border-[1.5px] border-line-2 rounded-md px-4 py-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <b className="font-extrabold text-[1.02rem]">{t.title}</b>
                <span className="font-extrabold text-navy">{t.fee || "—"}</span>
              </div>
              <p className="text-ink-2 font-medium text-[.88rem] mt-1.5">{t.forWhom}</p>
              <div className="flex items-center gap-2 mt-2.5 text-[.83rem] font-semibold text-ink-3">
                <IconClock className="w-3.5 h-3.5 shrink-0" />
                {t.minutes}
              </div>
              <p className="text-[.85rem] font-semibold text-ink-2 mt-1.5">
                <span className="text-ink-3">Гарах үр дүн: </span>
                {t.result}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="card-flat px-[26px] py-[26px]">
        <h2 className="text-[1.15rem] font-extrabold mb-3.5">Хэрхэн явагдах вэ</h2>
        <ol className="flex flex-col gap-3">
          {[
            "Төрөл сонгож, төлбөрөө QPay-ээр төлнө",
            "Тест бөглөнө — хүүхэд өөрөө, эсвэл хамт бөглөж болно",
            "Үр дүн профайлд хадгалагдана. Дараа хэдийд ч дахин харна",
          ].map((text, i) => (
            <li key={text} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-soft text-blue-strong font-extrabold text-[.8rem] grid place-items-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="text-[.95rem] text-ink-2 font-medium">{text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
