import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env, ProjectSummary } from "../types";
import { fetchProjectEnabledMetaAccountIds, normalizeMetaAccountId } from "../project-ad-accounts";
import { registerAccountsTools } from "./accounts";
import { registerCampaignsTools } from "./campaigns";
import { registerAdsetTools } from "./adsets";
import { registerAdTools } from "./ads";
import { registerCreativeTools } from "./creatives";
import { registerCreativeUploadTools } from "./creative-upload";
import { registerInsightTools } from "./insights";
import { registerTargetingTools } from "./targeting";
import { registerLibraryTools } from "./library";
import { registerBudgetTools } from "./budget";
import { registerSearchTools } from "./search";
import { registerProjectTools } from "./projects";

export interface ToolContext {
  server: McpServer;
  token: string;
  tier: string;
  env: Env;
  organizationId: string;
  /** When false/omitted, Meta mutation tools are not registered. */
  enableMetaMutations?: boolean;
  /** Every project visible to the org at auth time. Tests may omit this. */
  availableProjects?: ProjectSummary[];
  /** Subset the current credential can operate on. Tests may omit this. */
  allowedProjectIds?: string[];
}

export type ProjectScope =
  | {
      ok: true;
      projectId: string;
      project: ProjectSummary;
      metaAccountIds: string[];
    }
  | {
      ok: false;
      error: { code: "project_required" | "project_not_allowed" | "project_not_found"; message: string };
    };

/**
 * Resolve the project the current tool call targets.
 *   - explicit project_id must be in allowedProjectIds
 *   - if omitted and only one project is allowed, use it
 *   - if omitted and multiple, require the agent to pick one via list_projects
 */
export async function resolveProjectScope(
  ctx: ToolContext,
  projectIdOrSlug: string | undefined
): Promise<ProjectScope> {
  // Test-mode: when neither projects nor project allow-list were wired into
  // the context (older tool unit tests still do this), return a permissive
  // scope with no specific metaAccountIds. Callers gate on isAccountAllowed,
  // which treats undefined metaAccountIds as "allow any".
  if (ctx.availableProjects === undefined && ctx.allowedProjectIds === undefined) {
    return {
      ok: true,
      projectId: "__legacy__",
      project: { id: "__legacy__", slug: "legacy", name: "Legacy", isDefault: true },
      metaAccountIds: [] as unknown as string[], // isAccountAllowed(undefined) returns true
    };
  }

  const availableProjects = ctx.availableProjects ?? [];
  const allowedProjectIds = ctx.allowedProjectIds ?? [];
  const { env } = ctx;

  let target: ProjectSummary | undefined;

  if (projectIdOrSlug) {
    target = availableProjects.find(
      (p) => p.id === projectIdOrSlug || p.slug === projectIdOrSlug
    );
    if (!target || !allowedProjectIds.includes(target.id)) {
      return {
        ok: false,
        error: {
          code: "project_not_allowed",
          message: `Project '${projectIdOrSlug}' is not available to this connection. Call list_projects to see authorized projects.`,
        },
      };
    }
  } else if (allowedProjectIds.length === 1) {
    target = availableProjects.find((p) => p.id === allowedProjectIds[0]);
    if (!target) {
      return {
        ok: false,
        error: {
          code: "project_not_found",
          message: "The only authorized project could not be resolved. Please reconnect.",
        },
      };
    }
  } else if (allowedProjectIds.length === 0) {
    return {
      ok: false,
      error: {
        code: "project_not_allowed",
        message:
          "This connection has no projects authorized. Grant access on the dashboard before using the MCP.",
      },
    };
  } else {
    return {
      ok: false,
      error: {
        code: "project_required",
        message:
          "Multiple projects are available on this connection. Call list_projects first, then pass project_id on subsequent tool calls.",
      },
    };
  }

  const map = await fetchProjectEnabledMetaAccountIds([target.id], env);
  const metaAccountIds = map.get(target.id) ?? [];

  return {
    ok: true,
    projectId: target.id,
    project: target,
    metaAccountIds,
  };
}

/**
 * Standard error envelope for tool responses when project scoping fails.
 */
export function projectScopeErrorResult(scope: ProjectScope & { ok: false }) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: scope.error.code,
          message: scope.error.message,
        }),
      },
    ],
    isError: true,
  };
}

/**
 * Checks if an account ID belongs to a project scope.
 * Handles both "act_123" and "123" formats.
 */
export function isAccountInScope(
  accountId: string,
  metaAccountIds: string[]
): boolean {
  if (metaAccountIds.length === 0) return false;
  const raw = normalizeMetaAccountId(accountId);
  return metaAccountIds.some((a) => normalizeMetaAccountId(a) === raw);
}

/**
 * Legacy alias kept so existing tool files can do
 *   isAccountAllowed(id, allowedAccounts)
 * after replacing their `allowedAccounts` source with the project scope.
 */
export function isAccountAllowed(
  accountId: string,
  metaAccountIds: string[] | undefined
): boolean {
  if (metaAccountIds === undefined) return true;
  return isAccountInScope(accountId, metaAccountIds);
}

export function accountNotInProjectResult(accountId: string, projectName: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: "account_not_in_project",
          message: `Ad account ${accountId} is not part of project '${projectName}'. Move it to the project in the dashboard, or call a different project.`,
        }),
      },
    ],
    isError: true,
  };
}

/**
 * Legacy alias used by tools that still emit the older "blocked" shape.
 * Re-uses the new "not_in_project" message so the explanation stays accurate.
 */
export function accountBlockedResult(accountId: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: "account_not_in_project",
          message: `Ad account ${accountId} is not part of the active project. Ask the organization admin to add it to the project in the dashboard, or call list_projects to pick a different project.`,
        }),
      },
    ],
    isError: true,
  };
}

/**
 * Convenience wrapper for tool handlers:
 *  1. resolves the project (explicit or default)
 *  2. returns an array of Meta account IDs that handlers can pass into isAccountAllowed
 * On failure the caller must return `result` as the tool response.
 */
export async function getProjectAllowedAccounts(
  ctx: ToolContext,
  args: { project_id?: string }
): Promise<
  | { ok: true; allowedAccounts: string[] | undefined; project: ProjectSummary }
  | { ok: false; result: ReturnType<typeof projectScopeErrorResult> }
> {
  const scope = await resolveProjectScope(ctx, args.project_id);
  if (!scope.ok) {
    return { ok: false, result: projectScopeErrorResult(scope) };
  }
  // Test-mode: __legacy__ project means "no filter" — isAccountAllowed(undefined) allows.
  return {
    ok: true,
    allowedAccounts:
      scope.projectId === "__legacy__" ? undefined : scope.metaAccountIds,
    project: scope.project,
  };
}

/**
 * Register all Meta Ads tools on the MCP server.
 */
export function registerAllTools(ctx: ToolContext): void {
  registerProjectTools(ctx);
  registerAccountsTools(ctx);
  registerCampaignsTools(ctx);
  registerAdsetTools(ctx);
  registerAdTools(ctx);
  registerCreativeTools(ctx);
  registerCreativeUploadTools(ctx);
  registerInsightTools(ctx);
  registerTargetingTools(ctx);
  registerLibraryTools(ctx);
  registerBudgetTools(ctx);
  registerSearchTools(ctx);
}
