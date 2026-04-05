/**
 * SHA-256 hash a value after normalizing it (lowercase, trim).
 * Returns hex string. Uses crypto.subtle (native in Workers).
 */
export async function sha256(value: string): Promise<string> {
  const normalized = value.toLowerCase().trim();
  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Normalize and hash a phone number.
 * Strips non-digit characters (except leading +), then hashes.
 */
export async function hashPhone(phone: string): Promise<string> {
  const cleaned = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  return sha256(cleaned);
}

/**
 * Hash a value only if it's a non-empty string.
 * Returns undefined otherwise.
 */
export async function hashIfPresent(value: string | undefined): Promise<string | undefined> {
  if (!value || value.trim() === "") return undefined;
  return sha256(value);
}
