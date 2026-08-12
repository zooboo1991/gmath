import { NextResponse } from "next/server";
import { createNotification, listArticlesDueForNotify, markArticleNotified } from "@/lib/db";

/**
 * Announces scheduled articles once their publish time has passed.
 *
 * The article itself goes public without any help from this route — every
 * public query filters on `publish_at <= now()`, so visibility is exact to the
 * second. This only sends the "шинэ нийтлэл" notification, which is why running
 * every few minutes (rather than continuously) is good enough.
 *
 * Auth is the same as the lesson-reminders cron: Vercel attaches
 * `Authorization: Bearer <CRON_SECRET>` automatically once that env var exists.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Зөвшөөрөлгүй" }, { status: 401 });
  }

  const due = await listArticlesDueForNotify();
  let notified = 0;

  for (const article of due) {
    // Claim it first: if two runs overlap, only the one that flips notified_at
    // from null gets to send, so nobody is notified twice.
    const claimed = await markArticleNotified(article.id);
    if (!claimed) continue;

    try {
      await createNotification({
        title: "Шинэ нийтлэл нэмэгдлээ",
        body: `"${article.title}" нийтлэл нэмэгдлээ.`,
        targetType: "all",
        channel: "site",
        pushUrl: `/articles/${article.id}`,
      });
      notified += 1;
    } catch (err) {
      console.error(`[publish-articles] notification failed for ${article.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, due: due.length, notified });
}
