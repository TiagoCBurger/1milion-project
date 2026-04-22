import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerLibraryTools } from "../../tools/library";
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

describe("Library Tools", () => {
  let callTool: (name: string, args: Record<string, unknown>) => Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    const capture = createToolCapture();
    callTool = capture.callTool;
    registerLibraryTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), organizationId: "test-ws" });
  });

  describe("search_ads_archive", () => {
    it("searches ads archive with correct params", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          {
            page_name: "Nike",
            ad_creative_body: "Just Do It",
            impressions: { lower_bound: "1000" },
          },
        ],
      });

      const result = await callTool("search_ads_archive", {
        search_terms: "running shoes",
        ad_reached_countries: ["US", "GB"],
        ad_type: "ALL",
        limit: 25,
      });

      expect(metaApiGet).toHaveBeenCalledWith("ads_archive", TOKEN, {
        search_terms: "running shoes",
        ad_type: "ALL",
        ad_reached_countries: JSON.stringify(["US", "GB"]),
        limit: 25,
        fields: expect.stringContaining("page_name"),
      });

      const data = parseToolResult(result as any) as any;
      expect(data.data).toHaveLength(1);
    });

    it("handles API error", async () => {
      (metaApiGet as any).mockResolvedValue({
        error: { message: "Rate limit exceeded" },
      });

      const result = await callTool("search_ads_archive", {
        search_terms: "test",
        ad_reached_countries: ["US"],
        ad_type: "ALL",
        limit: 10,
      });

      expect((result as any).isError).toBe(true);
    });
  });
});
