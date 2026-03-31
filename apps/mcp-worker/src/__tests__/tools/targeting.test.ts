import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerTargetingTools } from "../../tools/targeting";
import { createToolCapture, parseToolResult } from "../helpers";

vi.mock("../../meta-api", async () => {
  const actual = await vi.importActual<typeof import("../../meta-api")>("../../meta-api");
  return {
    ...actual,
    metaApiGet: vi.fn(),
  };
});

import { metaApiGet } from "../../meta-api";

const TOKEN = "test_meta_token";

describe("Targeting Tools", () => {
  let callTool: (name: string, args: Record<string, unknown>) => Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    const capture = createToolCapture();
    callTool = capture.callTool;
    registerTargetingTools(capture.server, TOKEN, "pro");
  });

  describe("search_interests", () => {
    it("searches for interests with correct params", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          { id: "6003139266461", name: "Movies", audience_size: 1234567890 },
          { id: "6003397425735", name: "Tennis", audience_size: 987654321 },
        ],
      });

      const result = await callTool("search_interests", {
        query: "movies",
        limit: 10,
      });

      expect(metaApiGet).toHaveBeenCalledWith("search", TOKEN, {
        type: "adinterest",
        q: "movies",
        limit: 10,
      });

      const data = parseToolResult(result as any) as any;
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe("Movies");
    });

    it("handles API error", async () => {
      (metaApiGet as any).mockResolvedValue({
        error: { message: "Invalid token" },
      });

      const result = await callTool("search_interests", {
        query: "test",
        limit: 25,
      });

      expect((result as any).isError).toBe(true);
    });
  });

  describe("get_interest_suggestions", () => {
    it("gets suggestions based on interest list", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          { id: "6003022269556", name: "Rugby football", audience_size: 13214830 },
        ],
      });

      const result = await callTool("get_interest_suggestions", {
        interest_list: ["Basketball", "Soccer"],
        limit: 15,
      });

      expect(metaApiGet).toHaveBeenCalledWith("search", TOKEN, {
        type: "adinterestsuggestion",
        interest_list: JSON.stringify(["Basketball", "Soccer"]),
        limit: 15,
      });

      const data = parseToolResult(result as any) as any;
      expect(data.data).toHaveLength(1);
    });
  });

  describe("estimate_audience_size", () => {
    it("returns formatted audience estimate with midpoint", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: {
          users_lower_bound: 1000000,
          users_upper_bound: 2000000,
        },
      });

      const result = await callTool("estimate_audience_size", {
        account_id: "act_123",
        targeting: '{"geo_locations":{"countries":["US"]}}',
        optimization_goal: "REACH",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.users_lower_bound).toBe(1000000);
      expect(data.users_upper_bound).toBe(2000000);
      expect(data.estimated_audience_size).toBe(1500000);
    });

    it("returns error for invalid targeting JSON", async () => {
      const result = await callTool("estimate_audience_size", {
        account_id: "act_123",
        targeting: "not valid json",
        optimization_goal: "REACH",
      });

      expect((result as any).isError).toBe(true);
      const data = parseToolResult(result as any) as any;
      expect(data.error).toContain("Invalid JSON");
    });

    it("ensures act_ prefix on account_id", async () => {
      (metaApiGet as any).mockResolvedValue({ data: {} });

      await callTool("estimate_audience_size", {
        account_id: "123",
        targeting: '{"geo_locations":{"countries":["US"]}}',
        optimization_goal: "REACH",
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "act_123/reachestimate",
        TOKEN,
        expect.any(Object),
      );
    });
  });

  describe("search_behaviors", () => {
    it("returns behavior categories", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          {
            id: 6007101597783,
            name: "Business Travelers",
            type: "behaviors",
          },
        ],
      });

      const result = await callTool("search_behaviors", {
        limit: 50,
      });

      expect(metaApiGet).toHaveBeenCalledWith("search", TOKEN, {
        type: "adTargetingCategory",
        class: "behaviors",
        limit: 50,
      });

      const data = parseToolResult(result as any) as any;
      expect(data.data[0].name).toBe("Business Travelers");
    });
  });

  describe("search_demographics", () => {
    it("searches demographics by class", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [{ id: 6015559470583, name: "Parents (All)" }],
      });

      const result = await callTool("search_demographics", {
        demographic_class: "life_events",
        limit: 30,
      });

      expect(metaApiGet).toHaveBeenCalledWith("search", TOKEN, {
        type: "adTargetingCategory",
        class: "life_events",
        limit: 30,
      });
    });
  });

  describe("search_geo_locations", () => {
    it("searches locations with type filter", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          { key: "US", name: "United States", type: "country" },
          { key: "3847", name: "California", type: "region" },
        ],
      });

      const result = await callTool("search_geo_locations", {
        query: "United States",
        location_types: ["country", "region"],
        limit: 10,
      });

      expect(metaApiGet).toHaveBeenCalledWith("search", TOKEN, {
        type: "adgeolocation",
        q: "United States",
        location_types: JSON.stringify(["country", "region"]),
        limit: 10,
      });

      const data = parseToolResult(result as any) as any;
      expect(data.data).toHaveLength(2);
    });

    it("searches without location_types filter", async () => {
      (metaApiGet as any).mockResolvedValue({ data: [] });

      await callTool("search_geo_locations", {
        query: "test",
        limit: 25,
      });

      const callArgs = (metaApiGet as any).mock.calls[0][2];
      expect(callArgs.location_types).toBeUndefined();
    });
  });
});
