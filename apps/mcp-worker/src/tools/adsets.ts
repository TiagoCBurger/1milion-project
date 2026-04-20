import { z } from "zod";
import { metaApiGet, metaApiPost, ensureActPrefix, textResult } from "../meta-api";
import type { ToolContext } from "./index";
import {
  isAccountAllowed,
  accountBlockedResult,
  getProjectAllowedAccounts,
} from "./index";

export function registerAdsetTools(ctx: ToolContext) {
  const { server, token, tier } = ctx;
  // ---------------------------------------------------------------
  // get_adsets
  // ---------------------------------------------------------------
  server.tool(
    "get_adsets",
    "List ad sets for a Meta Ads account or a specific campaign",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project ID or slug to scope the request."),
      account_id: z
        .string()
        .describe("Meta Ads account ID (with or without act_ prefix)"),
      limit: z
        .number()
        .default(10)
        .describe("Maximum number of ad sets to return"),
      campaign_id: z
        .string()
        .optional()
        .describe("If provided, only return ad sets for this campaign"),
      after: z
        .string()
        .default("")
        .describe(
          "Pagination cursor from paging.cursors.after of a previous response.",
        ),
    },
    async (args) => {
      const { account_id, limit, campaign_id, after } = args;
      const scope = await getProjectAllowedAccounts(ctx, args);
      if (!scope.ok) return scope.result;
      const { allowedAccounts } = scope;
      if (!isAccountAllowed(account_id, allowedAccounts)) {
        return accountBlockedResult(account_id);
      }
      const actId = ensureActPrefix(account_id);
      const endpoint = campaign_id ? `${campaign_id}/adsets` : `${actId}/adsets`;
      const fields = [
        "id", "name", "campaign_id", "status", "daily_budget",
        "lifetime_budget", "targeting", "bid_amount", "bid_strategy",
        "bid_constraints", "optimization_goal", "billing_event",
        "start_time", "end_time", "created_time", "updated_time",
        "is_dynamic_creative",
        "frequency_control_specs{event,interval_days,max_frequency}",
      ].join(",");

      const params: Record<string, unknown> = { fields, limit };
      if (after) params.after = after;

      const data = await metaApiGet(endpoint, token, params);
      return textResult(data);
    }
  );

  // ---------------------------------------------------------------
  // get_adset_details
  // ---------------------------------------------------------------
  server.tool(
    "get_adset_details",
    "Get detailed information about a specific ad set",
    {
      adset_id: z.string().describe("The ad set ID to retrieve details for"),
    },
    async ({ adset_id }) => {
      const fields = [
        "id", "name", "campaign_id", "status",
        "frequency_control_specs{event,interval_days,max_frequency}",
        "daily_budget", "lifetime_budget", "targeting", "bid_amount",
        "bid_strategy", "bid_constraints", "optimization_goal",
        "billing_event", "start_time", "end_time", "created_time",
        "updated_time", "attribution_spec", "destination_type",
        "promoted_object", "pacing_type", "budget_remaining",
        "dsa_beneficiary", "dsa_payor", "is_dynamic_creative",
      ].join(",");

      const data = await metaApiGet(adset_id, token, { fields });
      return textResult(data);
    }
  );

  if (!ctx.enableMetaMutations) return;

  // ---------------------------------------------------------------
  // create_adset  (PRO tier only)
  // ---------------------------------------------------------------
  server.tool(
    "create_adset",
    "Create a new ad set in a Meta Ads campaign (Pro tier required)",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project ID or slug to scope the request."),
      account_id: z
        .string()
        .describe("Meta Ads account ID (with or without act_ prefix)"),
      campaign_id: z
        .string()
        .describe("Campaign ID this ad set belongs to"),
      name: z.string().describe("Name of the ad set"),
      optimization_goal: z
        .string()
        .describe("Optimization goal (e.g. REACH, LINK_CLICKS, CONVERSIONS, IMPRESSIONS)"),
      billing_event: z
        .string()
        .describe("Billing event (e.g. IMPRESSIONS, LINK_CLICKS)"),
      status: z
        .string()
        .default("PAUSED")
        .describe("Initial status of the ad set (default: PAUSED)"),
      daily_budget: z
        .string()
        .optional()
        .describe("Daily budget in cents (e.g. '5000' for $50.00)"),
      lifetime_budget: z
        .string()
        .optional()
        .describe("Lifetime budget in cents"),
      targeting: z
        .record(z.unknown())
        .optional()
        .describe("Targeting spec as a JSON object (age_min, age_max, geo_locations, etc.)"),
      bid_amount: z
        .string()
        .optional()
        .describe("Bid amount in cents (required for LOWEST_COST_WITH_BID_CAP and COST_CAP strategies)"),
      bid_strategy: z
        .string()
        .optional()
        .describe("Bid strategy (LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP)"),
      start_time: z
        .string()
        .optional()
        .describe("Start time in ISO 8601 format"),
      end_time: z
        .string()
        .optional()
        .describe("End time in ISO 8601 format"),
      dsa_beneficiary: z
        .string()
        .optional()
        .describe("DSA beneficiary for EU Digital Services Act compliance"),
      dsa_payor: z
        .string()
        .optional()
        .describe("DSA payor for EU Digital Services Act compliance"),
      promoted_object: z
        .record(z.unknown())
        .optional()
        .describe("Promoted object as a JSON object (e.g. { pixel_id, custom_event_type })"),
      destination_type: z
        .string()
        .optional()
        .describe("Destination type (e.g. WEBSITE, APP, MESSENGER)"),
      is_dynamic_creative: z
        .boolean()
        .optional()
        .describe("Whether the ad set uses dynamic creative"),
      frequency_control_specs: z
        .string()
        .optional()
        .describe("Frequency control specs as a JSON string (e.g. [{event:'IMPRESSIONS', interval_days:7, max_frequency:2}])"),
    },
    async (args) => {
      const scope = await getProjectAllowedAccounts(ctx, args);
      if (!scope.ok) return scope.result;
      const { allowedAccounts } = scope;
      if (!isAccountAllowed(args.account_id, allowedAccounts)) {
        return accountBlockedResult(args.account_id);
      }

      if (tier === "free") {
        return textResult("create_adset requires a Pro or Enterprise subscription. Upgrade at https://yourdomain.com/pricing", true);
      }

      // Validate bid_strategy + bid_amount
      if (
        args.bid_strategy &&
        ["LOWEST_COST_WITH_BID_CAP", "COST_CAP"].includes(args.bid_strategy) &&
        !args.bid_amount
      ) {
        return textResult(
          `bid_amount is required when bid_strategy is ${args.bid_strategy}`,
          true
        );
      }

      const actId = ensureActPrefix(args.account_id);

      // Build targeting
      let targeting = args.targeting;
      if (!targeting) {
        targeting = {
          age_min: 18,
          age_max: 65,
          geo_locations: { countries: ["US"] },
          targeting_automation: { advantage_audience: 1 },
        };
      } else if (!targeting.targeting_automation) {
        targeting = { ...targeting, targeting_automation: { advantage_audience: 0 } };
      }

      const params: Record<string, unknown> = {
        campaign_id: args.campaign_id,
        name: args.name,
        optimization_goal: args.optimization_goal,
        billing_event: args.billing_event,
        status: args.status,
        targeting: JSON.stringify(targeting),
      };

      if (args.daily_budget) params.daily_budget = args.daily_budget;
      if (args.lifetime_budget) params.lifetime_budget = args.lifetime_budget;
      if (args.bid_amount) params.bid_amount = args.bid_amount;
      if (args.bid_strategy) params.bid_strategy = args.bid_strategy;
      if (args.start_time) params.start_time = args.start_time;
      if (args.end_time) params.end_time = args.end_time;
      if (args.dsa_beneficiary) params.dsa_beneficiary = args.dsa_beneficiary;
      if (args.dsa_payor) params.dsa_payor = args.dsa_payor;
      if (args.destination_type) params.destination_type = args.destination_type;
      if (args.is_dynamic_creative !== undefined) params.is_dynamic_creative = args.is_dynamic_creative;
      if (args.promoted_object) params.promoted_object = JSON.stringify(args.promoted_object);
      if (args.frequency_control_specs) params.frequency_control_specs = args.frequency_control_specs;

      const data = await metaApiPost(`${actId}/adsets`, token, params);
      return textResult(data);
    }
  );

  // ---------------------------------------------------------------
  // update_adset  (PRO tier only)
  // ---------------------------------------------------------------
  server.tool(
    "update_adset",
    "Update an existing ad set (Pro tier required)",
    {
      adset_id: z.string().describe("The ad set ID to update"),
      name: z.string().optional().describe("New name for the ad set"),
      status: z
        .string()
        .optional()
        .describe("New status (ACTIVE, PAUSED, ARCHIVED)"),
      targeting: z
        .union([z.record(z.unknown()), z.string()])
        .optional()
        .describe("Updated targeting spec as a JSON object or JSON string"),
      daily_budget: z
        .string()
        .optional()
        .describe("New daily budget in cents"),
      lifetime_budget: z
        .string()
        .optional()
        .describe("New lifetime budget in cents"),
      bid_amount: z
        .string()
        .optional()
        .describe("New bid amount in cents"),
      bid_strategy: z
        .string()
        .optional()
        .describe("New bid strategy"),
      optimization_goal: z
        .string()
        .optional()
        .describe("New optimization goal"),
      start_time: z
        .string()
        .optional()
        .describe("New start time in ISO 8601 format"),
      end_time: z
        .string()
        .optional()
        .describe("New end time in ISO 8601 format"),
      dsa_beneficiary: z
        .string()
        .optional()
        .describe("DSA beneficiary for EU Digital Services Act compliance"),
      dsa_payor: z
        .string()
        .optional()
        .describe("DSA payor for EU Digital Services Act compliance"),
    },
    async ({ adset_id, ...updates }) => {
      if (tier === "free") {
        return textResult("update_adset requires a Pro or Enterprise subscription. Upgrade at https://yourdomain.com/pricing", true);
      }

      const params: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue;
        if (key === "targeting" && typeof value === "object") {
          params[key] = JSON.stringify(value);
        } else {
          params[key] = value;
        }
      }

      const data = await metaApiPost(adset_id, token, params);
      return textResult(data);
    }
  );
}
