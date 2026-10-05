/**
 * Сургалтын төлбөр хүлээн авах данс.
 *
 * Нэг эх сурвалж: бүртгүүлэх цонх, үлдэгдэл төлөх цонх хоёр ижил дугаар
 * харуулах ёстой. Мөнгөний мэдээллийг хоёр газар давхардуулж бичих нь нэгийг
 * нь засаад нөгөөг мартах эрсдэлтэй.
 */
import { extractCourseCategories, getCourseAudience } from "./courseTag";

export const BANK_NAME = "Хаан Банк";
export const BANK_ACCOUNT = "MN19000500 5034904750";
export const BANK_RECIPIENT = "Ганбат";

/**
 * The transfer description ("Гүйлгээний утга") for a course: phone, category,
 * audience and the student's name — the same shape the enrolment screen shows
 * (ProgramRegister's bankDescription). An admin matches each transfer on the
 * bank statement back to a student by reading this text, so it has to name them.
 */
export function bankTransferNote(input: {
  phone: string;
  tag: string;
  lastName?: string;
  firstName?: string;
}): string {
  const categories = extractCourseCategories(input.tag);
  const category = categories.length > 0 ? categories.join(",") : "-";
  const audience = getCourseAudience(input.tag) === "teacher" ? "Багш" : "Сурагч";
  const name = `${input.lastName ?? ""} ${input.firstName ?? ""}`.trim();
  return `${input.phone} ${category} ${audience}${name ? ` + ${name}` : ""}`.trim();
}
