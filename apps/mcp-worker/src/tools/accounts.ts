import { z } from "zod";
import {
  metaApiGet,
  ensureActPrefix,
  textResult,
  centsToAmount,
} from "../meta-api";
import type { ToolContext } from "./index";
import {
  isAccountAllowed,
  accountBlockedResult,
  getProjectAllowedAccounts,
} from "./index";

const ACCOUNT_FIELDS =
  "id,name,account_id,account_status,amount_spent,balance,currency,age,business_city,business_country_code";

const ACCOUNT_FIELDS_FULL = `${ACCOUNT_FIELDS},timezone_name`;

const PAGE_FIELDS =
  "id,name,username,category,fan_count,link,verification_status,picture";

const EU_COUNTRIES = new Set([
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "BE",
  "AT",
  "IE",
  "DK",
  "SE",
  "FI",
  "NO",
]);

interface AdAccount {
  amount_spent?: unknown;
  balance?: unknown;
  currency?: string;
  business_country_code?: string;
  [key: string]: unknown;
}

function normalizeMonetary(acc: AdAccount): AdAccount {
  const currency = acc.currency ?? "USD";
  if (acc.amount_spent !== undefined) {
    acc.amount_spent = centsToAmount(acc.amount_spent, currency);
  }
  if (acc.balance !== undefined) {
    acc.balance = centsToAmount(acc.balance, currency);
  }
  return acc;
}

export function registerAccountsTools(ctx: ToolContext): void {
  const { server, token } = ctx;
  // ── get_ad_accounts ──────────────────────────────────────────────────
  server.tool(
    "get_ad_accounts",
    "List the ad accounts that belong to the active project.",
    {
      project_id: z
        .string()
        .optional()
        .describe(
          "Project ID or slug to scope the request. Omit if the connection only has one project.",
        ),
      user_id: z
        .string()
        .default("me")
        .describe("Facebook user ID or 'me' for the current user."),
      limit: z
        .number()
        .default(200)
        .describe("Maximum number of ad accounts to return."),
    },
    async (args) => {
      const scope = await getProjectAllowedAccounts(ctx, args);
      if (!scope.ok) return scope.result;
      const { allowedAccounts } = scope;

      const data = await metaApiGet(`${args.user_id}/adaccounts`, token, {
        fields: ACCOUNT_FIELDS,
        limit: args.limit,
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      let accounts = ((data as any).data ?? []) as AdAccount[];

      accounts = accounts.filter((acc) => {
        const id = (acc.account_id as string) || (acc.id as string) || "";
        return isAccountAllowed(id, allowedAccounts);
      });

      const normalized = accounts.map(normalizeMonetary);

      return textResult({
        project: { id: scope.project.id, slug: scope.project.slug, name: scope.project.name },
        accounts: normalized,
        total: normalized.length,
        paging: (data as any).paging,
      });
    },
  );

  // ── get_account_info ─────────────────────────────────────────────────
  server.tool(
    "get_account_info",
    "Get detailed information about a specific ad account including status, spend, and DSA requirements.",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project ID or slug to scope the request."),
      account_id: z
        .string()
        .describe(
          "The ad account ID (with or without act_ prefix).",
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

      const data = await metaApiGet(accountId, token, {
        fields: ACCOUNT_FIELDS_FULL,
      });

      if ((data as any).error) {
        const errorMsg = JSON.stringify((data as any).error).toLowerCase();

        if (errorMsg.includes("access") || errorMsg.includes("permission")) {
          const accessible = await metaApiGet("me/adaccounts", token, {
            fields: "id,name,account_id",
            limit: 50,
          });

          return textResult(
            {
              error: (data as any).error,
              suggestion:
                "You do not have access to this account. Here are the accounts you can access:",
              accessible_accounts: (accessible as any).data ?? [],
            },
            true,
          );
        }

        return textResult(data, true);
      }

      const account = normalizeMonetary(data as AdAccount);

      // DSA detection for EU countries
      const countryCode = account.business_country_code as string | undefined;
      if (countryCode && EU_COUNTRIES.has(countryCode.toUpperCase())) {
        (account as any).dsa_required = true;
      }

      return textResult(account);
    },
  );

  // ── get_account_pages ────────────────────────────────────────────────
  server.tool(
    "get_account_pages",
    "Get Facebook Pages accessible by the current user or associated with an ad account.",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project ID or slug to scope the request."),
      account_id: z
        .string()
        .describe(
          "Ad account ID (with or without act_ prefix) or 'me' for the current user's pages.",
        ),
    },
    async (args) => {
      // "me" lists the user's own pages regardless of project scope.
      if (args.account_id === "me") {
        const data = await metaApiGet("me/accounts", token, {
          fields: PAGE_FIELDS,
        });

        if ((data as any).error) {
          return textResult(data, true);
        }

        return textResult({
          pages: (data as any).data ?? [],
          total: ((data as any).data ?? []).length,
        });
      }

      const scope = await getProjectAllowedAccounts(ctx, args);
      if (!scope.ok) return scope.result;
      const { allowedAccounts } = scope;
      if (!isAccountAllowed(args.account_id, allowedAccounts)) {
        return accountBlockedResult(args.account_id);
      }
      // For ad accounts: fetch both the user's pages and the account's owned pages
      const rawAccountId = args.account_id.replace(/^act_/, "");
      const accountId = ensureActPrefix(args.account_id);

      const [userPages, ownedPages] = await Promise.all([
        metaApiGet("me/accounts", token, { fields: PAGE_FIELDS }),
        metaApiGet(`${accountId}/owned_pages`, token, {
          fields: PAGE_FIELDS,
        }),
      ]);

      if ((userPages as any).error && (ownedPages as any).error) {
        return textResult(
          { user_pages_error: (userPages as any).error, owned_pages_error: (ownedPages as any).error },
          true,
        );
      }

      // Merge by page ID, avoiding duplicates
      const pageMap = new Map<string, unknown>();

      for (const page of ((userPages as any).data ?? []) as any[]) {
        pageMap.set(page.id, page);
      }
      for (const page of ((ownedPages as any).data ?? []) as any[]) {
        pageMap.set(page.id, page);
      }

      const combined = Array.from(pageMap.values());

      return textResult({
        pages: combined,
        total: combined.length,
      });
    },
  );
}
