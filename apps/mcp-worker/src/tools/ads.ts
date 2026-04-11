import { z } from "zod";
import { metaApiGet, metaApiPost, ensureActPrefix, textResult } from "../meta-api";
import type { ToolContext } from "./index";
import { isAccountAllowed, accountBlockedResult } from "./index";

export function registerAdTools(ctx: ToolContext) {
  const { server, token, tier, allowedAccounts } = ctx;
  // ---------------------------------------------------------------
  // get_ads
  // ---------------------------------------------------------------
  server.tool(
    "get_ads",
    "List ads for a Meta Ads account, campaign, or ad set",
    {
      account_id: z
        .string()
        .describe("Meta Ads account ID (with or without act_ prefix)"),
      limit: z
        .number()
        .default(10)
        .describe("Maximum number of ads to return"),
      campaign_id: z
        .string()
        .optional()
        .describe("If provided, only return ads for this campaign"),
      adset_id: z
        .string()
        .optional()
        .describe("If provided, only return ads for this ad set (takes priority over campaign_id)"),
      after: z
        .string()
        .default("")
        .describe(
          "Pagination cursor from paging.cursors.after of a previous response.",
        ),
    },
    async ({ account_id, limit, campaign_id, adset_id, after }) => {
      if (!isAccountAllowed(account_id, allowedAccounts)) {
        return accountBlockedResult(account_id);
      }
      const actId = ensureActPrefix(account_id);

      let endpoint: string;
      if (adset_id) {
        endpoint = `${adset_id}/ads`;
      } else if (campaign_id) {
        endpoint = `${campaign_id}/ads`;
      } else {
        endpoint = `${actId}/ads`;
      }

      const fields = [
        "id", "name", "adset_id", "campaign_id", "status", "creative",
        "created_time", "updated_time", "bid_amount", "conversion_domain",
        "tracking_specs",
      ].join(",");

      const params: Record<string, unknown> = { fields, limit };
      if (after) params.after = after;

      const data = await metaApiGet(endpoint, token, params);
      return textResult(data);
    }
  );

  // ---------------------------------------------------------------
  // get_ad_details
  // ---------------------------------------------------------------
  server.tool(
    "get_ad_details",
    "Get detailed information about a specific ad",
    {
      ad_id: z.string().describe("The ad ID to retrieve details for"),
    },
    async ({ ad_id }) => {
      const fields = [
        "id", "name", "adset_id", "campaign_id", "status", "creative",
        "created_time", "updated_time", "bid_amount", "conversion_domain",
        "tracking_specs", "preview_shareable_link",
      ].join(",");

      const data = await metaApiGet(ad_id, token, { fields });
      return textResult(data);
    }
  );

  if (!ctx.enableMetaMutations) return;

  // ---------------------------------------------------------------
  // create_ad  (PRO tier only)
  // ---------------------------------------------------------------
  server.tool(
    "create_ad",
    "Create a new ad in a Meta Ads ad set (Pro tier required)",
    {
      account_id: z
        .string()
        .describe("Meta Ads account ID (with or without act_ prefix)"),
      name: z.string().describe("Name of the ad"),
      adset_id: z.string().describe("Ad set ID this ad belongs to"),
      creative_id: z
        .string()
        .describe("Creative ID to use for this ad"),
      status: z
        .string()
        .default("PAUSED")
        .describe("Initial status of the ad (default: PAUSED)"),
      bid_amount: z
        .string()
        .optional()
        .describe("Bid amount in cents"),
      tracking_specs: z
        .array(z.record(z.unknown()))
        .optional()
        .describe("Tracking specs as an array of objects"),
    },
    async (args) => {
      if (!isAccountAllowed(args.account_id, allowedAccounts)) {
        return accountBlockedResult(args.account_id);
      }

      if (tier === "free") {
        return textResult("create_ad requires a Pro or Enterprise subscription. Upgrade at https://yourdomain.com/pricing", true);
      }

      const actId = ensureActPrefix(args.account_id);

      const params: Record<string, unknown> = {
        name: args.name,
        adset_id: args.adset_id,
        creative: JSON.stringify({ creative_id: args.creative_id }),
        status: args.status,
      };

      if (args.bid_amount) params.bid_amount = String(args.bid_amount);
      if (args.tracking_specs) params.tracking_specs = JSON.stringify(args.tracking_specs);

      const data = await metaApiPost(`${actId}/ads`, token, params);
      return textResult(data);
    }
  );

  // ---------------------------------------------------------------
  // update_ad  (PRO tier only)
  // ---------------------------------------------------------------
  server.tool(
    "update_ad",
    "Update an existing ad (Pro tier required)",
    {
      ad_id: z.string().describe("The ad ID to update"),
      status: z
        .string()
        .optional()
        .describe("New status (ACTIVE, PAUSED, ARCHIVED)"),
      bid_amount: z
        .string()
        .optional()
        .describe("New bid amount in cents"),
      creative_id: z
        .string()
        .optional()
        .describe("New creative ID to associate with the ad"),
      tracking_specs: z
        .array(z.record(z.unknown()))
        .optional()
        .describe("Updated tracking specs as an array of objects"),
    },
    async ({ ad_id, ...updates }) => {
      if (tier === "free") {
        return textResult("update_ad requires a Pro or Enterprise subscription. Upgrade at https://yourdomain.com/pricing", true);
      }

      const params: Record<string, unknown> = {};

      if (updates.status) params.status = updates.status;
      if (updates.bid_amount) params.bid_amount = String(updates.bid_amount);
      if (updates.creative_id) {
        params.creative = JSON.stringify({ creative_id: String(updates.creative_id) });
      }
      if (updates.tracking_specs) {
        params.tracking_specs = JSON.stringify(updates.tracking_specs);
      }

      const data = await metaApiPost(ad_id, token, params);
      return textResult(data);
    }
  );
}
