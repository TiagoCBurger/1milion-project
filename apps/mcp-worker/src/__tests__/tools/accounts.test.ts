import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerAccountsTools } from "../../tools/accounts";
import { createToolCapture, parseToolResult, createMockEnv } from "../helpers";

// Mock the Meta API module
vi.mock("../../meta-api", async () => {
  const actual = await vi.importActual<typeof import("../../meta-api")>("../../meta-api");
  return {
    ...actual,
    metaApiGet: vi.fn(),
    metaApiPost: vi.fn(),
  };
});

import { metaApiGet } from "../../meta-api";

const TOKEN = "test_meta_token";

describe("Account Tools", () => {
  let callTool: (name: string, args: Record<string, unknown>) => Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    const capture = createToolCapture();
    callTool = capture.callTool;
    registerAccountsTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), organizationId: "test-ws" });
  });

  describe("get_ad_accounts", () => {
    it("returns normalized accounts with monetary conversion", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          {
            id: "act_123",
            name: "Test Account",
            account_id: "123",
            currency: "USD",
            amount_spent: 15000,
            balance: 5000,
          },
        ],
        paging: {},
      });

      const result = await callTool("get_ad_accounts", {
        user_id: "me",
        limit: 200,
      });

      const data = parseToolResult(result as any) as any;
      expect(data.accounts).toHaveLength(1);
      expect(data.accounts[0].amount_spent).toBe("150.00");
      expect(data.accounts[0].balance).toBe("50.00");
    });

    it("passes correct params to Meta API", async () => {
      (metaApiGet as any).mockResolvedValue({ data: [] });

      await callTool("get_ad_accounts", {
        user_id: "me",
        limit: 50,
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "me/adaccounts",
        TOKEN,
        expect.objectContaining({
          fields: expect.stringContaining("id,name"),
          limit: 50,
        }),
      );
    });

    it("returns error when API errors", async () => {
      (metaApiGet as any).mockResolvedValue({
        error: { message: "Invalid token" },
      });

      const result = await callTool("get_ad_accounts", {
        user_id: "me",
        limit: 200,
      });

      expect((result as any).isError).toBe(true);
    });
  });

  describe("get_account_info", () => {
    it("returns account info with ensureActPrefix", async () => {
      (metaApiGet as any).mockResolvedValue({
        id: "act_123",
        name: "Test Account",
        currency: "USD",
        amount_spent: 10000,
        balance: 2000,
      });

      const result = await callTool("get_account_info", {
        account_id: "123",
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "act_123",
        TOKEN,
        expect.any(Object),
      );

      const data = parseToolResult(result as any) as any;
      expect(data.amount_spent).toBe("100.00");
    });

    it("detects DSA requirement for EU countries", async () => {
      (metaApiGet as any).mockResolvedValue({
        id: "act_123",
        name: "EU Account",
        currency: "EUR",
        business_country_code: "DE",
      });

      const result = await callTool("get_account_info", {
        account_id: "act_123",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.dsa_required).toBe(true);
    });

    it("does not set DSA for non-EU countries", async () => {
      (metaApiGet as any).mockResolvedValue({
        id: "act_123",
        name: "US Account",
        currency: "USD",
        business_country_code: "US",
      });

      const result = await callTool("get_account_info", {
        account_id: "act_123",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.dsa_required).toBeUndefined();
    });

    it("suggests accessible accounts on permission error", async () => {
      (metaApiGet as any)
        .mockResolvedValueOnce({
          error: { message: "No access to this account" },
        })
        .mockResolvedValueOnce({
          data: [{ id: "act_456", name: "Accessible Account" }],
        });

      const result = await callTool("get_account_info", {
        account_id: "act_789",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.suggestion).toContain("access");
      expect(data.accessible_accounts).toHaveLength(1);
    });
  });

  describe("get_account_pages", () => {
    it("returns user pages when account_id is 'me'", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          { id: "111", name: "My Page", category: "Business" },
        ],
      });

      const result = await callTool("get_account_pages", {
        account_id: "me",
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "me/accounts",
        TOKEN,
        expect.any(Object),
      );

      const data = parseToolResult(result as any) as any;
      expect(data.pages).toHaveLength(1);
      expect(data.pages[0].name).toBe("My Page");
    });

    it("merges user pages and owned pages for account ID", async () => {
      (metaApiGet as any)
        .mockResolvedValueOnce({
          data: [{ id: "111", name: "User Page" }],
        })
        .mockResolvedValueOnce({
          data: [
            { id: "111", name: "User Page" }, // duplicate
            { id: "222", name: "Owned Page" },
          ],
        });

      const result = await callTool("get_account_pages", {
        account_id: "act_123",
      });

      const data = parseToolResult(result as any) as any;
      // Should deduplicate by ID
      expect(data.pages).toHaveLength(2);
      expect(data.total).toBe(2);
    });
  });
});
