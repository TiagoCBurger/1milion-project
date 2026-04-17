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

  // Config vars
  MCP_SERVER_URL: string;
  WEB_APP_URL: string;
}

export interface WorkspaceContext {
  workspaceId: string;
  apiKeyId: string;
  tier: "free" | "pro" | "max" | "enterprise";
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  maxMcpConnections: number;
  maxAdAccounts: number;
  enableMetaMutations: boolean;
  allowedAccounts?: string[];
}

export interface RateLimitResult {
  limited: boolean;
  limit?: number;
  retryAfter?: number;
  scope?: "minute" | "hour" | "day";
}
