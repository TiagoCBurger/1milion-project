// ============================================================
// SHA-256 helpers using Web Crypto (works in Node 18+ and Workers).
// ============================================================

export async function sha256Hex(buf: Uint8Array | ArrayBuffer): Promise<string> {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // Web Crypto requires an ArrayBuffer; copy via a fresh Uint8Array view to
  // detach from any underlying SharedArrayBuffer.
  const data = new Uint8Array(view).buffer;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest);
}

export function isValidSha256Hex(s: string): boolean {
  return /^[a-f0-9]{64}$/.test(s);
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}
