import { ALLOWED_IMAGE_MIMES, ALLOWED_VIDEO_MIMES } from "@vibefly/shared";
import { detectMagicBytes } from "./magic-bytes";

export type ValidationResult =
  | { ok: true; actual: string; ext: string }
  | { ok: false; reason: string; actual?: string };

interface ValidateOptions {
  declaredMime: string;
  kind: "image" | "video";
  /**
   * If true, treat declared MIME mismatch (declared !== detected) as a hard
   * failure. We default to true because every legitimate flow controls both
   * sides — clients have no reason to mis-declare unless they're attacking.
   */
  strictDeclaredMatch?: boolean;
}

export function validateMime(
  buf: Uint8Array,
  opts: ValidateOptions,
): ValidationResult {
  if (buf.length === 0) {
    return { ok: false, reason: "empty buffer" };
  }

  const detected = detectMagicBytes(buf);
  if (!detected) {
    return {
      ok: false,
      reason: "unknown format (magic bytes did not match any known image/video signature)",
    };
  }

  const allowList: readonly string[] =
    opts.kind === "image" ? ALLOWED_IMAGE_MIMES : ALLOWED_VIDEO_MIMES;

  if (!allowList.includes(detected.mime)) {
    return {
      ok: false,
      reason: `format ${detected.mime} not allowed for ${opts.kind} creatives`,
      actual: detected.mime,
    };
  }

  if (opts.strictDeclaredMatch !== false) {
    // Allow image/jpg as alias for image/jpeg in declared field.
    const normalizedDeclared = opts.declaredMime === "image/jpg"
      ? "image/jpeg"
      : opts.declaredMime;

    if (normalizedDeclared !== detected.mime) {
      return {
        ok: false,
        reason: `declared MIME ${opts.declaredMime} does not match detected ${detected.mime}`,
        actual: detected.mime,
      };
    }
  }

  return { ok: true, actual: detected.mime, ext: detected.ext };
}
