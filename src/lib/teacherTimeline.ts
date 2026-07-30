export type TimelineCategory = "own" | "student" | "career" | "book";
export type TimelineTone = "gold" | "silver" | "bronze" | "blue" | "plain";

export type TimelineItem = {
  title: string;
  note?: string;
  badge: string;
  tone: TimelineTone;
  cat: TimelineCategory;
};

export type TimelineGroup = {
  year: string;
  items: TimelineItem[];
};

export const timelineFilters: { value: "all" | TimelineCategory; label: string }[] = [
  { value: "all", label: "Бүгд" },
  { value: "own", label: "Багшийн амжилт" },
  { value: "student", label: "Шавь нарын амжилт" },
  { value: "career", label: "Боловсрол & ажил" },
  { value: "book", label: "Ном" },
];

export const teacherTimeline: TimelineGroup[] = [
  {
    year: "2024",
    items: [
      {
        title: "Монголын математикийн 60-р олимпиад — Алтан медаль (багш)",
        note: "4 дэх Алтан медалиа хүртэж Монголын математикийн олимпиадын «Дархан аварга» болсон.",
        badge: "Алт",
        tone: "gold",
        cat: "own",
      },
      {
        title: "Сөүлийн Их Сургууль — Докторант, Онолын математик",
        note: "2024 оноос эдүгээ хүртэл.",
        badge: "Боловсрол",
        tone: "blue",
        cat: "career",
      },
    ],
  },
  {
    year: "2023",
    items: [
      {
        title: "Олон улсын багш, дасгалжуулагчдын 5-р олимпиад — Алтан медаль",
        note: "Математик, Физик, Компьютерийн ухааны багш, дасгалжуулагчдын олон улсын олимпиад.",
        badge: "Алт",
        tone: "gold",
        cat: "own",
      },
      {
        title: "Н.Болор (IX анги) — Монголын математикийн 59-р олимпиад",
        badge: "Мөнгө",
        tone: "silver",
        cat: "student",
      },
      {
        title: "Н.Болор (IX анги) — Европын охидын математикийн 12-р олимпиад",
        badge: "Хүрэл",
        tone: "bronze",
        cat: "student",
      },
      {
        title: "«Олимпиадын алгебр» ном хэвлүүлсэн",
        badge: "Ном",
        tone: "plain",
        cat: "book",
      },
    ],
  },
  {
    year: "2022",
    items: [
      {
        title: "Монголын математикийн 58-р олимпиад — Алтан медаль (багш)",
        badge: "Алт",
        tone: "gold",
        cat: "own",
      },
      {
        title: "«Олимпиадын комбинаторик» ном хэвлүүлсэн",
        badge: "Ном",
        tone: "plain",
        cat: "book",
      },
    ],
  },
  {
    year: "2019 – 2021",
    items: [
      {
        title: "МУИС — Магистр, Онолын математик",
        badge: "Боловсрол",
        tone: "blue",
        cat: "career",
      },
      {
        title: "Монголын математикийн 55-р олимпиад — Алтан медаль (багш)",
        note: "2019 он.",
        badge: "Алт",
        tone: "gold",
        cat: "own",
      },
    ],
  },
  {
    year: "2018",
    items: [
      {
        title: "Монголын математикийн 54-р олимпиад — Алтан медаль (багш)",
        badge: "Алт",
        tone: "gold",
        cat: "own",
      },
      {
        title: "Эрдмийн хишиг сургууль — Математикийн багш",
        note: "2018 оноос эдүгээ хүртэл.",
        badge: "Ажил",
        tone: "blue",
        cat: "career",
      },
    ],
  },
  {
    year: "2017",
    items: [
      {
        title: "Монголын математикийн 53-р олимпиад — Мөнгөн медаль (багш)",
        badge: "Мөнгө",
        tone: "silver",
        cat: "own",
      },
      {
        title: "Х.Санжаахүү (XI анги) — Монголын математикийн 53-р олимпиад",
        badge: "Алт",
        tone: "gold",
        cat: "student",
      },
      {
        title: "С.Арманбек (X), Б.Алтангэрэл (XII), С.Цэнд-Аюуш (XII) — МО 53-р олимпиад",
        badge: "3× Мөнгө",
        tone: "silver",
        cat: "student",
      },
      {
        title: "С.Цэнд-Аюуш — Олон улсын математикийн 58-р олимпиад",
        badge: "Мөнгө",
        tone: "silver",
        cat: "student",
      },
      {
        title: "Б.Алтангэрэл — Олон улсын математикийн 58-р олимпиад",
        badge: "Хүрэл",
        tone: "bronze",
        cat: "student",
      },
      {
        title: "С.Цэнд-Аюуш — Жаутыковын нэрэмжит ОУ-ын 13-р олимпиад",
        badge: "Хүрэл",
        tone: "bronze",
        cat: "student",
      },
      {
        title: "Сант, Логарифм сургууль — Математикийн багш",
        note: "2017 – 2018 он.",
        badge: "Ажил",
        tone: "blue",
        cat: "career",
      },
    ],
  },
  {
    year: "2016",
    items: [
      {
        title: "Монголын математикийн 52-р олимпиад — Мөнгөн медаль (багш)",
        badge: "Мөнгө",
        tone: "silver",
        cat: "own",
      },
      {
        title: "Б.Алтангэрэл — Монголын математикийн 52-р олимпиад",
        badge: "Хүрэл",
        tone: "bronze",
        cat: "student",
      },
      {
        title: "С.Цэнд-Аюуш — Олон улсын математикийн 57-р олимпиад",
        badge: "Хүрэл",
        tone: "bronze",
        cat: "student",
      },
      {
        title: "«Problems for journals» ном хэвлүүлсэн",
        badge: "Ном",
        tone: "plain",
        cat: "book",
      },
    ],
  },
  {
    year: "2015",
    items: [
      {
        title: "«Бодох урлагийн шилмэл 100 асуудал», «Календарь — өдөр бүр 1 бодлого»",
        badge: "2 ном",
        tone: "plain",
        cat: "book",
      },
      {
        title: "УБ-Эмпати сургууль — Математикийн багш",
        note: "2015 – 2017 он.",
        badge: "Ажил",
        tone: "blue",
        cat: "career",
      },
    ],
  },
  {
    year: "2014",
    items: [
      {
        title: "Монголын математикийн 50-р олимпиад — Хүрэл медаль (багш)",
        note: "Багшийн ажлын анхны олимпиадын медаль.",
        badge: "Хүрэл",
        tone: "bronze",
        cat: "own",
      },
      {
        title: "«Монголын математикийн 50-р олимпиад» ном (Монгол, Англи хувилбар)",
        badge: "Ном",
        tone: "plain",
        cat: "book",
      },
      {
        title: "Нийслэлийн математикийн олимпиад — 5 алт, 1 мөнгө, 1 хүрэл",
        note: "2014 – 2024 оны хугацаанд.",
        badge: "7 медаль",
        tone: "gold",
        cat: "own",
      },
    ],
  },
  {
    year: "2013",
    items: [
      {
        title: "МУИС — Бакалавр, Онолын математик төгссөн",
        note: "2009 – 2013 он.",
        badge: "Боловсрол",
        tone: "blue",
        cat: "career",
      },
      {
        title: "Олонлог төв сургууль — Математикийн багш",
        note: "2013 – 2015 он. Багшлах ажлын гараа.",
        badge: "Ажил",
        tone: "blue",
        cat: "career",
      },
    ],
  },
  {
    year: "2010 – 2012 Оюутан",
    items: [
      {
        title: "Монгол оюутны математикийн олимпиад — 1 алт, 2 мөнгөн медаль",
        badge: "3 медаль",
        tone: "gold",
        cat: "own",
      },
      {
        title: "Олон улсын математикийн 17, 18, 19-р олимпиад — 3 жил дарааллан III байр",
        badge: "3 медаль",
        tone: "silver",
        cat: "own",
      },
    ],
  },
  {
    year: "2009 Сурагч",
    items: [
      {
        title: "Монголын математикийн 45-р олимпиад — Мөнгөн медаль",
        note: "Багшийн олимпиадын замналын эхлэл.",
        badge: "Сурагч, XI анги",
        tone: "silver",
        cat: "own",
      },
    ],
  },
];

