#!/usr/bin/env node
/**
 * Prints the briefing text to paste into Meta AI (Business Suite → AI →
 * Sources / Instructions) for the Facebook Page.
 *
 * Why a generator instead of a document: the Page's AI kept answering with
 * stale prices and schedules because its copy of the information was written
 * by hand once. This reads the live database, so re-running it after any course
 * change produces text that matches the site exactly.
 *
 * Usage (from web/):
 *   node scripts/metaAiBrief.mjs > ../meta-ai-brief.txt
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { readFileSync } from "node:fs";

const SITE = "https://gmath.mn";

function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    env[m[1]] = value;
  }
  return env;
}

async function select(env, table, query) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

const env = loadEnv();

const [courses, programs] = await Promise.all([
  select(env, "courses", "select=id,kind,status,tag,title,topics,price,period,start_date,mode,lessons&status=eq.published"),
  select(env, "yearly_programs", "select=id,tag,title,label,topics,price,period,lessons"),
]);

const upcoming = courses.filter((c) => c.kind === "upcoming");
const vod = courses.filter((c) => c.kind === "vod");

function courseBlock(c) {
  const bits = [
    `- ${c.title} (${c.tag})`,
    `  Үнэ: ${c.price} ${c.period}`,
    c.start_date ? `  Хичээллэх өдөр: ${c.start_date}` : null,
    c.mode ? `  Хэлбэр: ${c.mode}` : null,
    Array.isArray(c.lessons) && c.lessons.length ? `  Хичээлийн тоо: ${c.lessons.length}` : null,
    c.topics ? `  Тайлбар: ${c.topics}` : null,
    `  Холбоос: ${SITE}/courses/${c.id}`,
  ];
  return bits.filter(Boolean).join("\n");
}

function programBlock(p) {
  // No lesson count here on purpose: the yearly programs' `lessons` array only
  // holds whatever has been scheduled so far (often one row), while the real
  // figure — 100+ lessons over ten months — is stated in `topics`. Printing the
  // array length would feed Meta AI a number that contradicts the site.
  return [
    `- ${p.label || p.title} (${p.tag})`,
    `  Үнэ: ${p.price} ${p.period}`,
    p.topics ? `  Тайлбар: ${p.topics}` : null,
    `  Холбоос: ${SITE}/courses/${String(p.id).replace(/^program-/, "")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const today = new Date().toISOString().slice(0, 10);

console.log(`# Б.ГАНБАТ БАГШИЙН МАТЕМАТИКИЙН СУРГАЛТ — МЭДЭЭЛЛИЙН ЭХ СУРВАЛЖ
# Шинэчилсэн: ${today}. Эх сурвалж: ${SITE} (өөрчлөгдвөл энэ файл дахин үүсгэгдэнэ)

== ХАМГИЙН ЧУХАЛ ЗААВАР ==
1. Хариулт бүрийн төгсгөлд тохирох холбоосыг өг. Ерөнхий асуултад ${SITE},
   сургалтын асуултад доорх тухайн сургалтын холбоосыг.
2. Үнэ, хуваарь, хичээлийн тоог доорх жагсаалтаас ЯГ хуулж хэл. Тааварлаж,
   бөөрөнхийлж хэлэхгүй.
3. Доор байхгүй зүйлийг зохиохгүй. Оронд нь: "Дэлгэрэнгүйг ${SITE} дээрх AI
   туслахаас асуувал шууд хариулна" гэж чиглүүл.
4. Хувийн мэдээлэл (тухайн сурагчийн бүртгэл, төлбөр, Zoom холбоос, Facebook
   группын линк) хэзээ ч хэлэхгүй. Тэдгээрийг зөвхөн хэрэглэгч өөрөө
   ${SITE}/profile хуудсанд нэвтэрч харна. Асуувал тэнд чиглүүл.
5. Зөвхөн монгол хэлээр, эелдэг, товч бич.

== ВЭБ ХУУДСУУД ==
Нүүр (AI туслахтай чатлах боломжтой): ${SITE}
Сургалтууд: ${SITE}/courses
Түвшин тодорхойлох үнэлгээ: ${SITE}/assessment
Сертификат шалгах: ${SITE}/certificate
Нийтлэлүүд: ${SITE}/articles
Багшийн тухай: ${SITE}/teacher
Хамт баг: ${SITE}/team
Миний профайл (нэвтэрсэн хэрэглэгч): ${SITE}/profile

== 1 ЖИЛИЙН ХӨТӨЛБӨР ==
${programs.map(programBlock).join("\n\n") || "(байхгүй)"}

== УДАХГҮЙ ЭХЛЭХ СУРГАЛТУУД ==
${upcoming.map(courseBlock).join("\n\n") || "(байхгүй)"}

== БИЧЛЭГЭЭР ҮЗЭХ СУРГАЛТУУД ==
${vod.map(courseBlock).join("\n\n") || "(байхгүй)"}

== БҮРТГЭХ, ТӨЛӨХ ==
Бүртгэл: ${SITE}/courses хуудаснаас сургалтаа сонгож, утасны дугаараар
бүртгэнэ. Утсаа SMS кодоор баталгаажуулна.
Төлбөр: QPay-ээр шууд төлөх, эсвэл дансаар шилжүүлэх. Шаардлагатай бол
хэсэгчилсэн төлбөрийн уян хатан нөхцөл байдаг.
Төлбөр баталгаажсаны дараа хичээлийн хуваарь, Zoom холбоос, хаалттай
Facebook групп нь тухайн хэрэглэгчийн ${SITE}/profile хуудсанд харагдана.

== ХИЧЭЭЛИЙН ЗОХИОН БАЙГУУЛАЛТ ==
- Онлайн хичээл Zoom-ээр, танхимын хичээл Улаанбаатарт.
- Хичээл бүр бичлэг хийгддэг. Тасалсан хичээлээ хүссэн үедээ нөхөж үзнэ.
- Хичээл орохоос 30 минутын өмнө мэдэгдэл ирнэ.
- Шинэ бичлэг орох, шинэ сургалт нэмэгдэхэд мэдэгдэл ирнэ.

== ХОЛБОО БАРИХ ==
Утас: 9077 7400, 9939 5945 (10:00–18:00)
Имэйл: math.ganbat@gmail.com
Хаяг: Улаанбаатар хот, Сүхбаатар дүүрэг, 1-р хороо, 1-р сургуулийн замын
эсрэг талд, Чонон бүрт төв, 403 тоот
Google Map: https://maps.app.goo.gl/UcgNm7tTaQSbGenF7
Facebook: https://www.facebook.com/ganbat.surgalt/

== ТҮГЭЭМЭЛ АСУУЛТУУД ==
Хичээлийг тасалбал: бүх хичээл бичлэгээр хадгалагддаг, хүссэн үедээ нөхнө.
Интернэт удаан бол: чанарын түвшин сонгох, татаж офлайн үзэх боломжтой.
Танхимд очиж чадахгүй бол: танхимын хичээл бүр бичлэгтэй.
Zoom-д хэрхэн суух: ${SITE}/profile → Хичээлд орох товч.
Хүссэн зүйлээ асуух: ${SITE} дээрх "Асуух зүйл байна уу?" товчийг дарж AI
туслахаас шууд асууна. Нэвтэрсэн бол өөрийн бүртгэл, хуваариа ч асууж болно.

== ЯАГААД БИД ==
- 600+ сурагч, 200+ багш сургалтад хамрагдсан.
- Шавь нар улс болон олон улсын олимпиадаас медаль хүртсэн.
- Зөвхөн олимпиадын бодлого, арга барилд төвлөрсөн агуулга.
- Бүх хичээл хадгалагдаж, хаанаас ч, хэзээ ч нөхөж үзэх боломжтой.
`);
