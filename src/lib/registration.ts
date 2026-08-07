import type { PayMethod } from "./db";

export function payMethodLabel(method: PayMethod): string {
  if (method === "qpay") return "QPay";
  if (method === "manual") return "Гараар нэмсэн";
  return "Дансаар";
}

/** A registration's programId is either a real course UUID or a yearly-program id like "program-c". */
export function programAdminHref(programId: string): string {
  return programId.startsWith("program-") ? `/admin/yearly/${programId}` : `/admin/courses/${programId}`;
}
