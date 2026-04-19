import { describe, it, expect } from "vitest";
import { analyticsPayloadSchema } from "../lib/validation";

describe("analyticsPayloadSchema", () => {
  const base = {
    public_key: "pk_abc123",
    event_type: "pageview" as const,
    url: "https://example.com/",
    session_id: "sess_123",
  };

  it("accepts minimal pageview", () => {
    expect(analyticsPayloadSchema.safeParse(base).success).toBe(true);
  });

  it("accepts custom event with props and event_id", () => {
    const r = analyticsPayloadSchema.safeParse({
      ...base,
      event_type: "custom",
      event_name: "Purchase",
      event_id: "evt_1",
      value: 49.9,
      currency: "BRL",
      props: { plan: "pro" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing public_key", () => {
    const r = analyticsPayloadSchema.safeParse({ ...base, public_key: "" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid url", () => {
    const r = analyticsPayloadSchema.safeParse({ ...base, url: "not-a-url" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown event_type", () => {
    const r = analyticsPayloadSchema.safeParse({ ...base, event_type: "weird" });
    expect(r.success).toBe(false);
  });

  it("rejects 4-letter currency", () => {
    const r = analyticsPayloadSchema.safeParse({ ...base, currency: "USDA" });
    expect(r.success).toBe(false);
  });
});