export const teacherBooks: { year: string; title: string; subtitle?: string }[] = [
  { year: "2023", title: "Олимпиадын алгебр" },
  { year: "2022", title: "Олимпиадын комбинаторик" },
  { year: "2016", title: "Problems for journals" },
  { year: "2015", title: "Календарь — өдөр бүр 1 бодлого" },
  { year: "2015", title: "Бодох урлагийн шилмэл 100 асуудал" },
  { year: "2014", title: "Монголын математикийн 50-р олимпиад", subtitle: "Монгол, Англи хувилбар" },
];

export const teacherEducation: { range: string; place: string; role: string }[] = [
  { range: "2024 — эдүгээ", place: "Сөүлийн Их Сургууль", role: "Докторант, Онолын математик" },
  { range: "2019 — 2021", place: "Монгол Улсын Их Сургууль", role: "Магистр, Онолын математик" },
  { range: "2009 — 2013", place: "Монгол Улсын Их Сургууль", role: "Бакалавр, Онолын математик" },
];

export const teacherExperience: { range: string; place: string; role: string }[] = [
  { range: "2024 — эдүгээ", place: "Өөрийн сургалтын төв", role: "Удирдагч, олимпиадын бэлтгэлийн сургалт" },
  { range: "2018 — 2024", place: "Эрдмийн хишиг сургууль", role: "Математикийн багш" },
  { range: "2017 — 2018", place: "Сант, Логарифм сургууль", role: "Математикийн багш" },
  { range: "2015 — 2017", place: "УБ-Эмпати сургууль", role: "Математикийн багш" },
  { range: "2013 — 2015", place: "Олонлог төв сургууль", role: "Математикийн багш" },
];
