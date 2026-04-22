import { describe, it, expect } from "vitest";
import { normalizeMetaAccountId } from "../project-ad-accounts";

describe("normalizeMetaAccountId", () => {
  it("strips act_ prefix", () => {
    expect(normalizeMetaAccountId("act_123")).toBe("123");
    expect(normalizeMetaAccountId("123")).toBe("123");
  });
});
