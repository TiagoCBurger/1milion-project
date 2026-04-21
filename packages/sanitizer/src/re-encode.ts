// ============================================================
// Re-encoder interface — neutralizes polyglots, strips EXIF,
// normalizes color profile, kills any embedded hostile metadata.
//
// Implementation lives in the consuming app (sharp in Node,
// wasm-vips in Workers). This package only declares the contract
// so business logic can depend on the abstraction.
// ============================================================

import type { AllowedImageMime } from "@vibefly/shared";

export interface ReEncodedImage {
  buf: Uint8Array;
  mime: AllowedImageMime;
  width: number;
  height: number;
}

export interface ReEncoderOptions {
  /** Target output MIME (defaults to whatever was detected). */
  targetMime?: AllowedImageMime;
  /** Max width/height (Meta caps creatives at ~1920px). */
  maxDimension?: number;
  /** JPEG/WebP quality 1..100 (defaults to 85). */
  quality?: number;
}

export type ImageReEncoder = (
  buf: Uint8Array,
  detectedMime: AllowedImageMime,
  opts?: ReEncoderOptions,
) => Promise<ReEncodedImage>;

/**
 * Returns true when the given Uint8Array is small enough that re-encoding
 * adds no real cost — useful for skipping the round-trip in tight loops.
 * Currently advisory; the sanitize pipeline always re-encodes regardless.
 */
export function isTinyImage(buf: Uint8Array): boolean {
  return buf.length < 8 * 1024;
}
