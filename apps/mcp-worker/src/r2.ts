import type { Env } from "./types";

// ============================================================
// MIME type detection from base64 data (images only)
//
// Ordered from most-specific prefix to least-specific so the
// loop short-circuits correctly.
// ============================================================

export function detectMimeType(base64: string): { mime: string; ext: string } {
  // Handle data URI format: "data:image/png;base64,..."
  const dataUriMatch = base64.match(/^data:([^;]+);base64,/);
  if (dataUriMatch) {
    const mime = dataUriMatch[1];
    const ext = mime.split("/")[1].replace("jpeg", "jpg");
    return { mime, ext };
  }

  // Detect from raw base64 magic bytes (images only).
  // Prefixes are ordered longest-first so shorter ones don't shadow them.
  const magicMap: [string, string, string][] = [
    ["iVBORw0KGgo", "image/png", "png"],
    ["R0lGODlh", "image/gif", "gif"],
    ["R0lGODdh", "image/gif", "gif"],
    ["UklGR", "image/webp", "webp"],
    ["/9j/", "image/jpeg", "jpg"],
  ];

  for (const [prefix, mime, ext] of magicMap) {
    if (base64.startsWith(prefix)) return { mime, ext };
  }

  return { mime: "application/octet-stream", ext: "bin" };
}

// ============================================================
// Strip data URI prefix
// ============================================================

export function stripDataUri(base64: string): string {
  const idx = base64.indexOf(",");
  if (idx !== -1 && base64.startsWith("data:")) {
    return base64.slice(idx + 1);
  }
  return base64;
}

// ============================================================
// Estimate file size from base64 string
// ============================================================

export function estimateBase64Size(base64: string): number {
  const raw = stripDataUri(base64);
  return Math.ceil(raw.length * 3 / 4);
}

// ============================================================
// Decode base64 to Uint8Array without Array.from overhead
// ============================================================

function decodeBase64(raw: string): Uint8Array {
  const binaryStr = atob(raw);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

// ============================================================
// Upload to R2 (images only — videos must use presigned URL)
// ============================================================

export interface R2UploadResult {
  key: string;
  publicUrl: string;
  size: number;
}

export async function uploadToR2(
  env: Env,
  workspaceId: string,
  type: "images",
  name: string,
  base64Data: string
): Promise<R2UploadResult> {
  const { mime, ext } = detectMimeType(base64Data);
  const raw = stripDataUri(base64Data);
  const bytes = decodeBase64(raw);

  const timestamp = Date.now();
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const key = `${workspaceId}/${type}/${timestamp}_${safeName}.${ext}`;

  await env.CREATIVES_R2.put(key, bytes, {
    httpMetadata: { contentType: mime },
  });

  const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;

  return { key, publicUrl, size: bytes.length };
}
