// Server-side signup proxy.
//
// Normalizes Supabase responses so the caller can never distinguish
// a registered from an unregistered email (AUTH-VULN-02).
// Also adds IP-based rate limiting to slow enumeration attempts.

import { createClient } from "@/lib/supabase/server";

const RATE_WINDOW_MS = 15 * 60_000; // 15 min
const RATE_LIMIT = 5;
const signupBuckets = new Map<string, { resetAt: number; count: number }>();

function checkSignupRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = signupBuckets.get(ip);
  if (!entry || entry.resetAt <= now) {
    signupBuckets.set(ip, { resetAt: now + RATE_WINDOW_MS, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// Password policy errors are safe to surface — they reveal nothing about
// whether the email already exists.
function isSafeError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("password") || m.includes("signup is disabled") || m.includes("captcha");
}

const GENERIC_OK = { message: "If this email isn't registered, you'll receive a confirmation link." };

export async function POST(request: Request) {
  const ip =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ??
    "unknown";

  if (checkSignupRateLimit(ip)) {
    return Response.json(
      { error: "Too many attempts. Please wait and try again." },
      { status: 429, headers: { "Retry-After": "900" } }
    );
  }

  let body: { email?: unknown; password?: unknown; name?: unknown; captchaToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email, password, name, captchaToken } = body;
  if (typeof email !== "string" || !email || typeof password !== "string" || !password) {
    return Response.json({ error: "Email and password are required" }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? "";
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: typeof name === "string" ? name : "" },
      emailRedirectTo: `${origin}/auth/confirm?next=/dashboard`,
      captchaToken: typeof captchaToken === "string" && captchaToken ? captchaToken : undefined,
    },
  });

  // Expose only password policy violations — suppress everything else
  // (including "user already registered" and SMTP errors)
  if (error && isSafeError(error.message)) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json(GENERIC_OK);
}
