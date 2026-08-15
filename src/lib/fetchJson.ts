/**
 * Reading an API reply without trusting it to be JSON.
 *
 * Every route in this app answers with JSON, so `await res.json()` looked safe
 * — until a 10.6 MB photo hit Vercel's 4.5 MB request cap. That reply never
 * reaches our code: the platform returns an HTML error page, `res.json()`
 * throws, the component's `catch` blames the network, and the teacher spends
 * an evening retrying a upload that could never work. The same happens on a
 * function timeout (504), a cold-start 502, and a rate-limit page.
 *
 * So: parsing never throws, and when the body is not JSON the *status* decides
 * what the user is told. A wrong-but-plausible "Сүлжээний алдаа" is worse than
 * no message, because it sends them to retry instead of to a fix.
 */

/** Parsed body, or an empty object when the reply is not JSON. Never throws. */
export async function readJson<T extends Record<string, unknown> = Record<string, unknown>>(
  res: Response
): Promise<Partial<T>> {
  try {
    const parsed: unknown = await res.json();
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
}

/**
 * The message to show for a failed reply: the server's own `error` when it sent
 * one, otherwise something true about the status code.
 */
export function apiError(
  res: Response,
  json: unknown,
  fallback = "Алдаа гарлаа. Дахин оролдоно уу."
): string {
  const message = json && typeof json === "object" ? (json as { error?: unknown }).error : undefined;
  if (typeof message === "string" && message) return message;

  switch (res.status) {
    case 401:
      return "Нэвтрэх хугацаа дууссан байна. Дахин нэвтэрнэ үү.";
    case 403:
      return "Энэ үйлдлийг хийх эрхгүй байна.";
    case 404:
      return "Хайсан мэдээлэл олдсонгүй.";
    case 413:
      return "Илгээсэн өгөгдөл хэт том байна. Хэмжээг багасгаад дахин оролдоно уу.";
    case 429:
      return "Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.";
    case 504:
      return "Сервер удаан хариулж байна. Хэсэг хүлээгээд дахин оролдоно уу.";
    default:
      return res.status >= 500 ? "Серверийн алдаа гарлаа. Дахин оролдоно уу." : fallback;
  }
}
