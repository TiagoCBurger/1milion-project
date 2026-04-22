// Optional HMAC verification for user_id.
//
// Without a signature, any client knowing a site's public_key can forge events
// with arbitrary user_ids and pollute user_profiles / CAPI match quality. When
// the site's backend authenticates a visitor it should mint a short HMAC-SHA256
// signature over `${site_id}.${user_id}` using USER_ID_SIGNING_KEY and hand it
// to the tracker (`vibefly('identify', { user_id, user_id_sig })`). The worker
// then refuses to perform identified writes unless the signature verifies.
//
// If USER_ID_SIGNING_KEY is unset (legacy/self-hosted), verification is
// disabled and a warning is logged on first use — the worker falls back to the
// previous behavior so rollout can be staged.

let warnedOnce = false;

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const keyBytes = hexToBytes(key) ?? new TextEncoder().encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface UserIdAuthInput {
  signingKey: string | undefined;
  siteId: string;
  userId: string;
  signature: string | undefined;
}

export async function isUserIdTrusted(input: UserIdAuthInput): Promise<boolean> {
  if (!input.signingKey) {
    if (!warnedOnce) {
      console.warn(
        "track-worker: USER_ID_SIGNING_KEY not set — user_id writes are unauthenticated",
      );
      warnedOnce = true;
    }
    return true;
  }
  if (!input.signature) return false;
  const expected = await hmacSha256Hex(
    input.signingKey,
    `${input.siteId}.${input.userId}`,
  );
  return timingSafeEqualHex(expected, input.signature.toLowerCase());
}
