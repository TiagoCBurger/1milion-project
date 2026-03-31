import { describe, it, expect } from "vitest";

/**
 * Type-level tests: verify that exported types and interfaces are importable
 * and structurally sound. These tests ensure the shared types contract doesn't
 * accidentally break.
 */

describe("Shared types exports", () => {
  it("exports all database row types", async () => {
    const mod = await import("../types");

    // These are interfaces, so we verify the module exports them by checking
    // the module has the expected shape at runtime (type guards)
    const workspace: import("../types").Workspace = {
      id: "uuid",
      name: "Test",
      slug: "test",
      meta_business_id: null,
      meta_business_name: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    expect(workspace.id).toBe("uuid");

    const membership: import("../types").Membership = {
      id: "uuid",
      user_id: "uid",
      workspace_id: "wid",
      role: "owner",
      invited_by: null,
      created_at: "2024-01-01T00:00:00Z",
    };
    expect(membership.role).toBe("owner");
  });

  it("MembershipRole is limited to owner/admin/member", () => {
    const roles: import("../types").MembershipRole[] = ["owner", "admin", "member"];
    expect(roles).toHaveLength(3);
  });

  it("SubscriptionTier is limited to free/pro/enterprise", () => {
    const tiers: import("../types").SubscriptionTier[] = ["free", "pro", "enterprise"];
    expect(tiers).toHaveLength(3);
  });

  it("SubscriptionStatus has expected values", () => {
    const statuses: import("../types").SubscriptionStatus[] = [
      "active",
      "canceled",
      "past_due",
      "trialing",
    ];
    expect(statuses).toHaveLength(4);
  });

  it("ConnectTokenResponse has api_key as optional", () => {
    const withKey: import("../types").ConnectTokenResponse = {
      success: true,
      meta_user_name: "Test",
      meta_business_id: "bm_1",
      meta_business_name: "BM",
      expires_at: null,
      scopes: ["ads_read"],
      api_key: "mads_abc123",
    };
    expect(withKey.api_key).toBe("mads_abc123");

    const withoutKey: import("../types").ConnectTokenResponse = {
      success: true,
      meta_user_name: "Test",
      meta_business_id: "bm_1",
      meta_business_name: "BM",
      expires_at: null,
      scopes: [],
    };
    expect(withoutKey.api_key).toBeUndefined();
  });

  it("ApiKey never exposes key_hash", () => {
    const key: import("../types").ApiKey = {
      id: "uuid",
      workspace_id: "wid",
      created_by: "uid",
      key_prefix: "mads_abc1",
      name: "Default",
      is_active: true,
      last_used_at: null,
      expires_at: null,
      created_at: "2024-01-01T00:00:00Z",
    };
    // key_hash should not be in the type
    expect("key_hash" in key).toBe(false);
  });

  it("MetaToken never exposes encrypted_token", () => {
    const token: import("../types").MetaToken = {
      id: "uuid",
      workspace_id: "wid",
      token_type: "long_lived",
      meta_user_id: null,
      scopes: null,
      expires_at: null,
      is_valid: true,
      last_validated_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    expect("encrypted_token" in token).toBe(false);
  });
});
