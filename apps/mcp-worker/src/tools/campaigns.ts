import { z } from "zod";
import {
  metaApiGet,
  metaApiPost,
  ensureActPrefix,
  textResult,
} from "../meta-api";
import type { ToolContext } from "./index";
import { isAccountAllowed, accountBlockedResult } from "./index";

const CAMPAIGN_FIELDS =
  "id,name,objective,status,daily_budget,lifetime_budget,buying_type,start_time,stop_time,created_time,updated_time,bid_strategy,special_ad_categories";

const CAMPAIGN_DETAIL_FIELDS =
  "id,name,objective,status,daily_budget,lifetime_budget,buying_type,start_time,stop_time,created_time,updated_time,bid_strategy,special_ad_categories,special_ad_category_country,budget_remaining,configured_status";

export function registerCampaignsTools(ctx: ToolContext): void {
  const { server, token, tier, allowedAccounts } = ctx;
  // ── get_campaigns ────────────────────────────────────────────────────
  server.tool(
    "get_campaigns",
    "List campaigns for an ad account with optional status, objective, and pagination filters.",
    {
      account_id: z
        .string()
        .describe("The ad account ID (with or without act_ prefix)."),
      limit: z
        .number()
        .default(10)
        .describe("Maximum number of campaigns to return."),
      status_filter: z
        .string()
        .default("")
        .describe(
          "Filter by effective status (e.g. 'ACTIVE', 'PAUSED'). Leave empty for all.",
        ),
      objective_filter: z
        .string()
        .default("")
        .describe(
          "Filter by campaign objective (e.g. 'CONVERSIONS'). Leave empty for all.",
        ),
      after: z
        .string()
        .default("")
        .describe("Pagination cursor returned from a previous request."),
    },
    async (args) => {
      if (!isAccountAllowed(args.account_id, allowedAccounts)) {
        return accountBlockedResult(args.account_id);
      }
      const accountId = ensureActPrefix(args.account_id);
      const params: Record<string, unknown> = {
        fields: CAMPAIGN_FIELDS,
        limit: args.limit,
      };

      if (args.status_filter) {
        params.effective_status = JSON.stringify([args.status_filter]);
      }

      if (args.objective_filter) {
        params.filtering = JSON.stringify([
          {
            field: "objective",
            operator: "IN",
            value: [args.objective_filter],
          },
        ]);
      }

      if (args.after) {
        params.after = args.after;
      }

      const data = await metaApiGet(`${accountId}/campaigns`, token, params);

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult({
        campaigns: (data as any).data ?? [],
        total: ((data as any).data ?? []).length,
        paging: (data as any).paging,
      });
    },
  );

  // ── get_campaign_details ─────────────────────────────────────────────
  server.tool(
    "get_campaign_details",
    "Get full details of a specific campaign by its ID.",
    {
      campaign_id: z.string().describe("The campaign ID to look up."),
    },
    async (args) => {
      const data = await metaApiGet(args.campaign_id, token, {
        fields: CAMPAIGN_DETAIL_FIELDS,
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );

  // ── create_campaign ──────────────────────────────────────────────────
  server.tool(
    "create_campaign",
    "Create a new campaign in the specified ad account. Requires PRO tier.",
    {
      account_id: z
        .string()
        .describe("The ad account ID (with or without act_ prefix)."),
      name: z.string().describe("The campaign name."),
      objective: z
        .string()
        .describe(
          "Campaign objective (e.g. OUTCOME_TRAFFIC, OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT, OUTCOME_APP_PROMOTION).",
        ),
      status: z
        .string()
        .default("PAUSED")
        .describe("Initial campaign status. Defaults to PAUSED."),
      special_ad_categories: z
        .array(z.string())
        .default([])
        .describe(
          "Special ad categories (e.g. CREDIT, EMPLOYMENT, HOUSING, SOCIAL_ISSUES_ELECTIONS_POLITICS). Empty array if none.",
        ),
      daily_budget: z
        .number()
        .nullable()
        .default(null)
        .describe(
          "Daily budget in cents (e.g. 1000 = $10.00). Null to skip.",
        ),
      lifetime_budget: z
        .number()
        .nullable()
        .default(null)
        .describe(
          "Lifetime budget in cents. Null to skip.",
        ),
      buying_type: z
        .string()
        .nullable()
        .default(null)
        .describe("Buying type (AUCTION or RESERVED). Null for default."),
      bid_strategy: z
        .string()
        .default("LOWEST_COST_WITHOUT_CAP")
        .describe("Bid strategy for the campaign."),
      use_adset_level_budgets: z
        .boolean()
        .default(false)
        .describe(
          "If true, budgets are set at the ad set level instead of the campaign level.",
        ),
    },
    async (args) => {
      if (!isAccountAllowed(args.account_id, allowedAccounts)) {
        return accountBlockedResult(args.account_id);
      }

      // Tier gate
      if (tier === "free") {
        return textResult(
          {
            error: "create_campaign requires a PRO subscription.",
            upgrade_url: "/settings/billing",
          },
          true,
        );
      }

      const accountId = ensureActPrefix(args.account_id);

      // Validate required fields
      if (!args.account_id || !args.name || !args.objective) {
        return textResult(
          { error: "account_id, name, and objective are required." },
          true,
        );
      }

      const params: Record<string, unknown> = {
        name: args.name,
        objective: args.objective,
        status: args.status,
        special_ad_categories: args.special_ad_categories,
        bid_strategy: args.bid_strategy,
      };

      if (args.buying_type) {
        params.buying_type = args.buying_type;
      }

      if (args.use_adset_level_budgets) {
        // Ad-set level budgets: disable campaign budget sharing, skip campaign budgets
        params.is_adset_budget_sharing_enabled = "false";
      } else {
        // Campaign-level budgets
        if (args.daily_budget !== null) {
          params.daily_budget = String(args.daily_budget);
        } else if (args.lifetime_budget !== null) {
          params.lifetime_budget = String(args.lifetime_budget);
        } else {
          // Default daily budget when none specified
          params.daily_budget = "1000";
        }
      }

      const data = await metaApiPost(
        `${accountId}/campaigns`,
        token,
        params,
      );

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult({
        success: true,
        campaign_id: (data as any).id,
        ...data,
      });
    },
  );

  // ── update_campaign ──────────────────────────────────────────────────
  server.tool(
    "update_campaign",
    "Update an existing campaign's settings. Requires PRO tier.",
    {
      campaign_id: z.string().describe("The campaign ID to update."),
      name: z
        .string()
        .optional()
        .describe("New campaign name."),
      status: z
        .string()
        .optional()
        .describe("New status (ACTIVE, PAUSED, DELETED, ARCHIVED)."),
      daily_budget: z
        .number()
        .optional()
        .describe("New daily budget in cents."),
      lifetime_budget: z
        .number()
        .optional()
        .describe("New lifetime budget in cents."),
      bid_strategy: z
        .string()
        .optional()
        .describe("New bid strategy."),
      special_ad_categories: z
        .array(z.string())
        .optional()
        .describe("Updated special ad categories."),
    },
    async (args) => {
      // Tier gate
      if (tier === "free") {
        return textResult(
          {
            error: "update_campaign requires a PRO subscription.",
            upgrade_url: "/settings/billing",
          },
          true,
        );
      }

      const params: Record<string, unknown> = {};

      if (args.name !== undefined) params.name = args.name;
      if (args.status !== undefined) params.status = args.status;
      if (args.daily_budget !== undefined)
        params.daily_budget = String(args.daily_budget);
      if (args.lifetime_budget !== undefined)
        params.lifetime_budget = String(args.lifetime_budget);
      if (args.bid_strategy !== undefined)
        params.bid_strategy = args.bid_strategy;
      if (args.special_ad_categories !== undefined)
        params.special_ad_categories = args.special_ad_categories;

      if (Object.keys(params).length === 0) {
        return textResult(
          { error: "No fields provided to update." },
          true,
        );
      }

      const data = await metaApiPost(args.campaign_id, token, params);

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult({
        success: true,
        campaign_id: args.campaign_id,
        updated_fields: Object.keys(params),
        ...data,
      });
    },
  );
}
