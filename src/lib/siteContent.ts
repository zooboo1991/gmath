/**
 * Marketing copy that lives on the homepage — the FAQ, the selling points and
 * the headline achievements.
 *
 * Extracted out of the components so the chatbot can answer from it too
 * (src/lib/ai/systemPrompt.ts). Before this, the bot only knew the structured
 * course rows, so a question like "сургалтын онцлог давуу тал юу вэ" got
 * "мэдээлэл байхгүй" even though the answer was sitting on the homepage. One
 * source means editing the page copy updates what the bot says, with no
 * second copy to keep in sync.
 *
 * Icons and styling stay in the components — only the words belong here.
 */

export const siteFaqs = [
  {
    q: "Хичээлийг тасалбал яах вэ?",
    a: "Бүх хичээл бичлэгээр хадгалагддаг тул хүүхэд тасалсан хичээлээ хүссэн үедээ дахин үзэж, гүйцэд нөхөж чадна.",
  },
  {
    q: "Интернэт удаан бол яах вэ?",
    a: "Бичлэгийг чанарын түвшин сонгон үзэх боломжтой бөгөөд тогтвортой холболтгүй бол татаж аваад офлайн үзэх хувилбар бий.",
  },
  {
    q: "Төлбөрөө хэрхэн төлөх вэ?",
    a: "Дансаар шилжүүлэх болон QPay-ээр төлөх боломжтой. Шаардлагатай бол хэсэгчилсэн төлбөрийн уян хатан нөхцөл санал болгоно.",
  },
  {
    q: "Хэрхэн сургалтанд хамрагдах вэ?",
    a: "Манай системд бүртгүүлэн хамрагдах сургалтаа сонгон төлбөрөө төлж бүртгүүлнэ.",
  },
  {
    q: "Zoom хичээлд хэрхэн суух вэ?",
    a: "Бүртгүүлсэн сургалтын мэдээлэл Профайл хэсэгт харагдах ба Хичээлд орох товч дээр дарж хичээлдээ орно. Хичээлийн явцад ойлгоогүй зүйлсээ багшаас асуух боломжтой.",
  },
  {
    q: "Танхимын сургалтанд очих боломжгүй бол яах вэ?",
    a: "Танхимын сургалт бүр бичлэг хийгдэх бөгөөд сургалтын дараа вэбээр бичлэгээ нөхөж үзэх боломжтой.",
  },
];

/** The "Яагаад бид" selling points. Order matches the icon list in WhyUs.tsx. */
export const siteFeatures = [
  {
    title: "Батлагдсан үр дүн",
    text: "600+ сурагч, 200+ багш нар сургалтанд амжилттай хамрагдсан.",
  },
  {
    title: "Шавь нарын амжилт",
    text: "Бэлдсэн шавь нар нь улс болон олон улсын олимпиадаас медаль авсан.",
  },
  {
    title: "Зорилтот агуулга",
    text: "Зөвхөн олимпиадад бэлдэх бодлого, арга барилд төвлөрнө.",
  },
  {
    title: "Хаанаас ч, хэзээ ч",
    text: "Бүх хичээл хадгалагдаж, хүссэн үедээ дахин нөхөж үзэх боломжтой.",
  },
];

/** Б.Ганбат багшийн гол үзүүлэлтүүд. Order matches the icon list in About.tsx. */
export const siteAchievements = [
  { value: "2024", label: "Дархан аварга багш" },
  { value: "4× Алтан медаль", label: "Улсын олимпиад" },
  { value: "10+ жил", label: "Багшлах туршлага" },
  { value: "500+ сурагч", label: "Амжилттай төгссөн" },
];

/**
 * The "Сургалтын тухай" blocks on every course detail page. The lesson-count
 * one is generated per course (see CourseDetail.tsx), so it isn't here — these
 * are the parts that hold for every course, which is exactly what makes them
 * useful to the chatbot when someone asks how the teaching actually works.
 * Order matches the icon list in CourseDetail.tsx.
 */
export const courseAboutItems = [
  {
    title: "Хаанаас ч хамрагдана",
    text: "Улаанбаатар, орон нутаг ялгаагүй интернэттэй газраас онлайнаар хамрагдах боломжтой.",
  },
  {
    title: "Бичлэг үлдэнэ",
    text: "Тасалсан хичээлээ бичлэгээр нөхөж, дахин үзэх боломжтой.",
  },
  {
    title: "Zoom-ээр хичээллэнэ",
    text: "Сургалтыг zoom-ээр орох ба багш сурагчидтай харилцаад хичээллэдэг.",
  },
  {
    title: "Бодлогод суурилсан арга зүй",
    text: "Практик буюу олимпиадад ирдэг бодлогуудыг хэрхэн бодох талаар бодлого дээр суурилж заадаг.",
  },
  {
    title: "Facebook групп",
    text: "Сургалтын фэйсбүүк групп үүсгэх ба группт сургалтын талаарх зүйлсээ чөлөөтэй ярилцдаг.",
  },
];
