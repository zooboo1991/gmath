import { NextResponse } from "next/server";
import { settleAssessmentPayment } from "@/lib/assessment/db";
import { settleRegistrationPayment } from "@/lib/db";
import { settleInstallmentIntent } from "@/lib/paymentIntents";

/**
 * QPay's payment notification webhook — GET, with `qpay_payment_id` appended
 * to whatever callback_url we registered on invoice creation. That id is
 * informational only and is never trusted as proof of payment: `type`/`ref`
 * (ours, set at invoice creation) identify which assessment or registration
 * to re-check, and settle*Payment always calls QPay's own check API against
 * the invoice id *we* stored for that row — never anything from this
 * request's query string. So a forged or replayed hit on this URL can, at
 * worst, trigger a no-op recheck of someone else's still-unpaid invoice.
 *
 * QPay requires this exact ack — HTTP 200, body "SUCCESS", nothing else —
 * regardless of what settling found, so failures are logged and swallowed
 * rather than surfaced in the response.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const ref = url.searchParams.get("ref");

  try {
    if (type === "assessment" && ref) {
      await settleAssessmentPayment(ref);
    } else if (type === "registration" && ref) {
      await settleRegistrationPayment(ref);
    } else if (type === "installment" && ref) {
      // Үлдэгдлийн төлбөр: бүртгэл аль хэдийн идэвхтэй тул төлөв солихгүй,
      // зөвхөн төлбөрийн дэвтэрт мөр нэмнэ. settleRegistrationPayment нь
      // идэвхтэй бүртгэл дээр чимээгүй буцдаг тул энд тусдаа зам хэрэгтэй.
      await settleInstallmentIntent(ref);
    }
  } catch (err) {
    console.error("qpay callback settle failed", type, ref, err);
  }

  return new NextResponse("SUCCESS", { status: 200 });
}
