# BUGS.md

Автомат тест бичих явцад олдсон алдаанууд. **Энд бүртгэсэн алдааг зассангүй** —
QA-гийн ажил нь олж баримтжуулах, засах эсэхийг шийдэх нь эзний эрх.

Алдаа бүрийг тест давтдаг. Тэдгээр тестийг `it.fails(...)`-ээр тэмдэглэсэн:
**зөв** зан төлөвийг батлах бичигдсэн тул алдаа засагдмагц ногоон болно, харин
хэн нэгэн тестийг нь устгавал шууд анзаарагдана.

---

## #1 — Амжилттай нэвтрэлт ч түгжээний тоололд ордог — ✅ ЗАССАН

**Хаана:** [src/app/api/account/login/route.ts:18](src/app/api/account/login/route.ts:18)
(мөн [src/lib/rateLimit.ts:25](src/lib/rateLimit.ts:25))

**Юу болж байна:** `checkRateLimit("login:<phone>", 8, 5*60)` нь нууц үг
шалгагдахаас **өмнө** дуудагдаж, тоолуурыг нэмэгдүүлдэг. Тоолуур зөвхөн
амжилтгүй оролдлогыг бус, **дуудлага бүрийг** тоолно.

**Хэрхэн давтах:**

```
5 минутын дотор ЗӨВ нууц үгээр 8 удаа нэвтэр → бүгд 200
9 дэх удаа ЗӨВ нууц үгээр нэвтэр      → 429 "Оролдлого хэт олон удаа..."
```

Тест: [tests/api/auth/login.test.ts](tests/api/auth/login.test.ts) →
`does not lock out a user whose password is correct every time`

**Эрсдэл:** дунд зэрэг. Нэг аккаунтыг 2 төхөөрөмж хуваалцахаар зохиосон
(`MAX_SESSIONS_PER_USER = 2`) — эцэг эх, хүүхэд хоёр ээлжлэн нэвтрэх, эсвэл
клиент дахин оролдох үед хэрэглэгч өөрийгөө 5 минут түгжинэ. Аюулгүй байдлын
нүх биш, харин жинхэнэ хэрэглэгчид тулгарах саад.

**Засвар:** `rateLimit.ts`-д уншиж шалгах, тоолох хоёрыг салгав —
`peekRateLimit` (тоолуурыг хөндөхгүй), `recordFailedAttempt`, `clearRateLimit`.
Нэвтрэх route одоо эхлээд peek хийж (түгжигдсэн дугаар нууц үгийн удаан
шалгалт руу ч хүрэхгүй), нууц үг буруу үед л тоолуурыг нэмэгдүүлж, зөв үед
тоолуурыг цэвэрлэнэ.

`checkRateLimit`-ийг хэвээр үлдээв: чат, хуудасны үзэлт зэрэг дуудлага бүр нь
хязгаарлах ёстой зүйл байдаг 13 газар түүнийг ашигладаг.

Тест хоёр талтай: амжилттай нэвтрэлт тоологдохгүй, мөн амжилттай нэвтрэлт
өмнөх алдаануудыг цэвэрлэнэ ([tests/api/auth/login.test.ts](tests/api/auth/login.test.ts)).

---

## #2 — Нууц үг сэргээхэд өмнөх сессионууд хүчинтэй хэвээр үлддэг — ✅ ЗАССАН

**Хаана:** [src/app/api/account/reset-password/route.ts:52](src/app/api/account/reset-password/route.ts:52)
(мөн [src/lib/session.ts:8-12](src/lib/session.ts:8) — энэ дутагдлыг кодын
тайлбарт өөрт нь хүлээн зөвшөөрсөн байгаа)

**Юу болж байна:** `updateUserPassword` нь зөвхөн `users` мөрийн hash-ийг
солино. `sessions` хүснэгтийн мөрүүд хэвээрээ үлдэх тул хуучин cookie-тэй
төхөөрөмж нэвтэрсэн хэвээр байна.

**Хэрхэн давтах:**

```
1. A төхөөрөмжөөс нэвтэр                        → сессион үүснэ
2. OTP-оор нууц үгээ сэргээ (өөр төхөөрөмжөөс)  → 200
3. A төхөөрөмжөөс GET /api/account/me           → хэрэглэгч БУЦСААР байна
```

Тест: [tests/api/auth/reset-password.test.ts](tests/api/auth/reset-password.test.ts) →
`signs other devices out when the password is changed`

**Эрсдэл:** өндөр. Нууц үг сэргээх үйлдлийг хүн яг л "хэн нэгэн миний
аккаунтад орсон байна" гэж сэжиглэсэн үедээ хийдэг. Одоогийн байдлаар тэр
үйлдэл халдагчийг гаргадаггүй — халдагчийн сессион 30 хоног хүчинтэй хэвээр
(`maxAge: 60*60*24*30`, [session.ts:100](src/lib/session.ts:100)).

