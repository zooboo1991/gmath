import crypto from "crypto";

/**
 * Minimal password hashing (scrypt + per-user salt) so passwords aren't
 * stored in plain text in data/db.json. Still a placeholder — no rate
 * limiting, no breach checks — swap for a real auth provider before this
 * goes anywhere near production.
 */

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string) {
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(attempt, "hex"), Buffer.from(hash, "hex"));
}
