import { timingSafeEqual } from "node:crypto";

/**
 * Checks `Authorization: Bearer <CRON_SECRET>`. Vercel Cron sends this
 * header automatically; the GitHub Actions schedule sends it from a secret.
 */
export function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