**Засвар:** `updateUserPassword` ([src/lib/db.ts:585](src/lib/db.ts:585)) нь
нууц үгийг сольсныхоо дараа тухайн `user_id`-ийн бүх `sessions` мөрийг устгадаг
болов. Сессион устгах нь дуудагчийн ажил биш, энэ үйлдлийн салшгүй хэсэг —
нууц үгээ сольсон хүн бүр хуучин төхөөрөмжүүдээ гаргана. Сэргээлт хийсэн
төхөөрөмж нь дараа нь `setSessionUser`-ээр шинэ сессион авдаг тул нэвтэрсэн
хэвээр үлдэнэ.

Тест хоёр талыг нь барина: бусад төхөөрөмж гарсан эсэх, сэргээлт хийсэн
төхөөрөмж үлдсэн эсэх ([tests/api/auth/reset-password.test.ts](tests/api/auth/reset-password.test.ts)).

---

## #4 — Дүүрсэн ангид сурагч ӨӨРИЙН эхлүүлсэн төлбөрөө үргэлжлүүлж чадахгүй — ✅ ЗАССАН

**Хаана:** [src/app/api/enroll/route.ts:57-65](src/app/api/enroll/route.ts:57)

**Юу болж байна:** суудлын шалгалт нь сурагчийн өөрийнх нь бүртгэлийг хайхаас
([route.ts:108](src/app/api/enroll/route.ts:108)) **өмнө** ажиллана.
`countRegistrationsForProgram` нь `pending` мөрийг ч тоолдог тул сурагчийн
өөрийнх нь эзэлсэн суудал ангийг "дүүрсэн" болгож, дараа нь тэр сурагч рүү
409 буцаана.

**Хэрхэн давтах:**

```
capacity = 1 сургалт
1. Сурагч POST /api/enroll {payMethod:"qpay"} → 200, pending бүртгэл + QPay QR
2. Тэр сурагч QR цонхоо хаагаад дахин нээнэ (ижил хүсэлт)
   → 409 "Энэ ангийн бүртгэл дүүрсэн байна."
```

Тест: [tests/api/payment/enroll.test.ts](tests/api/payment/enroll.test.ts) →
`lets a student who already holds a seat resume their own payment`

**Эрсдэл:** дунд зэрэг. Сурагч нэхэмжлэхээ дахин нээж чадахгүй, суудал нь
эзлэгдсэн хэвээр үлдэнэ. QPay-ийн `sender_invoice_no` дахин ашиглагдахгүй тул
шинэ нэхэмжлэх ч үүсгэж болохгүй — цуцлаад дахин эхлэхээс өөр гарц алга, тэр
нь бүртгэлийн id-г мэдэж байх шаардлагатай. Дүүрэх дөхсөн анги дээр л илэрнэ.

**Засвар:** `countRegistrationsForProgram`-д `excludeUserId` сонголт нэмж,
бүртгэлийн route түүгээр дамжуулдаг болов. "Анги хэр дүүрсэн бэ" гэдэг нь
"ЭНЭ сурагч үргэлжлүүлж болох уу" гэсэн өөр асуулт — сурагчийн өөрийнх нь
эзэлсэн суудал өөрийнх нь эсрэг тоологдох ёсгүй.

Анхаарах зүйл (эхний оролдлого дээр алдсан): `user_id.neq.X` дангаараа
`user_id IS NULL` мөрүүдийг мөн хаядаг — SQL-д `NULL <> 'x'` нь үнэн биш,
NULL. Тэдгээр нь админ утасны дугаараар нэмсэн, аккаунтгүй сурагчдын бүртгэл
бөгөөд суудал эзэлдэг. Тиймээс `or(user_id.is.null, user_id.neq.X)` болгов.
Байгаа тестүүд үүнийг шууд барьсан.

---

## #5 — Зөвхөн нийтлэлийн холбоос солих PUT нь "сургалт олдсонгүй" гэнэ — ✅ ЗАССАН

**Хаана:** [src/lib/db.ts:733-755](src/lib/db.ts:733) (`updateCourse`) +
[src/app/api/admin/courses/[id]/route.ts:95-106](src/app/api/admin/courses/%5Bid%5D/route.ts:95)

**Юу болж байна:** `updateCourse` нь илгээгдсэн талбаруудаас patch бүтээдэг.
Хэрэв хүсэлтэд сургалтын нэг ч талбар байхгүй бол patch хоосон болж,
PostgREST ямар ч мөр шинэчлэхгүй, `maybeSingle()` `undefined` буцаана →
route нь **404 "Сургалт олдсонгүй"** гэж хариулна. Хамгийн чухал нь
`setProgramArticles` тэр 404-ийн ӨМНӨ биш ХОЙНО байдаг тул нийтлэлийн
холбоос **огт хадгалагдахгүй**.

