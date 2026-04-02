import { z } from "zod";
import { metaApiGet, ensureActPrefix, textResult } from "../meta-api";
import type { ToolContext } from "./index";
import { isAccountAllowed, accountBlockedResult } from "./index";

export function registerTargetingTools(ctx: ToolContext): void {
  const { server, token, allowedAccounts } = ctx;
  // ── search_interests ─────────────────────────────────────────────────
  server.tool(
    "search_interests",
    "Search for interest-based targeting options by keyword. Returns interests that can be used in ad targeting specs.",
    {
      query: z
        .string()
        .describe("The keyword to search for (e.g. 'yoga', 'cooking')."),
      limit: z
        .number()
        .default(25)
        .describe("Maximum number of results to return."),
    },
    async (args) => {
      const data = await metaApiGet("search", token, {
        type: "adinterest",
        q: args.query,
        limit: args.limit,
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );

  // ── get_interest_suggestions ─────────────────────────────────────────
  server.tool(
    "get_interest_suggestions",
    "Get suggested interests based on a list of existing interests. Useful for expanding targeting.",
    {
      interest_list: z
        .array(z.string())
        .describe(
          "Array of interest names to get suggestions for (e.g. ['yoga', 'meditation']).",
        ),
      limit: z
        .number()
        .default(25)
        .describe("Maximum number of suggestions to return."),
    },
    async (args) => {
      const data = await metaApiGet("search", token, {
        type: "adinterestsuggestion",
        interest_list: JSON.stringify(args.interest_list),
        limit: args.limit,
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );

  // ── estimate_audience_size ───────────────────────────────────────────
  server.tool(
    "estimate_audience_size",
    "Estimate the audience size for a given targeting spec. Returns lower bound, upper bound, and midpoint estimates.",
    {
      account_id: z
        .string()
        .describe("The ad account ID (with or without act_ prefix)."),
      targeting: z
        .string()
        .describe(
          "JSON string of the targeting spec (e.g. '{\"geo_locations\":{\"countries\":[\"US\"]},\"interests\":[{\"id\":\"6003139266461\",\"name\":\"Yoga\"}]}').",
        ),
      optimization_goal: z
        .string()
        .default("REACH")
        .describe(
          "Optimization goal for the estimate (e.g. REACH, IMPRESSIONS).",
        ),
    },
    async (args) => {
      if (!isAccountAllowed(args.account_id, allowedAccounts)) {
        return accountBlockedResult(args.account_id);
      }
      const accountId = ensureActPrefix(args.account_id);

      let targetingSpec: unknown;
      try {
        targetingSpec = JSON.parse(args.targeting);
      } catch {
        return textResult(
          { error: "Invalid JSON in targeting parameter." },
          true,
        );
      }

      const data = await metaApiGet(`${accountId}/reachestimate`, token, {
        targeting_spec: targetingSpec,
        optimization_goal: args.optimization_goal,
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      // Format response with midpoint if bounds are available
      const inner = (data as any).data;
      if (
        inner &&
        typeof inner === "object" &&
        !Array.isArray(inner) &&
        typeof inner.users_lower_bound === "number" &&
        typeof inner.users_upper_bound === "number"
      ) {
        const midpoint = Math.round(
          (inner.users_lower_bound + inner.users_upper_bound) / 2,
        );
        return textResult({
          users_lower_bound: inner.users_lower_bound,
          users_upper_bound: inner.users_upper_bound,
          estimated_audience_size: midpoint,
        });
      }

      return textResult(data);
    },
  );

  // ── search_behaviors ─────────────────────────────────────────────────
  server.tool(
    "search_behaviors",
    "Browse available behavior-based targeting categories (e.g. purchase behavior, device usage).",
    {
      limit: z
        .number()
        .default(50)
        .describe("Maximum number of behavior categories to return."),
    },
    async (args) => {
      const data = await metaApiGet("search", token, {
        type: "adTargetingCategory",
        class: "behaviors",
        limit: args.limit,
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );

  // ── search_demographics ──────────────────────────────────────────────
  server.tool(
    "search_demographics",
    "Browse available demographic targeting categories (e.g. education, income, life events).",
    {
      demographic_class: z
        .string()
        .default("demographics")
        .describe(
          "The demographic class to search (e.g. demographics, income, education, life_events).",
        ),
      limit: z
        .number()
        .default(50)
        .describe("Maximum number of demographic categories to return."),
    },
    async (args) => {
      const data = await metaApiGet("search", token, {
        type: "adTargetingCategory",
        class: args.demographic_class,
        limit: args.limit,
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );

  // ── search_geo_locations ─────────────────────────────────────────────
  server.tool(
    "search_geo_locations",
    "Search for geographic locations (countries, cities, regions, zip codes) for ad targeting.",
    {
      query: z
        .string()
        .describe(
          "The location name to search for (e.g. 'New York', 'Brazil').",
        ),
      location_types: z
        .array(z.string())
        .optional()
        .describe(
          "Optional array of location types to filter by (e.g. ['country', 'city', 'region', 'zip']).",
        ),
      limit: z
        .number()
        .default(25)
        .describe("Maximum number of results to return."),
    },
    async (args) => {
      const params: Record<string, unknown> = {
        type: "adgeolocation",
        q: args.query,
        limit: args.limit,
      };

      if (args.location_types) {
        params.location_types = JSON.stringify(args.location_types);
      }

      const data = await metaApiGet("search", token, params);

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );
}
