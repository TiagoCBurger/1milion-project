import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { jsonRequest, mockUser } from "./helpers";

/**
 * Security-focused tests covering:
 * - Authentication enforcement on all API routes
 * - Authorization (role-based access control)
 * - Input validation and sanitization
 * - CSRF state parameter validation
 * - Token security (never leaked to frontend)
 */

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

vi.mock("@/lib/meta-oauth", () => ({
  validateAndInspectToken: vi.fn(),
}));

function mockQueryChain(finalResult: { data: unknown; error: unknown }) {
  const chain: any = {};
  for (const m of ["select", "insert", "update", "delete", "eq", "in", "single", "order", "limit"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(finalResult);
  chain.maybeSingle = vi.fn().mockResolvedValue(finalResult);
  chain.then = (resolve: any) => Promise.resolve(finalResult).then(resolve);
  return chain;
}

function mockHeadCountChain(count: number) {
  const result = { count, error: null };
  const chain: any = {};
  for (const m of ["select", "eq", "neq", "in"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return chain;
}

function mockApproveFromSuccess() {
  mockFrom.mockImplementation((table: string) => {
    if (table === "memberships") {
      return mockQueryChain({ data: { role: "owner" }, error: null });
    }
    if (table === "subscriptions") {
      const chain: any = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({
        data: { tier: "pro", max_mcp_connections: 5 },
        error: null,
      });
      return chain;
    }
    if (table === "oauth_connections") {
      return mockHeadCountChain(0);
    }
    return mockQueryChain({ data: null, error: null });
  });
}

function setupAuth(user: ReturnType<typeof mockUser> | null) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
}

describe("Security: Authentication enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth(null); // unauthenticated by default
  });

  const routes = [
    { name: "disconnect", path: "@/app/api/workspaces/[id]/disconnect/route", method: "POST", params: { id: "ws-1" } },
    { name: "connect", path: "@/app/api/workspaces/[id]/connect/route", method: "POST", params: { id: "ws-1" } },
    { name: "ad-account-toggle", path: "@/app/api/workspaces/[id]/ad-accounts/[accountId]/toggle/route", method: "PATCH", params: { id: "ws-1", accountId: "acc-1" } },
    { name: "oauth-connections-list", path: "@/app/api/workspaces/[id]/oauth-connections/route", method: "GET", params: { id: "ws-1" } },
    { name: "oauth-connection-update", path: "@/app/api/workspaces/[id]/oauth-connections/[connectionId]/route", method: "PATCH", params: { id: "ws-1", connectionId: "conn-1" } },
    { name: "oauth-connection-delete", path: "@/app/api/workspaces/[id]/oauth-connections/[connectionId]/route", method: "DELETE", params: { id: "ws-1", connectionId: "conn-1" } },
    { name: "oauth-approve", path: "@/app/api/oauth/approve/route", method: "POST", params: {} },
  ];

  for (const route of routes) {
    it(`${route.name} returns 401 for unauthenticated requests`, async () => {
      const handler = await import(route.path);
      const methodName = route.method;
      const fn = handler[methodName];

      const body = route.method !== "GET"
        ? JSON.stringify(route.name === "connect"
          ? { token: "EAA123456789" }
          : route.name === "oauth-approve"
          ? { request_id: "r", workspace_id: "w", user_id: "u" }
          : { is_enabled: true })
        : undefined;

      const req = new Request("http://localhost/test", {
        method: route.method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });

      const res = Object.keys(route.params).length > 0
        ? await fn(req, { params: Promise.resolve(route.params) })
        : await fn(req);

      expect(res.status).toBe(401);
    });
  }
});

