import { describe, expect, it } from "vitest";
import { summariseAttendance, type AttendanceLesson } from "@/lib/courseAttendance";

// Хичээлүүд Монголын цагаар бичигдэнэ (UTC+8). 18:00–20:00 гэдэг нь
// UTC-ээр 10:00–12:00.
const lesson = (topic: string, date: string, extra: Partial<AttendanceLesson> = {}): AttendanceLesson => ({
  topic,
  schedule: `${date.replaceAll("-", ".")} Даваа гараг · 18:00–20:00`,
  ...extra,
});

const AFTER = new Date("2026-08-30T00:00:00Z");

function summarise(over: Partial<Parameters<typeof summariseAttendance>[0]> = {}) {
  return summariseAttendance({
    lessons: [lesson("Тоон онол", "2026-08-24")],
    spansByLessonIndex: {},
    trackedLessonIndexes: new Set([0]),
    rollCallByLessonIndex: {},
    watchedLessonIndexes: new Set(),
    now: AFTER,
    ...over,
  });
}

describe("онлайн хичээлийн ирц", () => {
  it("хичээлийн талаас илүүг сууссан бол ирсэнд тооцно", () => {
    const { lessons, present, rate } = summarise({
      // 10:00–11:30 UTC = хоёр цагийн хичээлийн 75%.
      spansByLessonIndex: { 0: [{ joinedAt: "2026-08-24T10:00:00Z", leftAt: "2026-08-24T11:30:00Z" }] },
    });
    expect(lessons[0].outcome).toBe("present");
    expect(lessons[0].percent).toBe(75);
    expect(lessons[0].minutes).toBe(90);
    expect(present).toBe(1);
    expect(rate).toBe(100);
  });

  it("талаас бага сууссан бол дутуу суусан", () => {
    const { lessons, partial } = summarise({
      spansByLessonIndex: { 0: [{ joinedAt: "2026-08-24T10:00:00Z", leftAt: "2026-08-24T10:30:00Z" }] },
    });
    expect(lessons[0].outcome).toBe("partial");
    expect(lessons[0].percent).toBe(25);
    expect(partial).toBe(1);
  });

  it("тасархай орсон хугацааг нэмж тооцно", () => {
    const { lessons } = summarise({
      spansByLessonIndex: {
        0: [
          { joinedAt: "2026-08-24T10:00:00Z", leftAt: "2026-08-24T10:40:00Z" },
          { joinedAt: "2026-08-24T11:00:00Z", leftAt: "2026-08-24T11:20:00Z" },
        ],
      },
    });
    expect(lessons[0].minutes).toBe(60);
    expect(lessons[0].outcome).toBe("present");
  });

  it("хичээл эхлэхээс өмнө орж, дууссаны дараа гарсныг 100%-иар таслана", () => {
    const { lessons } = summarise({
      spansByLessonIndex: { 0: [{ joinedAt: "2026-08-24T09:00:00Z", leftAt: "2026-08-24T13:00:00Z" }] },
    });
    expect(lessons[0].percent).toBe(100);
    expect(lessons[0].minutes).toBe(120);
  });

  it("огт ороогүй бол тасалсан", () => {
    const { lessons, absent, rate } = summarise();
    expect(lessons[0].outcome).toBe("absent");
    expect(absent).toBe(1);
    expect(rate).toBe(0);
  });

  it("гарсан цаг нь дутуу бол хичээл дуустал сууссанд тооцно", () => {
    // Zoom-ийн "гарлаа" дохио алдагдах нь бий. Хүүхдийг үүнээс болж
    // таслагч болгох нь буруу.
    const { lessons } = summarise({
      spansByLessonIndex: { 0: [{ joinedAt: "2026-08-24T10:15:00Z" }] },
    });
    expect(lessons[0].outcome).toBe("present");
    expect(lessons[0].minutes).toBe(105);
  });

  it("Zoom-оор хянагдаагүй хичээлийг тасалсан гэж хэлэхгүй", () => {
    const { lessons, absent, unmarked } = summarise({ trackedLessonIndexes: new Set() });
    expect(lessons[0].outcome).toBe("unmarked");
    expect(absent).toBe(0);
    expect(unmarked).toBe(1);
  });
});

describe("танхимын хичээлийн ирц", () => {
  const inPerson = [lesson("Геометр", "2026-08-24", { mode: "inperson" })];

  it("багшийн тэмдэглэснийг дагана", () => {
    expect(summarise({ lessons: inPerson, rollCallByLessonIndex: { 0: true } }).lessons[0].outcome).toBe("present");
    expect(summarise({ lessons: inPerson, rollCallByLessonIndex: { 0: false } }).lessons[0].outcome).toBe("absent");
  });

  it("багш бүртгэл аваагүй бол мэдэгдэхгүй хэвээр үлдэнэ", () => {
    const { lessons, unmarked } = summarise({ lessons: inPerson });
    expect(lessons[0].outcome).toBe("unmarked");
    expect(unmarked).toBe(1);
  });

  it("Zoom-ийн бичлэг байсан ч багшийн тэмдэглэгээг дийлэхгүй", () => {
    // Танхимын хичээлийн үеэр Zoom өрөө нээлттэй байсан ч ирцийг багш
    // тогтооно — тэр танхимд хэн байсныг л мэднэ.
    const { lessons } = summarise({
      lessons: inPerson,
      rollCallByLessonIndex: { 0: false },
      spansByLessonIndex: { 0: [{ joinedAt: "2026-08-24T10:00:00Z", leftAt: "2026-08-24T12:00:00Z" }] },
    });
    expect(lessons[0].outcome).toBe("absent");
  });
});

describe("бичлэг ба болоогүй хичээл", () => {
  it("бичлэгээр нөхөж үзсэнийг тасалсан хичээл дээр ч тэмдэглэнэ", () => {
    const { lessons } = summarise({ watchedLessonIndexes: new Set([0]) });
    expect(lessons[0].outcome).toBe("absent");
    expect(lessons[0].watchedRecording).toBe(true);
  });

  it("болоогүй хичээлийг дүгнэхгүй", () => {
    const { lessons, upcoming, rate } = summarise({
      lessons: [lesson("Ирээдүйн хичээл", "2026-12-24")],
    });
    expect(lessons[0].outcome).toBe("upcoming");
    expect(upcoming).toBe(1);
    expect(rate).toBeNull();
  });

  it("хуваарьгүй хичээлээс ирц тооцохгүй", () => {
    const { lessons } = summarise({ lessons: [{ topic: "Огноогүй" }] });
    expect(lessons[0].outcome).toBe("unmarked");
    expect(lessons[0].dateLabel).toBe("");
  });

  it("ирцийн хувийг зөвхөн дүгнэгдсэн хичээлээс тооцно", () => {
    const { rate, unmarked } = summarise({
      lessons: [lesson("Нэг", "2026-08-24"), lesson("Хоёр", "2026-08-25"), lesson("Гурав", "2026-08-26")],
      trackedLessonIndexes: new Set([0, 1]),
      spansByLessonIndex: {
        0: [{ joinedAt: "2026-08-24T10:00:00Z", leftAt: "2026-08-24T12:00:00Z" }],
      },
    });
    // Хоёр хичээл дүгнэгдэж, нэг нь ирсэн → 50%. Гурав дахь нь хянагдаагүй.
    expect(rate).toBe(50);
    expect(unmarked).toBe(1);
  });
});
