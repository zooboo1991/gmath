/**
 * Үсэгт илэрхийллийн хариултын загвар.
 *
 * Тоон хариулттай бодлогод нүдний тоо тогтмол байдаг ч үсэгт илэрхийлэлд
 * хэлбэр нь бодлого бүрт өөр: 9a^10 b^6, -4/5 x^4 z^2, c^n, 3n+5. Тиймээс
 * багш хариултаа LaTeX-ээр бичихдээ нөхөгдөх хэсгүүдээ [ ] дотор хийнэ:
 *
 *   [9]a^{[10]}b^{[6]}
 *
 * Үүнээс хоёр зүйл гарна: түлхүүр (9, 10, 6) ба сурагчид харагдах хэлбэр
 * (⬚a^⬚b^⬚). Нүд нь зэрэг дотор ч орж болох тул KaTeX-ийн гаралт дунд
 * жинхэнэ input байрлуулах боломжгүй — ЭЕШ-ийн адилаар илэрхийлэлд
 * дугаарласан хоосон нүд харуулж, доор нь дугаараар нь бөглүүлнэ.
 */

/** Загварын нэг хэсэг: тогтмол LaTeX эсвэл нөхөгдөх нүд. */
export type TemplatePart =
  | { kind: "latex"; text: string }
  | { kind: "box"; index: number };

export type ParsedTemplate = {
  parts: TemplatePart[];
  /** Нүд бүрийн зөв утга, зүүнээс баруун тийш. */
  values: string[];
  /** Сурагчид харуулах LaTeX — нүд нь дугаарласан хоосон дөрвөлжин болно. */
  display: string;
};

const BOX_RE = /\[([^\[\]]*)\]/g;

/**
 * Загварыг задлана. Хаалт олдохгүй бол нүдгүй загвар — дуудагч нь
 * үүнийг буруу оролт гэж үзнэ.
 */
export function parseAnswerTemplate(template: string): ParsedTemplate {
  const parts: TemplatePart[] = [];
  const values: string[] = [];
  let display = "";
  let last = 0;

  for (const match of template.matchAll(BOX_RE)) {
    const before = template.slice(last, match.index);
    if (before) {
      parts.push({ kind: "latex", text: before });
      display += before;
    }
    const index = values.length;
    values.push(match[1].trim());
    parts.push({ kind: "box", index });
    // Дугаарласан хоосон дөрвөлжин. Бүлэг дотор ороосон нь чухал: "x^[2]"
    // гэж бичихэд ороогүй бол дугаар нь x дээр буугаад x₁^⬚ болж уншигдана.
    display += `{\\square_{${index + 1}}}`;
    last = (match.index ?? 0) + match[0].length;
  }

  const tail = template.slice(last);
  if (tail) {
    parts.push({ kind: "latex", text: tail });
    display += tail;
  }
  return { parts, values, display };
}

/** Багшид харагдах бүтэн хариулт — нүдний утгуудыг буцааж тавина. */
export function filledTemplate(template: string): string {
  return template.replace(BOX_RE, (_, value: string) => String(value).trim());
}

/**
 * Загвар шалгалтад тэнцэх үү.
 *
 * Дор хаяж нэг нүдтэй, нүд бүр нь бөглөгдсөн, хаалт нь тэнцүү байх ёстой.
 */
export function validateAnswerTemplate(template: string): { ok: true } | { ok: false; error: string } {
  const text = template.trim();
  if (!text) return { ok: false, error: "Загварыг бөглөнө үү" };

  const { values, parts } = parseAnswerTemplate(text);

  // Задлагдаагүй хаалт үлдсэн бол загвар буруу бичигдсэн: "[a[b]c]" гэх мэт
  // үүрлэсэн хаалтын гадна талын үсгүүд сурагчид харагдах хэсэгт үлдэнэ.
  // Тоог нь тоолоод өнгөрөх нь хангалтгүй — үлдэгдлээр нь шалгана.
  const leftover = parts.some((p) => p.kind === "latex" && /[[\]]/.test(p.text));
  if (leftover) {
    return { ok: false, error: "Хаалт зөв тавигдаагүй байна — [ ] бүр тусдаа, үүрлэлгүй байна" };
  }

  // LaTeX-ийн өөрийн хаалт (\sqrt[3]{...}) нүд болж хувирвал зэргийн
  // үзүүлэлт нууц утга болоод, илэрхийлэл нь буруу зурагдана.
  if (/\\[a-zA-Z]+\s*\[/.test(text)) {
    return {
      ok: false,
      error: "LaTeX-ийн хаалтыг нүд гэж уншиж байна (жишээ нь \\sqrt[3]) — тэр хэсгийг өөрөөр бич",
    };
  }

  // Нүдний утга нь нэг утга байх ёстой: "[0;5]" мэт завсар нь бүхэлдээ
  // нуугдаад сурагч огт өөр бодлого харна.
  if (values.some((v) => /[;,\s]/.test(v))) {
    return { ok: false, error: "Нүдний утгад зай, таслал, цэг таслал байж болохгүй — нэг утга бич" };
  }
  if (values.length === 0) {
    return { ok: false, error: "Дор хаяж нэг нөхөгдөх хэсэг хэрэгтэй — жишээ нь [9]a^{[10]}" };
  }
  if (values.length > 6) return { ok: false, error: "Нүд хэт олон байна (дээд тал нь 6)" };
  if (values.some((v) => v === "")) return { ok: false, error: "Хоосон хаалт байна — [ ] дотор зөв утгаа бич" };
  return { ok: true };
}
