import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerInsightTools } from "../../tools/insights";
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

describe("Insight Tools", () => {
  let callTool: (name: string, args: Record<string, unknown>) => Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    const capture = createToolCapture();
    callTool = capture.callTool;
    registerInsightTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), workspaceId: "test-ws" });
  });

  describe("get_insights", () => {
    it("fetches insights with date preset", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          { impressions: "1000", clicks: "50", spend: "10.50" },
        ],
      });

      const result = await callTool("get_insights", {
        object_id: "act_123",
        time_range: "last_30d",
        level: "ad",
        limit: 25,
        compact: false,
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "act_123/insights",
        TOKEN,
        expect.objectContaining({
          date_preset: "last_30d",
          level: "ad",
        }),
      );

      const data = parseToolResult(result as any) as any;
      expect(data.data).toHaveLength(1);
    });

    it("uses custom time range when JSON provided", async () => {
      (metaApiGet as any).mockResolvedValue({ data: [] });

      await callTool("get_insights", {
        object_id: "camp_1",
        time_range: '{"since":"2024-01-01","until":"2024-01-31"}',
        level: "campaign",
        limit: 25,
        compact: false,
      });

      const callArgs = (metaApiGet as any).mock.calls[0][2];
      expect(callArgs.time_range).toEqual({
        since: "2024-01-01",
        until: "2024-01-31",
      });
      expect(callArgs.date_preset).toBeUndefined();
    });

    it("returns error for invalid JSON time range", async () => {
      const result = await callTool("get_insights", {
        object_id: "act_123",
        time_range: "{ broken json",
        level: "ad",
        limit: 25,
        compact: false,
      });

      expect((result as any).isError).toBe(true);
      const data = parseToolResult(result as any) as any;
      expect(data.error).toContain("Invalid JSON");
    });

    it("strips redundant actions when compact=true", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          {
            impressions: "500",
            actions: [
              { action_type: "link_click", value: "10" },
              { action_type: "omni_purchase", value: "2" },
              { action_type: "offsite_conversion.fb_pixel_purchase", value: "1" },
            ],
          },
        ],
      });

      const result = await callTool("get_insights", {
        object_id: "act_123",
        time_range: "last_7d",
        level: "ad",
        limit: 25,
        compact: true,
      });

      const data = parseToolResult(result as any) as any;
      const actions = data.data[0].actions;
      expect(actions).toHaveLength(1);
      expect(actions[0].action_type).toBe("link_click");
    });

    it("passes breakdown parameter", async () => {
      (metaApiGet as any).mockResolvedValue({ data: [] });

      await callTool("get_insights", {
        object_id: "act_123",
        time_range: "last_7d",
        breakdown: "age",
        level: "ad",
        limit: 25,
        compact: false,
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "act_123/insights",
        TOKEN,
        expect.objectContaining({ breakdowns: "age" }),
      );
    });
  });
});
