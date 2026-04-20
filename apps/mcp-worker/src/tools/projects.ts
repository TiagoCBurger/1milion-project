import { z } from "zod";
import type { ToolContext } from "./index";
import { fetchProjectEnabledMetaAccountIds } from "../project-ad-accounts";

/**
 * Project discovery tools. Every agent should call `list_projects`
 * before any data or mutation tool so it knows which project_id to pass.
 */
export function registerProjectTools(ctx: ToolContext): void {
  const { server, env } = ctx;
  const availableProjects = ctx.availableProjects ?? [];
  const allowedProjectIds = ctx.allowedProjectIds ?? [];

  server.tool(
    "list_projects",
    "List the projects this MCP connection is authorized to operate on. Call this first — the chosen project_id must be passed to subsequent tool calls.",
    {},
    async () => {
      const visible = availableProjects.filter((p) =>
        allowedProjectIds.includes(p.id)
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              projects: visible.map((p) => ({
                id: p.id,
                slug: p.slug,
                name: p.name,
                is_default: p.isDefault,
              })),
              total: visible.length,
              hint:
                visible.length === 1
                  ? "Only one project is authorized — project_id can be omitted on data tools."
                  : "Pass project_id (accepts id or slug) on data tools to scope results.",
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "get_project",
    "Describe a single project: its ad accounts and the sites tracked in it. Useful to pre-check a project before running data tools.",
    {
      project_id: z
        .string()
        .describe("Project ID or slug. Must be one of the projects returned by list_projects."),
    },
    async (args) => {
      const project = availableProjects.find(
        (p: { id: string; slug: string }) =>
          p.id === args.project_id || p.slug === args.project_id
      );
      if (!project || !allowedProjectIds.includes(project.id)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "project_not_allowed",
                message: `Project '${args.project_id}' is not available to this connection. Call list_projects first.`,
              }),
            },
          ],
          isError: true,
        };
      }

      const [accountsMap, sitesRes] = await Promise.all([
        fetchProjectEnabledMetaAccountIds([project.id], env),
        fetch(
          `${env.SUPABASE_URL}/rest/v1/sites?project_id=eq.${project.id}&select=id,domain,is_active`,
          {
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Accept-Profile": "analytics",
            },
          }
        ),
      ]);

      const metaAccountIds = accountsMap.get(project.id) ?? [];

      let sites: Array<{ id: string; domain: string; is_active: boolean }> = [];
      if (sitesRes.ok) {
        try {
          sites = (await sitesRes.json()) as typeof sites;
        } catch {
          /* ignore */
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              project: {
                id: project.id,
                slug: project.slug,
                name: project.name,
                is_default: project.isDefault,
              },
              ad_accounts: metaAccountIds.map((id) => ({ meta_account_id: id })),
              sites,
            }),
          },
        ],
      };
    }
  );
}
