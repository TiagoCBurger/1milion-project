import type { Env } from "./types";

// ============================================================
// MIME type detection from base64 data
// ============================================================

export function detectMimeType(base64: string): { mime: string; ext: string } {
  // Handle data URI format: "data:image/png;base64,..."
  const dataUriMatch = base64.match(/^data:([^;]+);base64,/);
  if (dataUriMatch) {
    const mime = dataUriMatch[1];
    const ext = mime.split("/")[1].replace("jpeg", "jpg");
    return { mime, ext };
  }

  // Detect from raw base64 magic bytes
  const magicMap: [string, string, string][] = [
    ["iVBORw0KGgo", "image/png", "png"],
    ["/9j/", "image/jpeg", "jpg"],
    ["R0lGOD", "image/gif", "gif"],
    ["UklGR", "image/webp", "webp"],
    ["AAAAIG", "video/mp4", "mp4"],
    ["AAAAH", "video/mp4", "mp4"],
    ["AAAA", "video/mp4", "mp4"],
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
// Upload to R2
// ============================================================

export interface R2UploadResult {
  key: string;
  publicUrl: string;
  size: number;
}

export async function uploadToR2(
  env: Env,
  workspaceId: string,
  type: "images" | "videos",
  name: string,
  base64Data: string
): Promise<R2UploadResult> {
  const { mime, ext } = detectMimeType(base64Data);
  const raw = stripDataUri(base64Data);
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));

  const timestamp = Date.now();
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const key = `${workspaceId}/${type}/${timestamp}_${safeName}.${ext}`;

  await env.CREATIVES_R2.put(key, bytes, {
    httpMetadata: { contentType: mime },
  });

  const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;

  return { key, publicUrl, size: bytes.length };
}
