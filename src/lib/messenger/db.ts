import crypto from "crypto";
import { getSupabase } from "../supabase";

/**
 * PSID ↔ account links and the one-time tokens that create them. Kept out of
 * lib/db.ts (which is already ~2000 lines) but using the same conventions:
 * plain exported functions, camelCase in, snake_case at the SQL boundary.
 */

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * Deliberately short and hand-typable, because the token doubles as a code the
 * student can send as a plain Messenger message. That path exists because
 * m.me?ref= only reliably delivers the ref inside the mobile Messenger app —
 * on desktop m.me redirects through messenger.com and the ref is lost, which
 * left the first real linking attempt with a minted-but-never-consumed token.
 *
 * Alphabet omits I/O/0/1 so nothing is ambiguous when read off a screen.
 * 32^8 ≈ 10^12 combinations, single-use, 15-minute life.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_CODE_LENGTH = 8;
/** Latin-only, so a Mongolian Cyrillic message can never be mistaken for a code. */
export const LINK_CODE_RE = /^[A-Z2-9]{8}$/;

function generateCode(): string {
  const bytes = crypto.randomBytes(LINK_CODE_LENGTH);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** The signed-in student's half of the flow: mint a code for the m.me link and for typing. */
export async function createLinkToken(userId: string): Promise<string> {
  const token = generateCode();
  const { error } = await getSupabase().from("messenger_link_tokens").insert({
    token,
    user_id: userId,
    expires_at: new Date(Date.now() + LINK_TOKEN_TTL_MS).toISOString(),
  });
  if (error) throw error;
  return token;
}

/**
 * Consumes a token and links the PSID to its account. Returns the user id on
 * success, or undefined when the token is unknown, expired, or already used —
 * the caller can't tell those apart on purpose, since the difference isn't
 * useful to whoever is holding a bad token.
 */
export async function consumeLinkToken(token: string, psid: string): Promise<string | undefined> {
  const supabase = getSupabase();
  // Conditional update, not read-then-write: two messages arriving at once
  // would both pass a separate "is it unused?" check, and only one of these
  // can flip consumed_at from null.
  const { data, error } = await supabase
    .from("messenger_link_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", token)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id")
    .maybeSingle();
  if (error) throw error;

  const userId = (data as { user_id: string } | null)?.user_id;
  if (!userId) return undefined;

  const { error: linkError } = await supabase
    .from("messenger_links")
    .upsert({ psid, user_id: userId, linked_at: new Date().toISOString() }, { onConflict: "psid" });
  if (linkError) throw linkError;
  return userId;
}

/** Who is this Facebook user? undefined when they haven't linked an account yet. */
export async function findUserIdByPsid(psid: string): Promise<string | undefined> {
  const { data, error } = await getSupabase()
    .from("messenger_links")
    .select("user_id")
    .eq("psid", psid)
    .maybeSingle();
  if (error) throw error;
  return (data as { user_id: string } | null)?.user_id;
}

/** Returns true when a link actually existed, so the reply can tell the user which happened. */
export async function unlinkPsid(psid: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("messenger_links")
    .delete()
    .eq("psid", psid)
    .select("psid");
  if (error) throw error;
  return (data as unknown[]).length > 0;
}

/** The website's "salgah" button — drops every Facebook account linked to this student. */
export async function unlinkAllForUser(userId: string): Promise<number> {
  const { data, error } = await getSupabase()
    .from("messenger_links")
    .delete()
    .eq("user_id", userId)
    .select("psid");
  if (error) throw error;
  return (data as unknown[]).length;
}

/** Every PSID an account has linked — used by the profile card to show current state. */
export async function listPsidsForUser(userId: string): Promise<string[]> {
  const { data, error } = await getSupabase().from("messenger_links").select("psid").eq("user_id", userId);
  if (error) throw error;
  return (data as { psid: string }[]).map((r) => r.psid);
}
