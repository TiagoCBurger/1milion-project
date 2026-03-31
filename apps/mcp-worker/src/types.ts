export interface Env {
  // KV Namespaces
  RATE_LIMIT_KV: KVNamespace;
  CACHE_KV: KVNamespace;

  // Secrets
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export interface WorkspaceContext {
  workspaceId: string;
  apiKeyId: string;
  tier: "free" | "pro" | "enterprise";
  requestsPerMinute: number;
  requestsPerDay: number;
}

export interface RateLimitResult {
  limited: boolean;
  limit?: number;
  retryAfter?: number;
}
