import type { PayMethod } from "./db";

export function payMethodLabel(method: PayMethod): string {
  if (method === "qpay") return "QPay";
  if (method === "manual") return "Гараар нэмсэн";
  return "Дансаар";
}