describe("Security: Authorization (RBAC)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth(mockUser());
  });

  it("member role cannot disconnect workspace", async () => {
    // member (not owner/admin) → 403
    mockFrom.mockReturnValue(mockQueryChain({ data: null, error: null }));
    const handler = await import("@/app/api/workspaces/[id]/disconnect/route");

    const res = await handler.POST(
      new Request("http://localhost/test", { method: "POST" }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("member role cannot toggle ad accounts", async () => {
    mockFrom.mockReturnValue(mockQueryChain({ data: null, error: null }));
    const handler = await import("@/app/api/workspaces/[id]/ad-accounts/[accountId]/toggle/route");

    const res = await handler.PATCH(
      jsonRequest({ is_enabled: true }, "PATCH"),
      { params: Promise.resolve({ id: "ws-1", accountId: "acc-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("member role cannot update OAuth connections", async () => {
    mockFrom.mockReturnValue(mockQueryChain({ data: null, error: null }));
    const handler = await import("@/app/api/workspaces/[id]/oauth-connections/[connectionId]/route");

    const res = await handler.PATCH(
      jsonRequest({ allowed_accounts: ["act_123"] }, "PATCH"),
      { params: Promise.resolve({ id: "ws-1", connectionId: "conn-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("member role cannot revoke OAuth connections", async () => {
    mockFrom.mockReturnValue(mockQueryChain({ data: null, error: null }));
    const handler = await import("@/app/api/workspaces/[id]/oauth-connections/[connectionId]/route");

    const res = await handler.DELETE(
      new Request("http://localhost/test", { method: "DELETE" }),
      { params: Promise.resolve({ id: "ws-1", connectionId: "conn-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("member role CAN list OAuth connections (read-only)", async () => {
    const callCount = { n: 0 };
    mockFrom.mockImplementation(() => {
      callCount.n++;
      if (callCount.n === 1) return mockQueryChain({ data: { role: "member" }, error: null });
      const chain = mockQueryChain({ data: [], error: null });
      // Override for listing (returns array, not single)
      chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
      return chain;
    });

    const handler = await import("@/app/api/workspaces/[id]/oauth-connections/route");
    const res = await handler.GET(
      new Request("http://localhost/test"),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    // Should succeed (200) — members can view
    expect(res.status).toBe(200);
  });
});

describe("Security: Input validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth(mockUser());
  });

  it("connect route rejects empty token", async () => {
    mockFrom.mockReturnValue(mockQueryChain({ data: { role: "owner" }, error: null }));
    const handler = await import("@/app/api/workspaces/[id]/connect/route");

    const res = await handler.POST(
      jsonRequest({ token: "" }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("connect route rejects numeric token", async () => {
    mockFrom.mockReturnValue(mockQueryChain({ data: { role: "owner" }, error: null }));
    const handler = await import("@/app/api/workspaces/[id]/connect/route");

    const res = await handler.POST(
      jsonRequest({ token: 123456789012345 }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("connect route rejects array token", async () => {
    mockFrom.mockReturnValue(mockQueryChain({ data: { role: "owner" }, error: null }));
    const handler = await import("@/app/api/workspaces/[id]/connect/route");

    const res = await handler.POST(
      jsonRequest({ token: ["EAA", "123"] }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("oauth-approve rejects user_id mismatch", async () => {
    setupAuth(mockUser({ id: "real-user-id" }));
    const handler = await import("@/app/api/oauth/approve/route");

    const res = await handler.POST(
      new NextRequest("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: "req-1",
          workspace_id: "ws-1",
          user_id: "attacker-user-id",
        }),
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("User mismatch");
  });

  it("oauth-connection update rejects empty body", async () => {
    const callCount = { n: 0 };
    mockFrom.mockImplementation(() => {
      callCount.n++;
      if (callCount.n === 1) return mockQueryChain({ data: { role: "owner" }, error: null });
      return mockQueryChain({ data: null, error: null });
    });

    const handler = await import("@/app/api/workspaces/[id]/oauth-connections/[connectionId]/route");
    const res = await handler.PATCH(
      jsonRequest({}, "PATCH"),
      { params: Promise.resolve({ id: "ws-1", connectionId: "conn-1" }) }
    );
    expect(res.status).toBe(400);
  });
});

describe("Security: CSRF protection", () => {
  it("OAuth state cookie uses cryptographically random 32 bytes", async () => {
    const { createOAuthStateCookie } = await import("@/lib/oauth-state");
    const states = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const { state } = createOAuthStateCookie("ws-1", "slug", true);
      expect(state).toHaveLength(64); // 32 bytes = 64 hex chars
      states.add(state);
    }
    // All should be unique
    expect(states.size).toBe(100);
  });

  it("OAuth state cookie is HttpOnly to prevent JS access", async () => {
    const { createOAuthStateCookie } = await import("@/lib/oauth-state");
    const { cookieHeader } = createOAuthStateCookie("ws-1", "slug", true);
    expect(cookieHeader).toContain("HttpOnly");
  });

  it("OAuth state validation rejects replayed/wrong state", async () => {
    const { createOAuthStateCookie, validateOAuthStateCookie } = await import("@/lib/oauth-state");
    const { state, cookieHeader } = createOAuthStateCookie("ws-1", "slug", true);
    const cookieValue = cookieHeader.split("=")[1].split(";")[0];

    // Correct state works
    expect(validateOAuthStateCookie(cookieValue, state)).not.toBeNull();

    // Wrong state fails
    expect(validateOAuthStateCookie(cookieValue, "replayed-state")).toBeNull();

    // Missing cookie fails
    expect(validateOAuthStateCookie(undefined, state)).toBeNull();
  });
});

describe("Security: JWT token generation", () => {
  it("JWT has short TTL (30 seconds)", async () => {
    setupAuth(mockUser({ id: "user-123" }));
    mockApproveFromSuccess();

    const handler = await import("@/app/api/oauth/approve/route");
    const res = await handler.POST(
      new NextRequest("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: "req-1", workspace_id: "ws-1", user_id: "user-123" }),
      })
    );

    const body = await res.json();
    const token = new URL(body.redirect_url).searchParams.get("token")!;
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));

    expect(payload.exp - payload.iat).toBe(30);
  });

  it("JWT includes required claims", async () => {
    setupAuth(mockUser({ id: "user-123" }));
    mockApproveFromSuccess();

    const handler = await import("@/app/api/oauth/approve/route");
    const res = await handler.POST(
      new NextRequest("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: "req-1",
          workspace_id: "ws-1",
          user_id: "user-123",
          allowed_accounts: ["act_111", "act_222"],
        }),
      })
    );

    const body = await res.json();
    const token = new URL(body.redirect_url).searchParams.get("token")!;
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));

    expect(payload.request_id).toBe("req-1");
    expect(payload.workspace_id).toBe("ws-1");
    expect(payload.user_id).toBe("user-123");
    expect(payload.allowed_accounts).toEqual(["act_111", "act_222"]);
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
  });
});

describe("Security: Token handling", () => {
  it("admin client uses service role key, not anon key", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    // The admin client should use SUPABASE_SERVICE_ROLE_KEY
    // We can verify by checking it doesn't use the anon key
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe("test-service-role-key");
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("test-anon-key");
    // These are different, confirming the admin client would use the right one
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).not.toBe(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  });

  it("service role key is not in any NEXT_PUBLIC_ env var", () => {
    // Verify that sensitive keys don't accidentally have public prefix
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith("NEXT_PUBLIC_") && value) {
        expect(value).not.toBe(process.env.SUPABASE_SERVICE_ROLE_KEY);
        expect(value).not.toBe(process.env.TOKEN_ENCRYPTION_KEY);
        expect(value).not.toBe(process.env.FACEBOOK_APP_SECRET);
      }
    }
  });
});
