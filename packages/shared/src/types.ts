// ============================================================
// Database row types (matching Supabase schema)
// ============================================================

export interface Profile {
  id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  meta_business_id: string | null;
  meta_business_name: string | null;
  created_at: string;
  updated_at: string;
}

export type MembershipRole = "owner" | "admin" | "member";

export interface Membership {
  id: string;
  user_id: string;
  workspace_id: string;
  role: MembershipRole;
  invited_by: string | null;
  created_at: string;
}

export interface MetaToken {
  id: string;
  workspace_id: string;
  token_type: "short_lived" | "long_lived" | "system_user";
  meta_user_id: string | null;
  scopes: string[] | null;
  expires_at: string | null;
  is_valid: boolean;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
  // encrypted_token is never exposed to frontend
}

export interface ApiKey {
  id: string;
  workspace_id: string;
  created_by: string;
  key_prefix: string;
  name: string;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export type SubscriptionTier = "free" | "pro" | "enterprise";
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing";

export interface Subscription {
  id: string;
  workspace_id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  requests_per_minute: number;
  requests_per_day: number;
  created_at: string;
  updated_at: string;
}

export interface UsageLog {
  id: string;
  workspace_id: string;
  api_key_id: string | null;
  tool_name: string;
  method: string;
  status_code: number | null;
  response_time_ms: number | null;
  is_error: boolean;
  error_type: string | null;
  created_at: string;
}

// ============================================================
// API response types
// ============================================================

export interface ValidateApiKeyResult {
  workspace_id: string;
  api_key_id: string;
  tier: SubscriptionTier;
  requests_per_minute: number;
  requests_per_day: number;
}

export interface ConnectTokenRequest {
  token: string;
}

export interface ConnectTokenResponse {
  success: boolean;
  meta_user_name: string;
  meta_business_id: string;
  meta_business_name: string;
  expires_at: string | null;
  scopes: string[];
  api_key?: string; // Only on first connection
}

export interface CreateWorkspaceRequest {
  name: string;
  slug: string;
}

export interface GenerateApiKeyRequest {
  name?: string;
}

export interface GenerateApiKeyResponse {
  id: string;
  key: string; // Full key, shown only once
  key_prefix: string;
  name: string;
}
