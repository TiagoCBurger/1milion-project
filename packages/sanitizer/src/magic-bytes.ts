// ============================================================
// Magic-byte detection for image and video MIME types.
//
// Why magic-byte and not the Content-Type header?
//   The header is set by the client and trivially spoofable.
//   The first bytes of the file are the actual format signature
//   used by every renderer/parser, so we treat them as truth.
//
// SVG is intentionally NOT detected here — even legitimate SVGs
// can carry <script>. We block the format upstream via the MIME
// allow-list. If that ever changes, add a dedicated sanitizer
// (DOMPurify-equivalent) before serving.
// ============================================================

export interface DetectedMime {
  mime: string;
  ext: string;
}

const MAGIC_TABLE: Array<{
  mime: string;
  ext: string;
  match: (b: Uint8Array) => boolean;
}> = [
  // JPEG: FF D8 FF
  {
    mime: "image/jpeg",
    ext: "jpg",
    match: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    mime: "image/png",
    ext: "png",
    match: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  // WEBP: "RIFF????WEBP" — 4-byte RIFF + 4 size bytes + "WEBP"
  {
    mime: "image/webp",
    ext: "webp",
    match: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 && // R
      b[1] === 0x49 && // I
      b[2] === 0x46 && // F
      b[3] === 0x46 && // F
      b[8] === 0x57 && // W
      b[9] === 0x45 && // E
      b[10] === 0x42 && // B
      b[11] === 0x50, // P
  },
  // GIF: "GIF87a" or "GIF89a" — accepted at detection but excluded from
  // the image allow-list (no creative format on Meta needs GIF, and the
  // format frequently carries polyglots).
  {
    mime: "image/gif",
    ext: "gif",
    match: (b) =>
      b.length >= 6 &&
      b[0] === 0x47 && // G
      b[1] === 0x49 && // I
      b[2] === 0x46 && // F
      b[3] === 0x38 && // 8
      (b[4] === 0x37 || b[4] === 0x39) && // 7 or 9
      b[5] === 0x61, // a
  },
  // MP4 / MOV: bytes 4..8 spell "ftyp"
  {
    mime: "video/mp4",
    ext: "mp4",
    match: (b) =>
      b.length >= 12 &&
      b[4] === 0x66 && // f
      b[5] === 0x74 && // t
      b[6] === 0x79 && // y
      b[7] === 0x70 && // p
      // mp4 brands: isom, mp41, mp42, avc1, dash, iso2, etc. Any non-"qt  " brand → mp4.
      !(b[8] === 0x71 && b[9] === 0x74),
  },
  {
    mime: "video/quicktime",
    ext: "mov",
    match: (b) =>
      b.length >= 12 &&
      b[4] === 0x66 &&
      b[5] === 0x74 &&
      b[6] === 0x79 &&
      b[7] === 0x70 &&
      b[8] === 0x71 && // q
      b[9] === 0x74, // t
  },
];

export function detectMagicBytes(buf: Uint8Array): DetectedMime | null {
  for (const entry of MAGIC_TABLE) {
    if (entry.match(buf)) {
      return { mime: entry.mime, ext: entry.ext };
    }
  }
  return null;
}
