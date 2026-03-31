import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerBudgetTools } from "../../tools/budget";
import { createToolCapture, parseToolResult } from "../helpers";

vi.mock("../../meta-api", async () => {
  const actual = await vi.importActual<typeof import("../../meta-api")>("../../meta-api");
  return {
    ...actual,
    metaApiPost: vi.fn(),
  };
});

import { metaApiPost } from "../../meta-api";

const TOKEN = "test_meta_token";

describe("Budget Tools", () => {
  describe("create_budget_schedule", () => {
    it("blocks non-pro tier", async () => {
      const capture = createToolCapture();
      registerBudgetTools(capture.server, TOKEN, "free");

      const result = await capture.callTool("create_budget_schedule", {
        campaign_id: "camp_1",
        budget_value: 5000,
        budget_value_type: "ABSOLUTE",
        time_start: 1700000000,
        time_end: 1700086400,
      });

      expect((result as any).isError).toBe(true);
      const data = parseToolResult(result as any) as any;
      expect(data.error).toContain("PRO");
    });

    it("validates budget_value_type", async () => {
      const capture = createToolCapture();
      registerBudgetTools(capture.server, TOKEN, "pro");

      const result = await capture.callTool("create_budget_schedule", {
        campaign_id: "camp_1",
        budget_value: 5000,
        budget_value_type: "INVALID",
        time_start: 1700000000,
        time_end: 1700086400,
      });

      expect((result as any).isError).toBe(true);
      const data = parseToolResult(result as any) as any;
      expect(data.error).toContain("ABSOLUTE or MULTIPLIER");
    });

    it("creates budget schedule for pro tier", async () => {
      const capture = createToolCapture();
      registerBudgetTools(capture.server, TOKEN, "pro");

      (metaApiPost as any).mockResolvedValue({ id: "bs_1" });

      const result = await capture.callTool("create_budget_schedule", {
        campaign_id: "camp_1",
        budget_value: 5000,
        budget_value_type: "ABSOLUTE",
        time_start: 1700000000,
        time_end: 1700086400,
      });

      expect(metaApiPost).toHaveBeenCalledWith(
        "camp_1/budget_schedules",
        TOKEN,
        {
          budget_value: 5000,
          budget_value_type: "ABSOLUTE",
          time_start: 1700000000,
          time_end: 1700086400,
        },
      );

      expect((result as any).isError).toBeFalsy();
    });

    it("creates multiplier budget schedule", async () => {
      const capture = createToolCapture();
      registerBudgetTools(capture.server, TOKEN, "pro");

      (metaApiPost as any).mockResolvedValue({ id: "bs_2" });

      await capture.callTool("create_budget_schedule", {
        campaign_id: "camp_1",
        budget_value: 1.5,
        budget_value_type: "MULTIPLIER",
        time_start: 1700000000,
        time_end: 1700086400,
      });

      expect(metaApiPost).toHaveBeenCalledWith(
        "camp_1/budget_schedules",
        TOKEN,
        expect.objectContaining({
          budget_value: 1.5,
          budget_value_type: "MULTIPLIER",
        }),
      );
    });
  });
});
