import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

/**
 * Word файл дотор таг унших, бөглөх.
 *
 * Яагаад сан хэрэглэв: Word нь `{сурагч}` гэсэн тагийг үсэг шалгагч, форматаас
 * болоод дотроо хэд хэдэн `<w:t>` болгон хуваачихдаг тул энгийн текст солилт
 * ажиллахгүй. docxtemplater нь XML-ийг хавтгай токен болгон задлаад тэр
 * хуваалтыг нийлүүлж уншдаг — өөрөөр хэлбэл гэрээний хэлбэр, лого, хүснэгт
 * бүгд хэвээрээ үлдэж, зөвхөн тагууд солигдоно.
 */

/**
 * Бүтэн текстээс олдсон тагууд, файлд гарч ирсэн дарааллаараа, давхардалгүй.
 *
 * `{#давталт}`, `{/давталт}`, `{@түүхий}` зэрэг бүтцийн тагуудыг алгасна:
 * эдгээр нь утга биш, тиймээс талбартай холбох боломжгүй.
 */
const STRUCTURAL_PREFIX = /^[#/^@>%-]/;
const TAG_RE = /\{([^{}]+)\}/g;

export class ContractDocxError extends Error {}

/** Гэрээний толгой, хөлд ч таг тавьдаг (гэрээний дугаар гэх мэт) тул тэднийг ч уншина. */
const TEXT_PARTS = /^word\/(document|header\d*|footer\d*)\.xml$/;

/** docxtemplater-ийн алдаанаас хүнд ойлгомжтой тайлбарыг сугална. */
function explain(err: unknown): string {
  const errors = (err as { properties?: { errors?: { properties?: { explanation?: string } }[] } })
    .properties?.errors;
  const detail = errors
    ?.map((e) => e.properties?.explanation)
    .filter(Boolean)
    .join("; ");
  return detail || (err as { message?: string }).message || "";
}

function open(buffer: Buffer): { doc: Docxtemplater<PizZip>; parts: string[] } {
  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch {
    throw new ContractDocxError("Word файлыг уншиж чадсангүй. .docx хэлбэртэй эсэхийг шалгана уу.");
  }

  // Загварын алдааг файлын алдаанаас ялгаж хэлэх нь чухал: "энэ .docx биш"
  // гэж хэлэх нь зөв файлтай хүнийг төөрөгдүүлнэ.
  try {
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Танигдаагүй таг алдаа шидэхгүй, хоосон зай болно. Толгой/хөл дэх
      // тагийг олж чадаагүй ч гэрээ бүтнээрээ гарч ирэх нь чухал.
      nullGetter: () => "",
    });
    const parts = Object.keys(zip.files).filter((name) => TEXT_PARTS.test(name));
    return { doc, parts };
  } catch (err) {
    const detail = explain(err);
    throw new ContractDocxError(
      detail ? `Гэрээний загварын тагт алдаа байна: ${detail}` : "Гэрээний загварын тагуудад алдаа байна."
    );
  }
}

export function readTemplateTags(buffer: Buffer): string[] {
  const { doc, parts } = open(buffer);
  const found: string[] = [];
  for (const part of parts) {
    for (const match of doc.getFullText(part).matchAll(TAG_RE)) {
      const tag = match[1].trim();
      if (!tag || STRUCTURAL_PREFIX.test(tag) || found.includes(tag)) continue;
      found.push(tag);
    }
  }
  return found;
}

/**
 * Тагуудыг өгөгдсөн утгаар сольсон шинэ .docx.
 *
 * Утга нь өгөгдөөгүй таг хоосон зай болно (алдаа шидэхгүй) — гэрээн дээр
 * гараар бөглөх мөр үлдэнэ гэсэн үг. Энэ нь зориудаар: систем дээр байхгүй
 * талбарыг хоосон үлдээх нь гэрээг огт үүсгэхгүй байхаас дээр.
 */
export function renderContract(buffer: Buffer, values: Record<string, string>): Buffer {
  const { doc } = open(buffer);
  try {
    doc.render(values);
  } catch (err) {
    const detail = explain(err);
    throw new ContractDocxError(
      detail ? `Гэрээг бөглөж чадсангүй: ${detail}` : "Гэрээг бөглөж чадсангүй. Загварын тагуудыг шалгана уу."
    );
  }
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}