**Хэрхэн давтах:**

```
PUT /api/admin/courses/<байгаа сургалтын id>
{ "articleIds": ["<байгаа нийтлэлийн id>"] }
→ 404 "Сургалт олдсонгүй", холбоос хадгалагдаагүй
```

Тест: [tests/api/content/courses.test.ts](tests/api/content/courses.test.ts) →
`saves a list sent on its own, without other course fields`

**Эрсдэл:** бага. Одоогийн админ панель `articleIds`-ыг маягтын бусад
талбаруудтай хамт нэг цул объектоор илгээдэг
([CourseObjectPage.tsx:116](src/components/admin/CourseObjectPage.tsx:116)) тул
UI-аас илрэхгүй. Гэхдээ хэсэгчилсэн хадгалалт нэмэх юм уу, өөр клиент бичих
үед чимээгүй унана — мөн "олдсонгүй" гэсэн мессеж нь шалтгааныг нь буруу
заана.

**Засвар:** `updateCourse` нь patch хоосон үед мөрийг шинэчлэхийг оролдохоо
болиод одоо байгаа сургалтыг эргүүлж уншина. "Өөрчлөх зүйлгүй" гэдэг нь
"ийм сургалт байхгүй" гэсэн үг биш.

Хоёр дахь тест нөгөө талыг барина: үнэхээр байхгүй сургалтын id одоо ч 404
буцаадаг байх ёстой — хоосон patch бүх id-г 200 болгож хувиргах ёсгүй.

---

## #3 — Хоосон/эвдэрсэн JSON body 500 буцаана — ✅ ЗАССАН

**Хаана:** [src/app/api/account/login/route.ts:9](src/app/api/account/login/route.ts:9).
Ижил хэв маяг: [register/route.ts:21](src/app/api/account/register/route.ts:21),
[reset-password/route.ts:13](src/app/api/account/reset-password/route.ts:13),
[otp/send/route.ts:8](src/app/api/account/otp/send/route.ts:8),
[otp/verify/route.ts:8](src/app/api/account/otp/verify/route.ts:8),
[enroll/route.ts:25](src/app/api/enroll/route.ts:25),
[lessons/join/route.ts:21](src/app/api/lessons/join/route.ts:21)

**Юу болж байна:** `await request.json()` барьцгүй дуудагдсан тул body хоосон
эсвэл JSON биш үед `SyntaxError` шидэгдэж, 500 буцна. Зарим route энэ асуудлыг
аль хэдийн шийдсэн (`request.json().catch(() => ({}))` —
[lessons/recording/route.ts:21](src/app/api/lessons/recording/route.ts:21)).

Мөн ижил төрлийн асуудал `formData()`-д:
[admin/upload/route.ts:12](src/app/api/admin/upload/route.ts:12),
[admin/problems/upload/route.ts](src/app/api/admin/problems/upload/route.ts) —
multipart биш body ирвэл `TypeError` шидэгдэнэ.

**Хэрхэн давтах:**

```
POST /api/account/login  (body огт байхгүй, Content-Type: application/json)
→ 500, серверийн лог дээр "SyntaxError: Unexpected end of JSON input"

POST /api/admin/upload   (JSON body, админаар нэвтэрсэн)
→ 500, "TypeError: Content-Type was not one of multipart/form-data..."
```

Тестүүд: [tests/api/auth/login.test.ts](tests/api/auth/login.test.ts) →
`answers 400 rather than 500 for a body that is not JSON`,
[tests/api/authz/admin.test.ts](tests/api/authz/admin.test.ts) →
`answer 400 rather than 500 for a body that is not multipart`

**Эрсдэл:** бага. Сессион олгогдохгүй, өгөгдөл алдагдахгүй. Гэхдээ (1) буруу
оролтыг 400-аар хариулдаг бусад бүх тохиолдлоос зөрж байна, (2) лог руу
шаардлагагүй stack trace цутгана, (3) скайнер энэ 500-г "эмзэг цэг" гэж
тэмдэглэдэг.

**Засвар:** долоон route дээр `request.json().catch(() => ({}))`, хоёр
байршуулах route дээр `request.formData().catch(() => null)`. Уншигдахгүй
биетийг хоосон гэж үзээд, тухайн route-ийн өөрийнх нь шалгалт 400-аа
хэлдэг болов — `lessons/recording` route аль хэдийн ийм хэв маягтай байсан,
түүнийг дагав. Алдааны мессежийг route бүр өөрөө эзэмшсэн хэвээр.
