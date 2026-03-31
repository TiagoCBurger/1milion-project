import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

/**
 * Register all Meta Ads tools on the MCP server.
 *
 * @param server  - McpServer instance (created per request)
 * @param token   - Decrypted Meta access token for this workspace
 * @param tier    - Subscription tier ("free" | "pro" | "enterprise")
 */
export function registerAllTools(
  server: McpServer,
  token: string,
  tier: string
): void {
  registerAccountsTools(server, token, tier);
  registerCampaignsTools(server, token, tier);
  registerAdsetTools(server, token, tier);
  registerAdTools(server, token, tier);
  registerCreativeTools(server, token, tier);
  registerInsightTools(server, token, tier);
  registerTargetingTools(server, token, tier);
  registerLibraryTools(server, token, tier);
  registerBudgetTools(server, token, tier);
  registerSearchTools(server, token, tier);
}
