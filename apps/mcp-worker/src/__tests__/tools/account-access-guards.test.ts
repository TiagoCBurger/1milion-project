import { describe, it, expect } from "vitest";
import { isAccountAllowed, accountBlockedResult } from "../../tools/index";

describe("isAccountAllowed", () => {
  it("returns true when allowedAccounts is undefined", () => {
    expect(isAccountAllowed("act_123", undefined)).toBe(true);
  });

  it("returns false when allowedAccounts is empty array", () => {
    expect(isAccountAllowed("act_123", [])).toBe(false);
  });

  it("returns true when account is in the allowed list", () => {
    expect(isAccountAllowed("act_123", ["act_123", "act_456"])).toBe(true);
  });

  it("returns false when account is NOT in the allowed list", () => {
    expect(isAccountAllowed("act_999", ["act_123", "act_456"])).toBe(false);
  });

  it("normalizes act_ prefix: allowed has 'act_123', input is '123'", () => {
    expect(isAccountAllowed("123", ["act_123"])).toBe(true);
  });

  it("normalizes act_ prefix: allowed has '123', input is 'act_123'", () => {
    expect(isAccountAllowed("act_123", ["123"])).toBe(true);
  });

  it("handles mixed formats in allowedAccounts", () => {
    const allowed = ["act_111", "222", "act_333"];
    expect(isAccountAllowed("111", allowed)).toBe(true);
    expect(isAccountAllowed("act_222", allowed)).toBe(true);
    expect(isAccountAllowed("333", allowed)).toBe(true);
    expect(isAccountAllowed("444", allowed)).toBe(false);
  });

  it("does not match partial IDs", () => {
    expect(isAccountAllowed("act_12", ["act_123"])).toBe(false);
    expect(isAccountAllowed("act_1234", ["act_123"])).toBe(false);
  });
});

describe("accountBlockedResult", () => {
  it("returns isError: true", () => {
    const result = accountBlockedResult("act_123");
    expect(result.isError).toBe(true);
  });

  it("returns content array with single text entry", () => {
    const result = accountBlockedResult("act_123");
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
  });

  it("includes 'Access denied' in the error JSON", () => {
    const result = accountBlockedResult("act_123");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("Access denied");
  });

  it("includes the account ID in the error message", () => {
    const result = accountBlockedResult("act_FOOBAR");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.message).toContain("act_FOOBAR");
  });
});
