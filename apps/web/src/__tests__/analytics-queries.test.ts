import { describe, it, expect } from "vitest";
import { assertUuid, quoteLiteral } from "@/lib/analytics/ae-client";
import { overviewSql, timeseriesSql, topSql, liveSql } from "@/lib/analytics/queries";

const SITE = "11111111-2222-3333-4444-555555555555";
const START = new Date("2026-01-01T00:00:00Z");
const END = new Date("2026-01-08T00:00:00Z");

describe("ae-client sanitizers", () => {
  it("accepts valid UUID", () => {
    expect(assertUuid(SITE)).toBe(SITE);
  });

  it("rejects malformed UUID", () => {
    expect(() => assertUuid("not-a-uuid")).toThrow();
    expect(() => assertUuid("11111111-2222-3333-4444-55555555555X")).toThrow();
  });

  it("escapes single quotes and backslashes", () => {
    expect(quoteLiteral("O'Neil")).toBe("'O\\'Neil'");
    expect(quoteLiteral("a\\b")).toBe("'a\\\\b'");
  });
});

describe("SQL templates", () => {
  it("overviewSql filters by site_id + date range", () => {
    const sql = overviewSql(SITE, START, END);
    expect(sql).toContain(`index1 = '${SITE}'`);
    expect(sql).toContain("toDateTime('2026-01-01 00:00:00')");
    expect(sql).toContain("toDateTime('2026-01-08 00:00:00')");
    expect(sql).toContain("COUNT(DISTINCT blob3)");
    expect(sql).toContain("blob1 = 'pageview'");
  });

  it("timeseriesSql groups by hour or day", () => {
    expect(timeseriesSql(SITE, START, END, "hour")).toContain("INTERVAL 1 HOUR");
    expect(timeseriesSql(SITE, START, END, "day")).toContain("INTERVAL 1 DAY");
  });

  it("topSql maps dimension to correct blob slot and caps limit", () => {
    expect(topSql(SITE, START, END, "pathname", 10)).toContain("blob6");
    expect(topSql(SITE, START, END, "channel", 10)).toContain("blob10");
    expect(topSql(SITE, START, END, "country", 10)).toContain("blob16");
    expect(topSql(SITE, START, END, "device_type", 10)).toContain("blob20");
    expect(topSql(SITE, START, END, "pathname", 9999)).toContain("LIMIT 100");
    expect(topSql(SITE, START, END, "pathname", -5)).toContain("LIMIT 1");
  });

  it("liveSql uses 5 minute window", () => {
    expect(liveSql(SITE)).toContain("INTERVAL 5 MINUTE");
    expect(liveSql(SITE)).toContain(`index1 = '${SITE}'`);
  });

  it("rejects invalid site_id in overview", () => {
    expect(() => overviewSql("bad", START, END)).toThrow();
  });
});
