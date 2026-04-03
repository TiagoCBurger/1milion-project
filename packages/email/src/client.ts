// ============================================================
// Resend Client (server-side only)
// ============================================================

import { Resend } from "resend";

let _resend: Resend | null = null;

export function getResendClient(): Resend {
  if (_resend) return _resend;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("[email] RESEND_API_KEY is not set");
  _resend = new Resend(apiKey);
  return _resend;
}
