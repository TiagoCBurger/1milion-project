import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerSearchTools } from "../../tools/search";
import { createToolCapture, parseToolResult, createMockEnv } from "../helpers";

vi.mock("../../meta-api", async () => {
  const actual = await vi.importActual<typeof import("../../meta-api")>("../../meta-api");
  return {
    ...actual,
    metaApiGet: vi.fn(),
  };
});

import { metaApiGet } from "../../meta-api";

const TOKEN = "test_meta_token";

describe("Search Tools", () => {
  let callTool: (name: string, args: Record<string, unknown>) => Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    const capture = createToolCapture();
    callTool = capture.callTool;
    registerSearchTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), workspaceId: "test-ws" });
  });

  describe("search", () => {
    it("searches accounts and businesses by name", async () => {
      (metaApiGet as any)
        .mockResolvedValueOnce({
          data: [
            { id: "act_1", name: "Acme Ads" },
            { id: "act_2", name: "Other Company" },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { id: "biz_1", name: "Acme Corp" },
          ],
        });

      const result = await callTool("search", {
        query: "acme",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.results).toHaveLength(2); // "Acme Ads" + "Acme Corp"
      expect(data.results[0].type).toBe("ad_account");
      expect(data.results[1].type).toBe("business");
    });

    it("returns empty when no matches", async () => {
      (metaApiGet as any)
        .mockResolvedValueOnce({ data: [{ id: "act_1", name: "Foo" }] })
        .mockResolvedValueOnce({ data: [] });

      const result = await callTool("search", {
        query: "nonexistent",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.results).toHaveLength(0);
      expect(data.total).toBe(0);
    });
  });

  describe("fetch", () => {
    it("fetches object by ID", async () => {
      (metaApiGet as any).mockResolvedValue({
        id: "123456",
        name: "Test Object",
      });

      const result = await callTool("fetch", {
        id: "123456",
      });

      expect(metaApiGet).toHaveBeenCalledWith("123456", TOKEN, {
        fields: "id,name",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.name).toBe("Test Object");
    });

    it("returns error from API", async () => {
      (metaApiGet as any).mockResolvedValue({
        error: { message: "Object not found" },
      });

      const result = await callTool("fetch", {
        id: "invalid_id",
      });

      expect((result as any).isError).toBe(true);
    });
  });

  describe("search_pages_by_name", () => {
    it("returns pages for an account", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          { id: "page_1", name: "My Page", category: "Business" },
          { id: "page_2", name: "Other Page", category: "Blog" },
        ],
      });

      const result = await callTool("search_pages_by_name", {
        account_id: "123",
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "act_123/promote_pages",
        TOKEN,
        expect.any(Object),
      );

      const data = parseToolResult(result as any) as any;
      expect(data.pages).toHaveLength(2);
      expect(data.total).toBe(2);
    });

    it("filters pages by search term", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          { id: "page_1", name: "My Page" },
          { id: "page_2", name: "Other Page" },
        ],
      });

      const result = await callTool("search_pages_by_name", {
        account_id: "act_123",
        search_term: "My",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.pages).toHaveLength(1);
      expect(data.pages[0].name).toBe("My Page");
    });

    it("performs case-insensitive search", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [{ id: "page_1", name: "UPPERCASE Page" }],
      });

      const result = await callTool("search_pages_by_name", {
        account_id: "act_123",
        search_term: "uppercase",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.pages).toHaveLength(1);
    });
  });
});
