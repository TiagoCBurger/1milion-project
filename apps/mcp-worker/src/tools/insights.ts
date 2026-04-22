import { z } from "zod";
import { metaApiGet, textResult } from "../meta-api";
import type { ToolContext } from "./index";
import { scopeCheckByMetaId } from "./index";

const INSIGHT_FIELDS = [
  "account_id",
  "account_name",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "impressions",
  "clicks",
  "spend",
  "cpc",
  "cpm",
  "ctr",
  "reach",
  "frequency",
  "actions",
  "action_values",
  "conversions",
  "unique_clicks",
  "cost_per_action_type",
].join(",");

const COMPACT_STRIP_PREFIXES = [
  "omni_",
  "onsite_web_app_",
  "onsite_web_",
  "offsite_conversion.fb_pixel_",
];

function stripRedundantActions(
  arr: Array<{ action_type?: string; [k: string]: unknown }> | undefined,
): Array<{ action_type?: string; [k: string]: unknown }> | undefined {
  if (!Array.isArray(arr)) return arr;
  return arr.filter(
    (item) =>
      !item.action_type ||
      !COMPACT_STRIP_PREFIXES.some((prefix) =>
        item.action_type!.startsWith(prefix),
      ),
  );
}

function compactInsights(data: Record<string, unknown>): Record<string, unknown> {
  const rows = (data as any).data;
  if (!Array.isArray(rows)) return data;

  for (const row of rows) {
    row.actions = stripRedundantActions(row.actions);
    row.action_values = stripRedundantActions(row.action_values);
    row.cost_per_action_type = stripRedundantActions(row.cost_per_action_type);
  }
  return data;
}

export function registerInsightTools(ctx: ToolContext): void {
  const { server, token } = ctx;
  server.tool(
    "get_insights",
    "Get performance insights (metrics, KPIs) for a Meta Ads object (account, campaign, adset, or ad). Supports date presets, custom time ranges, breakdowns, and pagination.",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project ID or slug to scope the request."),
      object_id: z
        .string()
        .describe(
          "The ID of the object to get insights for (account, campaign, adset, or ad ID).",
        ),
      time_range: z
        .string()
        .default("maximum")
        .describe(
          "Date preset (today, yesterday, this_month, last_month, last_7d, last_30d, maximum, etc.) or a JSON string like '{\"since\":\"2023-01-01\",\"until\":\"2023-01-31\"}'.",
        ),
      breakdown: z
        .string()
        .optional()
        .describe(
          "Optional breakdown dimension (e.g. age, gender, country, placement, device_platform).",
        ),
      level: z
        .string()
        .default("ad")
        .describe(
          "Aggregation level: account, campaign, adset, or ad.",
        ),
      limit: z
        .number()
        .default(25)
        .describe("Maximum number of rows to return."),
      after: z
        .string()
        .optional()
        .describe("Pagination cursor for the next page of results."),
      compact: z
        .boolean()
        .default(false)
        .describe(
          "If true, strip redundant action types (omni_, onsite_web_app_, onsite_web_, offsite_conversion.fb_pixel_) from actions, action_values, and cost_per_action_type arrays.",
        ),
    },
    async (args) => {
      const check = await scopeCheckByMetaId(ctx, args.project_id, args.object_id);
      if (!check.ok) return check.result;

      const params: Record<string, unknown> = {
        fields: INSIGHT_FIELDS,
        level: args.level,
        limit: args.limit,
      };

      // Detect custom time range (JSON) vs date preset
      if (args.time_range.trimStart().startsWith("{")) {
        try {
          params.time_range = JSON.parse(args.time_range);
        } catch {
          return textResult(
            { error: "Invalid JSON in time_range parameter." },
            true,
          );
        }
      } else {
        params.date_preset = args.time_range;
      }

      if (args.breakdown) {
        params.breakdowns = args.breakdown;
      }

      if (args.after) {
        params.after = args.after;
      }

      const data = await metaApiGet(
        `${args.object_id}/insights`,
        token,
        params,
      );

      if ((data as any).error) {
        return textResult(data, true);
      }

      const result = args.compact ? compactInsights(data) : data;
      return textResult(result);
    },
  );
}
