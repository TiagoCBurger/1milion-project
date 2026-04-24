// Server-side login proxy.
//
// Enforces per-email lockout after MAX_ATTEMPTS consecutive failures
// regardless of the caller's IP address (AUTH-VULN-08). This prevents
// brute-force attacks that rotate IPs to bypass Supabase's IP-only rate limit.

import { createClient } from "@/lib/supabase/server";
import { friendlyAuthError } from "@/lib/auth-errors";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000; // 15 min

interface Bucket {
  count: number;
  resetAt: number;
  lockedUntil?: number;
}

const loginBuckets = new Map<string, Bucket>();

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function checkLock(email: string): { locked: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = loginBuckets.get(normalizeEmail(email));
  if (!entry) return { locked: false };
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { locked: true, retryAfter: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  if (entry.resetAt <= now) {
    loginBuckets.delete(normalizeEmail(email));
  }
  return { locked: false };
}

function recordFailure(email: string): void {
  const key = normalizeEmail(email);
  const now = Date.now();
  const entry = loginBuckets.get(key);

  if (!entry || entry.resetAt <= now) {
    loginBuckets.set(key, { count: 1, resetAt: now + LOCKOUT_MS });
    return;
  }

  entry.count++;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
}

function recordSuccess(email: string): void {
  loginBuckets.delete(normalizeEmail(email));
}

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown; captchaToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email, password, captchaToken } = body;
  if (typeof email !== "string" || !email || typeof password !== "string" || !password) {
    return Response.json({ error: "Email and password are required" }, { status: 400 });
  }

  const lock = checkLock(email);
  if (lock.locked) {
    return Response.json(
      { error: "Account temporarily locked. Too many failed attempts." },
      { status: 429, headers: { "Retry-After": String(lock.retryAfter) } }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: typeof captchaToken === "string" && captchaToken ? { captchaToken } : undefined,
  });

  if (error) {
    const msg = error.message.toLowerCase();

    if (msg.includes("email not confirmed")) {
      return Response.json({ error: "email_not_confirmed" }, { status: 401 });
    }

    // Only count credential failures toward lockout — not config/state errors
    if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
      recordFailure(email);
    }

    return Response.json({ error: friendlyAuthError(error.message) }, { status: 401 });
  }

  recordSuccess(email);
  return Response.json({ success: true });
}
