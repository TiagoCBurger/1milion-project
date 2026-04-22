import { describe, it, expect } from "vitest";
import { shouldSendToCapi } from "../sinks/meta-capi";
import type { AnalyticsPayload } from "../types";

const base: AnalyticsPayload = {
  public_key: "pk",
  event_type: "pageview",
  url: "https://x.com/",
  session_id: "s",
};

describe("shouldSendToCapi", () => {
  it("sends pageview", () => {
    expect(shouldSendToCapi(base)).toBe(true);
  });

  it("sends Meta standard custom events", () => {
    expect(
      shouldSendToCapi({ ...base, event_type: "custom", event_name: "Purchase" }),
    ).toBe(true);
    expect(
      shouldSendToCapi({ ...base, event_type: "custom", event_name: "Lead" }),
    ).toBe(true);
  });

  it("skips non-standard custom events", () => {
    expect(
      shouldSendToCapi({ ...base, event_type: "custom", event_name: "ScrolledFooter" }),
    ).toBe(false);
  });

  it("skips outbound/performance/identify", () => {
    expect(shouldSendToCapi({ ...base, event_type: "outbound" })).toBe(false);
    expect(shouldSendToCapi({ ...base, event_type: "performance" })).toBe(false);
    expect(shouldSendToCapi({ ...base, event_type: "identify" })).toBe(false);
  });
});
