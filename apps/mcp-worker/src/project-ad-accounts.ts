import type { Env, ProjectSummary } from "./types";

const PROJECTS_CACHE_TTL = 300;        // 5 min
const PROJECT_ACCOUNTS_CACHE_TTL = 300; // 5 min

/**
 * Normalize Meta ad account IDs for comparison (Graph may return with or without act_).
 */
export function normalizeMetaAccountId(id: string): string {
  return id.replace(/^act_/, "");
}

/**
 * List every project visible inside an organization. Cached in KV.
 */
export async function fetchOrganizationProjects(
  organizationId: string,
  env: Env
): Promise<ProjectSummary[]> {
  const cacheKey = `v2:projects:${organizationId}`;
  const cached = await env.CACHE_KV.get<ProjectSummary[]>(cacheKey, "json");
  if (cached && Array.isArray(cached)) {
    return cached;
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/list_projects`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ p_organization_id: organizationId }),
    }
  );

  if (!response.ok) {
    console.error(
      "[projects] list_projects failed:",
      response.status,
      await response.text()
    );
    return [];
  }

  const rows = (await response.json()) as Array<{
    id: string;
    slug: string;
    name: string;
    is_default: boolean;
  }>;

  const projects: ProjectSummary[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    isDefault: r.is_default,
  }));

  await env.CACHE_KV.put(cacheKey, JSON.stringify(projects), {
    expirationTtl: PROJECTS_CACHE_TTL,
  });
  return projects;
}

/**
 * Enabled Meta ad account IDs across the given projects. Uses the
 * get_project_meta_account_ids RPC which applies a "if all-disabled
 * then return every account" fallback to prevent MCP lock-out.
 */
export async function fetchProjectEnabledMetaAccountIds(
  projectIds: string[],
  env: Env
): Promise<Map<string, string[]>> {
  const sorted = [...new Set(projectIds)].sort();
  if (sorted.length === 0) {
    return new Map();
  }
  const cacheKey = `v2:project_accounts:${sorted.join(",")}`;
  const cached = await env.CACHE_KV.get<Record<string, string[]>>(cacheKey, "json");
  if (cached) {
    return new Map(Object.entries(cached));
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/get_project_meta_account_ids`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ p_project_ids: sorted }),
    }
  );

  if (!response.ok) {
    console.error(
      "[projects] get_project_meta_account_ids failed:",
      response.status,
      await response.text()
    );
    return new Map();
  }

  const rows = (await response.json()) as Array<{
    project_id: string;
    meta_account_id: string;
  }>;

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.project_id) ?? [];
    list.push(row.meta_account_id);
    map.set(row.project_id, list);
  }

  const serialisable: Record<string, string[]> = {};
  for (const [k, v] of map.entries()) serialisable[k] = v;
  await env.CACHE_KV.put(cacheKey, JSON.stringify(serialisable), {
    expirationTtl: PROJECT_ACCOUNTS_CACHE_TTL,
  });
  return map;
}
