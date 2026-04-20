import { z } from "zod";
import { metaApiGet, ensureActPrefix, textResult } from "../meta-api";
import type { ToolContext } from "./index";
import {
  isAccountAllowed,
  accountBlockedResult,
  getProjectAllowedAccounts,
} from "./index";

export function registerSearchTools(ctx: ToolContext): void {
  const { server, token } = ctx;
  // ── search ───────────────────────────────────────────────────────────
  server.tool(
    "search",
    "Search across Meta Ads data including accounts, campaigns, pages, and businesses.",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project ID or slug to scope the request."),
      query: z
        .string()
        .describe("The search query to match against object names."),
    },
    async (args) => {
      const scope = await getProjectAllowedAccounts(ctx, args);
      if (!scope.ok) return scope.result;
      const { allowedAccounts } = scope;
      const query = args.query.toLowerCase();

      const [accountsRes, businessesRes] = await Promise.all([
        metaApiGet("me/adaccounts", token, {
          fields: "id,name,account_status",
          limit: 10,
        }),
        metaApiGet("me/businesses", token, {
          fields: "id,name",
          limit: 10,
        }),
      ]);

      const results: Array<{ type: string; [k: string]: unknown }> = [];

      // Filter ad accounts
      const accounts = ((accountsRes as any).data ?? []) as Array<{
        id?: string;
        name?: string;
        [k: string]: unknown;
      }>;
      for (const acc of accounts) {
        if (acc.name && acc.name.toLowerCase().includes(query)) {
          if (isAccountAllowed(acc.id || "", allowedAccounts)) {
            results.push({ type: "ad_account", ...acc });
          }
        }
      }

      // Filter businesses
      const businesses = ((businessesRes as any).data ?? []) as Array<{
        id?: string;
        name?: string;
        [k: string]: unknown;
      }>;
      for (const biz of businesses) {
        if (biz.name && biz.name.toLowerCase().includes(query)) {
          results.push({ type: "business", ...biz });
        }
      }

      return textResult({
        query: args.query,
        results,
        total: results.length,
      });
    },
  );

  // ── fetch ────────────────────────────────────────────────────────────
  server.tool(
    "fetch",
    "Fetch a Meta object by ID. For direct lookups, prefer get_campaign_details, get_adset_details, get_ad_details.",
    {
      id: z
        .string()
        .describe("The Meta object ID to fetch."),
    },
    async (args) => {
      const data = await metaApiGet(args.id, token, {
        fields: "id,name",
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );

  // ── search_pages_by_name ─────────────────────────────────────────────
  server.tool(
    "search_pages_by_name",
    "Search for Facebook Pages associated with an ad account, optionally filtering by name.",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project ID or slug to scope the request."),
      account_id: z
        .string()
        .describe("The ad account ID (with or without act_ prefix)."),
      search_term: z
        .string()
        .optional()
        .describe(
          "Optional search term to filter pages by name (case-insensitive).",
        ),
    },
    async (args) => {
      const scope = await getProjectAllowedAccounts(ctx, args);
      if (!scope.ok) return scope.result;
      const { allowedAccounts } = scope;
      if (!isAccountAllowed(args.account_id, allowedAccounts)) {
        return accountBlockedResult(args.account_id);
      }
      const accountId = ensureActPrefix(args.account_id);

      const data = await metaApiGet(`${accountId}/promote_pages`, token, {
        fields: "id,name,username,category,fan_count,link",
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      let pages = ((data as any).data ?? []) as Array<{
        name?: string;
        [k: string]: unknown;
      }>;

      if (args.search_term) {
        const term = args.search_term.toLowerCase();
        pages = pages.filter(
          (page) => page.name && page.name.toLowerCase().includes(term),
        );
      }

      return textResult({
        pages,
        total: pages.length,
      });
    },
  );
}
