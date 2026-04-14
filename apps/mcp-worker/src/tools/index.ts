import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env } from "../types";
import { registerAccountsTools } from "./accounts";
import { registerCampaignsTools } from "./campaigns";
import { registerAdsetTools } from "./adsets";
import { registerAdTools } from "./ads";
import { registerCreativeTools } from "./creatives";
import { registerInsightTools } from "./insights";
import { registerTargetingTools } from "./targeting";
import { registerLibraryTools } from "./library";
import { registerBudgetTools } from "./budget";
import { registerSearchTools } from "./search";
import { registerVolumeTools } from "./volume";

export interface ToolContext {
  server: McpServer;
  token: string;
  tier: string;
  env: Env;
  workspaceId: string;
  /** When false/omitted, Meta mutation tools are not registered. */
  enableMetaMutations?: boolean;
  allowedAccounts?: string[];
}

/**
 * Checks if an account ID is in the allowed list.
 * - undefined: no list supplied (tests / legacy) → allow any account.
 * - empty array: workspace has no enabled accounts (or MCP has none) → deny.
 * Handles both "act_123" and "123" formats.
 */
export function isAccountAllowed(
  accountId: string,
  allowedAccounts?: string[]
): boolean {
  if (allowedAccounts === undefined) return true;
  if (allowedAccounts.length === 0) return false;
  const raw = accountId.replace(/^act_/, "");
  return allowedAccounts.some((a) => a.replace(/^act_/, "") === raw);
}

/**
 * Returns a blocked error response if the account is not allowed.
 */
export function accountBlockedResult(accountId: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: "Access denied",
          message: `This connection does not have access to ad account ${accountId}. Ask the workspace admin to grant access via the dashboard.`,
        }),
      },
    ],
    isError: true,
  };
}

/**
 * Register all Meta Ads tools on the MCP server.
 */
export function registerAllTools(ctx: ToolContext): void {
  registerAccountsTools(ctx);
  registerCampaignsTools(ctx);
  registerAdsetTools(ctx);
  registerAdTools(ctx);
  registerCreativeTools(ctx);
  registerInsightTools(ctx);
  registerTargetingTools(ctx);
  registerLibraryTools(ctx);
  registerBudgetTools(ctx);
  registerSearchTools(ctx);
  registerVolumeTools(ctx);
}
