import { describe, it, expect } from "vitest";
import { intersectAllowedAccounts, normalizeMetaAccountId } from "../workspace-ad-accounts";

describe("normalizeMetaAccountId", () => {
  it("strips act_ prefix", () => {
    expect(normalizeMetaAccountId("act_123")).toBe("123");
    expect(normalizeMetaAccountId("123")).toBe("123");
  });
});

describe("intersectAllowedAccounts", () => {
  it("returns workspace list when OAuth filter is empty", () => {
    expect(intersectAllowedAccounts(["act_a", "act_b"], [])).toEqual(["act_a", "act_b"]);
    expect(intersectAllowedAccounts(["act_a", "act_b"], undefined)).toEqual([
      "act_a",
      "act_b",
    ]);
  });

  it("returns intersection preserving workspace ID format", () => {
    expect(
      intersectAllowedAccounts(["act_111", "act_222"], ["111", "999"]),
    ).toEqual(["act_111"]);
  });
});
