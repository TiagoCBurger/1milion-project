import { createHmac, timingSafeEqual } from "node:crypto";

// Unsubscribe links embed a short-lived HMAC over the recipient's
// email + a rotation "era" so that a leak on Tuesday can be invalidated
// on Wednesday by bumping EMAIL_UNSUBSCRIBE_SECRET. Without the token
// an unauthenticated attacker could mass-unsubscribe any address.

function secret(): string {
  const s = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "EMAIL_UNSUBSCRIBE_SECRET is not configured (need ≥32 chars)",
    );
  }
  return s;
}

function signDigest(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHmac("sha256", secret())
    .update(`unsubscribe:${normalized}`)
    .digest("hex");
}

export function signUnsubscribeToken(email: string): string {
  return signDigest(email);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  if (!email || !token) return false;
  let expected: string;
  try {
    expected = signDigest(email);
  } catch {
    return false;
  }
  if (token.length !== expected.length) return false;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildUnsubscribeUrl(
  email: string,
  baseUrl: string = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibefly.app",
): string {
  const t = signUnsubscribeToken(email);
  const u = new URL("/api/email/unsubscribe", baseUrl);
  u.searchParams.set("email", email);
  u.searchParams.set("t", t);
  return u.toString();
}
