import { z } from "zod";

// Flat key/value map: keys up to 64 chars, values primitive (string ≤ 512,
// number, boolean, or null). Rejects nested objects/arrays so event props
// and user traits can't smuggle deep blobs or script-shaped payloads into
// JSONB columns that downstream UIs may render.
const MAX_KEYS = 20;
const MAX_KEY_LENGTH = 64;
const MAX_STRING_VALUE = 512;

const primitiveValue = z.union([
  z.string().max(MAX_STRING_VALUE),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const flatRecordSchema = z
  .record(primitiveValue)
  .refine(
    (obj) => Object.keys(obj).length <= MAX_KEYS,
    { message: `too many keys (max ${MAX_KEYS})` },
  )
  .refine(
    (obj) => Object.keys(obj).every((k) => k.length > 0 && k.length <= MAX_KEY_LENGTH),
    { message: `key length must be 1..${MAX_KEY_LENGTH}` },
  );

// E.164-ish: digits, optional leading +, optional spaces/dashes/parens. Meta
// hashes phones as digits-only, so the only thing we care about here is
// rejecting obviously bogus values before they land in traits.
const phoneRegex = /^\+?[0-9][0-9\s\-()]{5,31}$/;

export const analyticsUserSchema = z.object({
  id: z.string().max(128).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(32).regex(phoneRegex).optional(),
  first_name: z.string().max(64).optional(),
  last_name: z.string().max(64).optional(),
  external_id: z.string().max(128).optional(),
  traits: flatRecordSchema.optional(),
});

export const webVitalsSchema = z.object({
  lcp: z.number().optional(),
  cls: z.number().optional(),
  inp: z.number().optional(),
  fcp: z.number().optional(),
  ttfb: z.number().optional(),
});

export const analyticsPayloadSchema = z.object({
  public_key: z.string().min(1).max(128),
  event_type: z.enum(["pageview", "custom", "outbound", "performance", "identify"]),
  event_name: z.string().max(128).optional(),
  event_id: z.string().max(128).optional(),
  url: z.string().url().max(2048),
  referrer: z.string().max(2048).optional(),
  page_title: z.string().max(512).optional(),
  session_id: z.string().min(1).max(64),
  user_id: z.string().max(128).optional(),
  // HMAC-SHA256 hex digest of `${site_id}.${user_id}`. Required for
  // identified writes when USER_ID_SIGNING_KEY is configured.
  user_id_sig: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  screen_width: z.number().int().nonnegative().max(16384).optional(),
  screen_height: z.number().int().nonnegative().max(16384).optional(),
  timezone: z.string().max(64).optional(),
  language: z.string().max(16).optional(),
  props: flatRecordSchema.optional(),
  user: analyticsUserSchema.optional(),
  web_vitals: webVitalsSchema.optional(),
  value: z.number().finite().optional(),
  currency: z.string().length(3).optional(),
  outbound_url: z.string().url().max(2048).optional(),
});

export type ValidatedPayload = z.infer<typeof analyticsPayloadSchema>;
