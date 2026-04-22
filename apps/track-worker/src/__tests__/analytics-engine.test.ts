import { describe, it, expect, vi } from "vitest";
import { writeEvent } from "../sinks/analytics-engine";
import type { Env } from "../types";

describe("writeEvent", () => {
  it("maps fields to AE slots (20 blobs, 10 doubles, site_id index)", () => {
    const writeDataPoint = vi.fn();
    const env = { ANALYTICS: { writeDataPoint } } as unknown as Env;

    writeEvent(env, {
      site_id: "site-1",
      event_type: "pageview",
      session_id: "s1",
      hostname: "example.com",
      pathname: "/",
      channel: "direct",
      country: "US",
      browser: "Chrome",
      os: "macOS",
      device_type: "desktop",
      screen_width: 1920,
      screen_height: 1080,
      lcp: 1234,
    });

    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const point = writeDataPoint.mock.calls[0][0];
    expect(point.indexes).toEqual(["site-1"]);
    expect(point.blobs).toHaveLength(20);
    expect(point.doubles).toHaveLength(10);
    expect(point.blobs[0]).toBe("pageview");
    expect(point.blobs[2]).toBe("s1");
    expect(point.blobs[4]).toBe("example.com");
    expect(point.blobs[9]).toBe("direct");
    expect(point.blobs[15]).toBe("US");
    expect(point.blobs[17]).toBe("Chrome");
    expect(point.doubles[0]).toBe(0);
    expect(point.doubles[1]).toBe(1920);
    expect(point.doubles[5]).toBe(1234);
  });

  it("coerces missing fields to empty strings / zero", () => {
    const writeDataPoint = vi.fn();
    const env = { ANALYTICS: { writeDataPoint } } as unknown as Env;
    writeEvent(env, {
      site_id: "x",
      event_type: "custom",
      session_id: "s",
      hostname: "h",
      pathname: "/",
      channel: "direct",
    });
    const point = writeDataPoint.mock.calls[0][0];
    expect(point.blobs.every((b: unknown) => typeof b === "string")).toBe(true);
    expect(point.doubles.every((d: unknown) => typeof d === "number")).toBe(true);
  });
});
