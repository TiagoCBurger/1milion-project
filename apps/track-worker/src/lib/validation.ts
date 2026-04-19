import { z } from "zod";

export const analyticsUserSchema = z.object({
  id: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  external_id: z.string().optional(),
  traits: z.record(z.unknown()).optional(),
});

export const webVitalsSchema = z.object({
  lcp: z.number().optional(),
  cls: z.number().optional(),
  inp: z.number().optional(),
  fcp: z.number().optional(),
  ttfb: z.number().optional(),
});

export const analyticsPayloadSchema = z.object({
  public_key: z.string().min(1),
  event_type: z.enum(["pageview", "custom", "outbound", "performance", "identify"]),
  event_name: z.string().max(128).optional(),
  event_id: z.string().max(128).optional(),
  url: z.string().url(),
  referrer: z.string().optional(),
  page_title: z.string().max(512).optional(),
  session_id: z.string().min(1).max(64),
  user_id: z.string().max(128).optional(),
  screen_width: z.number().int().nonnegative().optional(),
  screen_height: z.number().int().nonnegative().optional(),
  timezone: z.string().max(64).optional(),
  language: z.string().max(16).optional(),
  props: z.record(z.unknown()).optional(),
  user: analyticsUserSchema.optional(),
  web_vitals: webVitalsSchema.optional(),
  value: z.number().optional(),
  currency: z.string().length(3).optional(),
  outbound_url: z.string().url().optional(),
});

export type ValidatedPayload = z.infer<typeof analyticsPayloadSchema>;
