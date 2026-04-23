/**
 * MCP-side audit instrumentation.
 *
 * Wraps the server so every mutating tool handler emits an audit_log
 * row. Fire-and-forget: audit failures never block or reverse the
 * mutation (Meta may already have applied it).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { recordAudit, type AuditActor } from "@vibefly/audit";
import type { Env } from "./types";

/**
 * Tools whose handlers write state — these are wrapped with audit.
 * Everything else (get_*, list_*, search_*, estimate_*) is ignored.
 */
const MUTATING_TOOLS: Record<
  string,
  { action: string; resource: string; idFromArgs?: string }
> = {
  create_campaign: { action: "campaign.create", resource: "campaign" },
  update_campaign: {
    action: "campaign.update",
    resource: "campaign",
    idFromArgs: "campaign_id",
  },
  create_adset: { action: "adset.create", resource: "adset" },
  update_adset: {
    action: "adset.update",
    resource: "adset",
    idFromArgs: "adset_id",
  },
  create_ad: { action: "ad.create", resource: "ad" },
  update_ad: { action: "ad.update", resource: "ad", idFromArgs: "ad_id" },
  create_ad_creative: { action: "creative.create", resource: "creative" },
  update_ad_creative: {
    action: "creative.update",
    resource: "creative",
    idFromArgs: "creative_id",
  },
  create_budget_schedule: {
    action: "budget_schedule.create",
    resource: "budget_schedule",
  },
  upload_ad_image: { action: "ad_image.upload", resource: "ad_image" },
  upload_ad_video: { action: "ad_video.upload", resource: "ad_video" },
  request_creative_upload: {
    action: "creative_upload.request",
    resource: "creative_upload",
  },
  finalize_creative_upload: {
    action: "creative_upload.finalize",
    resource: "creative_upload",
  },
};

export interface AuditWrapperContext {
  env: Env;
  organizationId: string;
  /** From OrganizationContext.apiKeyId — "oauth:<client_id>" or api_key row id. */
  apiKeyId: string;
}

function actorFromApiKeyId(apiKeyId: string): AuditActor {
  if (apiKeyId.startsWith("oauth:")) {
    return { type: "mcp_oauth", identifier: apiKeyId };
  }
  return { type: "mcp_api_key", identifier: `api_key:${apiKeyId}` };
}

/**
 * Best-effort extraction of a resource ID from tool result text.
 * Tool responses follow the textResult shape: { content: [{ type: "text", text: JSON }] }.
 */
function extractResponse(result: unknown): {
  body: unknown;
  isError: boolean;
  id: string | null;
} {
  const r = result as
    | { content?: Array<{ text?: string }>; isError?: boolean }
    | undefined;
  const isError = Boolean(r?.isError);
  const text = r?.content?.[0]?.text;
  if (!text) return { body: null, isError, id: null };
  try {
    const parsed = JSON.parse(text);
    const id =
      parsed?.id ??
      parsed?.campaign_id ??
      parsed?.adset_id ??
      parsed?.ad_id ??
      parsed?.creative_id ??
      null;
    return { body: parsed, isError, id: id ? String(id) : null };
  } catch {
    return { body: null, isError, id: null };
  }
}

type ToolHandler = (args: any, extra?: any) => Promise<unknown> | unknown;
type ToolArgs = [
  name: string,
  description: string,
  schema: unknown,
  handler: ToolHandler,
];

/**
 * Return a Proxy around the server whose `.tool()` method wraps
 * handlers of MUTATING_TOOLS with an audit emitter.
 */
export function wrapServerWithAudit(
  server: McpServer,
  ctx: AuditWrapperContext,
): McpServer {
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop !== "tool") {
        return Reflect.get(target, prop, receiver);
      }

      return (...args: unknown[]) => {
        if (args.length < 4 || typeof args[3] !== "function") {
          return (target.tool as any).apply(target, args);
        }

        const [name, description, schema, handler] = args as ToolArgs;
        const cfg = MUTATING_TOOLS[name];
        if (!cfg) {
          return (target.tool as any).apply(target, args);
        }

        const wrapped: ToolHandler = async (toolArgs, extra) => {
          const startedAt = Date.now();
          let result: unknown;
          let threw: unknown = null;
          try {
            result = await handler(toolArgs, extra);
          } catch (err) {
            threw = err;
          }

          const { body, isError, id } = extractResponse(result);
          const resolvedId = cfg.idFromArgs
            ? String((toolArgs as any)?.[cfg.idFromArgs] ?? "") || id
            : id;

          const status: "success" | "error" =
            threw || isError ? "error" : "success";
          const errorMessage =
            threw instanceof Error
              ? threw.message
              : threw
                ? String(threw)
                : isError
                  ? JSON.stringify(body)?.slice(0, 500)
                  : null;

          recordAudit({
            supabaseUrl: ctx.env.SUPABASE_URL,
            serviceRoleKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
            orgId: ctx.organizationId,
            actor: actorFromApiKeyId(ctx.apiKeyId),
            action: cfg.action,
            resource: {
              type: cfg.resource,
              id: resolvedId,
              projectId: (toolArgs as any)?.project_id ?? null,
              metaAccountId: (toolArgs as any)?.account_id ?? null,
            },
            after: toolArgs, // the input that was accepted by Meta
            request: {
              requestId: `mcp:${startedAt}`,
            },
            status,
            errorMessage,
          }).catch(() => {
            /* recordAudit already swallows its own errors */
          });

          if (threw) throw threw;
          return result;
        };

        return (target.tool as any).apply(target, [
          name,
          description,
          schema,
          wrapped,
        ]);
      };
    },
  });
}

export { MUTATING_TOOLS };
