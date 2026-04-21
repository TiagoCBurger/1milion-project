export { detectMagicBytes } from "./magic-bytes";
export type { DetectedMime } from "./magic-bytes";

export { validateMime } from "./mime";
export type { ValidationResult } from "./mime";

export { sha256Hex, isValidSha256Hex } from "./sha";

export {
  isPrivateAddress,
  isPrivateIpv4,
  isPrivateIpv6,
  validateExternalUrl,
  safeFetch,
} from "./ssrf";
export type {
  SafeFetchOptions,
  SafeFetchResult,
  SafeFetchSuccess,
  SafeFetchError,
} from "./ssrf";

export { isTinyImage } from "./re-encode";
export type {
  ImageReEncoder,
  ReEncodedImage,
  ReEncoderOptions,
} from "./re-encode";
