import { z } from "zod";
import { metaApiPost, textResult } from "../meta-api";
import type { ToolContext } from "./index";

export function registerBudgetTools(ctx: ToolContext): void {
  const { server, token, tier } = ctx;
  server.tool(
    "create_budget_schedule",
    "Create a budget schedule for a campaign to automatically adjust budget at specific times. PRO tier only.",
    {
      campaign_id: z
        .string()
        .describe("The campaign ID to create the budget schedule for."),
      budget_value: z
        .number()
        .describe(
          "The budget value. For ABSOLUTE type this is the budget amount in the account currency's smallest unit. For MULTIPLIER type this is the multiplier (e.g. 1.5 for 150%).",
        ),
      budget_value_type: z
        .string()
        .describe(
          "The type of budget value: ABSOLUTE (fixed amount) or MULTIPLIER (percentage of base budget).",
        ),
      time_start: z
        .number()
        .describe("Unix timestamp for when the budget schedule starts."),
      time_end: z
        .number()
        .describe("Unix timestamp for when the budget schedule ends."),
    },
    async (args) => {
      if (tier !== "pro") {
        return textResult(
          {
            error: "Budget schedules require a PRO tier subscription.",
            current_tier: tier,
          },
          true,
        );
      }

      if (
        args.budget_value_type !== "ABSOLUTE" &&
        args.budget_value_type !== "MULTIPLIER"
      ) {
        return textResult(
          {
            error:
              "budget_value_type must be either ABSOLUTE or MULTIPLIER.",
            received: args.budget_value_type,
          },
          true,
        );
      }

      const data = await metaApiPost(
        `${args.campaign_id}/budget_schedules`,
        token,
        {
          budget_value: args.budget_value,
          budget_value_type: args.budget_value_type,
          time_start: args.time_start,
          time_end: args.time_end,
        },
      );

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );
}
