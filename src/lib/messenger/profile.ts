import { SITE_URL } from "../siteUrl";

/**
 * The Page's Messenger profile: the greeting shown before someone's first
 * message, and the persistent menu that sits under the composer.
 *
 * Why this exists at all: Meta's own AI agent answers Page messages before our
 * webhook ever sees them, so anything that depends on our bot replying can be
 * intercepted. Persistent-menu items of type `web_url` are pure client
 * navigation — Messenger opens the link itself, no webhook and no AI in the
 * path — which makes them the one reliable way to move someone from the Page
 * to gmath.mn.
 *
 * Set from the admin Чат page rather than a local script: the Page token lives
 * in the production environment, so the call has to originate there.
 */

const GREETING =
  "Сайн байна уу! Б.Ганбат багшийн математикийн сургалт. Сургалт, үнэ, хуваарийн талаар gmath.mn дээрх AI туслахаас шууд асуугаарай.";

/**
 * Messenger allows at most 3 top-level items, so the two most common
 * destinations get their own row and the rest go in one submenu.
 * `?chat=1` opens the site's chat widget on arrival (see ChatWidget).
 */
function persistentMenu() {
  return [
    {
      locale: "default",
      composer_input_disabled: false,
      call_to_actions: [
        {
          type: "web_url",
          title: "💬 AI туслахаас асуух",
          url: `${SITE_URL}/?chat=1`,
          webview_height_ratio: "full",
        },
        {
          type: "web_url",
          title: "🎓 Сургалтууд",
          url: `${SITE_URL}/courses`,
          webview_height_ratio: "full",
        },
        {
          type: "nested",
          title: "📄 Бусад",
          call_to_actions: [
            { type: "web_url", title: "Миний профайл", url: `${SITE_URL}/profile`, webview_height_ratio: "full" },
            { type: "web_url", title: "Түвшин тодорхойлох", url: `${SITE_URL}/assessment`, webview_height_ratio: "full" },
            { type: "web_url", title: "Сертификат шалгах", url: `${SITE_URL}/certificate`, webview_height_ratio: "full" },
            { type: "web_url", title: "Нийтлэлүүд", url: `${SITE_URL}/articles`, webview_height_ratio: "full" },
            { type: "web_url", title: "Багшийн тухай", url: `${SITE_URL}/teacher`, webview_height_ratio: "full" },
          ],
        },
      ],
    },
  ];
}

export type MessengerProfileResult = { ok: true } | { ok: false; error: string };

export async function setMessengerProfile(): Promise<MessengerProfileResult> {
  const pageToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!pageToken) return { ok: false, error: "MESSENGER_PAGE_ACCESS_TOKEN тохируулаагүй байна" };

  const version = process.env.MESSENGER_GRAPH_VERSION ?? "v21.0";
  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/me/messenger_profile?access_token=${encodeURIComponent(pageToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          greeting: [{ locale: "default", text: GREETING }],
          persistent_menu: persistentMenu(),
        }),
      }
    );
    const body = await res.text();
    if (!res.ok) {
      // Meta's error text is the only useful thing here, so it goes back to the
      // admin screen verbatim (trimmed) instead of a generic failure message.
      return { ok: false, error: `Meta: ${res.status} ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Сүлжээний алдаа" };
  }
}

/** Reads back what the Page currently has, so the admin screen can show it. */
export async function getMessengerProfile(): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const pageToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!pageToken) return { ok: false, error: "MESSENGER_PAGE_ACCESS_TOKEN тохируулаагүй байна" };

  const version = process.env.MESSENGER_GRAPH_VERSION ?? "v21.0";
  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/me/messenger_profile?fields=greeting,persistent_menu&access_token=${encodeURIComponent(
        pageToken
      )}`
    );
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `Meta: ${res.status} ${body.slice(0, 300)}` };
    return { ok: true, data: JSON.parse(body) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Сүлжээний алдаа" };
  }
}
