export interface Env {
  // KV Namespaces
  RATE_LIMIT_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  OAUTH_KV: KVNamespace;

  // Durable Objects
  RATE_LIMIT_DO: DurableObjectNamespace;

  // R2 Buckets
  CREATIVES_R2: R2Bucket;

  // Secrets
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  R2_PUBLIC_URL: string;
  OAUTH_SIGNING_SECRET: string;
  /** Shared secret with the web app for MCP-originated upload calls. */
  INTERNAL_API_TOKEN?: string;

  // Config vars
  MCP_SERVER_URL: string;
  WEB_APP_URL: string;
}

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
}

export interface OrganizationContext {
  organizationId: string;
  apiKeyId: string;
  tier: "free" | "pro" | "max" | "enterprise";
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  maxMcpConnections: number;
  maxAdAccounts: number;
  enableMetaMutations: boolean;
  /** Every project visible to this org (read from DB at auth time). */
  availableProjects: ProjectSummary[];
  /**
   * Subset of availableProjects the current credential is authorized to operate on.
   * - API key: defaults to every project in the org.
   * - OAuth: taken from oauth_connections.allowed_projects.
   */
  allowedProjectIds: string[];
}

export interface RateLimitResult {
  limited: boolean;
  limit?: number;
  retryAfter?: number;
  scope?: "minute" | "hour" | "day";
}
