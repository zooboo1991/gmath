import type { PayMethod, RegistrationStatus } from "./db";
import { parsePriceToNumber } from "./price";

export function payMethodLabel(method: PayMethod): string {
  if (method === "qpay") return "QPay";
  if (method === "manual") return "Гараар нэмсэн";
  return "Дансаар";
}

/** A registration's programId is either a real course UUID or a yearly-program id like "program-c". */
export function programAdminHref(programId: string): string {
  return programId.startsWith("program-") ? `/admin/yearly/${programId}` : `/admin/courses/${programId}`;
}

/**
 * What one registration owes, in the one place both the dashboard and the
 * student's payment tab read it from.
 *
 * The rule that is easy to get wrong: a QPay registration with no agreed
 * total was settled in full by the gateway, and has no payment rows to prove
 * it. Counting only the rows would report every such student as owing their
 * whole fee.
 */
export function registrationBalance(
  registration: {
    price: string;
    totalDue?: number;
    status: RegistrationStatus;
    payMethod: PayMethod;
  },
  paidRecorded: number
): { due: number; paid: number; balance: number; settledByGateway: boolean } {
  const due = registration.totalDue ?? parsePriceToNumber(registration.price);
  const settledByGateway =
    registration.totalDue === undefined &&
    registration.status === "active" &&
    registration.payMethod === "qpay";
  const paid = Math.min(settledByGateway ? due : paidRecorded, due);
  return { due, paid, balance: Math.max(0, due - paid), settledByGateway };
}
