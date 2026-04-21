// ============================================================
// sharp-based ImageReEncoder — neutralizes polyglots, strips EXIF,
// downscales to a safe max dimension, normalizes colorspace.
// Implements the @vibefly/sanitizer ImageReEncoder contract.
// ============================================================

import sharp from "sharp";
import type {
  ImageReEncoder,
  ReEncodedImage,
  ReEncoderOptions,
} from "@vibefly/sanitizer";
import type { AllowedImageMime } from "@vibefly/shared";

const DEFAULT_MAX_DIM = 1920;
const DEFAULT_QUALITY = 85;

const MIME_TO_FORMAT: Record<AllowedImageMime, "jpeg" | "png" | "webp"> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

export const reEncodeImage: ImageReEncoder = async (
  buf,
  detectedMime,
  opts: ReEncoderOptions = {},
): Promise<ReEncodedImage> => {
  const target = opts.targetMime ?? detectedMime;
  const format = MIME_TO_FORMAT[target];
  const maxDim = opts.maxDimension ?? DEFAULT_MAX_DIM;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  // sharp() with `failOn: 'warning'` rejects truncated/malformed inputs that
  // some parsers would tolerate. `limitInputPixels` caps decompression to
  // avoid pixel bombs (a 50KB PNG can declare 50000x50000).
  const pipeline = sharp(buf, {
    failOn: "warning",
    limitInputPixels: 100_000_000, // 100 megapixels
  })
    .rotate() // honor EXIF orientation, then strip
    .resize({
      width: maxDim,
      height: maxDim,
      fit: "inside",
      withoutEnlargement: true,
    });

  let formatted: sharp.Sharp;
  if (format === "jpeg") {
    formatted = pipeline.jpeg({ quality, mozjpeg: true });
  } else if (format === "webp") {
    formatted = pipeline.webp({ quality });
  } else {
    formatted = pipeline.png({ compressionLevel: 9 });
  }

  // .toBuffer() with metadata: discards EXIF/XMP/ICC by default.
  const { data, info } = await formatted.toBuffer({ resolveWithObject: true });

  return {
    buf: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    mime: target,
    width: info.width,
    height: info.height,
  };
};
