import { describe, it, expect, vi, beforeEach } from "vitest";
import { jsonRequest, parseJsonResponse, mockUser } from "./helpers";

// ── Mock Supabase ────────────────────────────────────────────

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

// ── Helpers to build Supabase query chains ──────────────────

function mockQueryChain(finalResult: { data: unknown; error: unknown }) {
  const chain: any = {};
  const methods = ["select", "insert", "update", "delete", "eq", "in", "single", "order", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(finalResult);
  chain.maybeSingle = vi.fn().mockResolvedValue(finalResult);
  // Make chain thenable
  chain.then = (resolve: any) => Promise.resolve(finalResult).then(resolve);
  return chain;
}

/** Head count query: await builder → { count, error } */
function mockHeadCountChain(count: number, error: unknown = null) {
  const result = { count, error };
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
    if (table === "projects") {
      // Validate allowed_projects belong to this organization.
      return mockQueryChain({ data: [{ id: "proj-1" }], error: null });
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
  mockGetUser.mockResolvedValue({
    data: { user },
    error: null,
  });
}

// ══════════════════════════════════════════════════════════════
// API Route: POST /api/organizations/[id]/disconnect
// ══════════════════════════════════════════════════════════════

describe("POST /api/organizations/[id]/disconnect", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await import("@/app/api/organizations/[id]/disconnect/route");
  });

  it("returns 401 when not authenticated", async () => {
    setupAuth(null);
    const res = await handler.POST(
      new Request("http://localhost/api/organizations/ws-1/disconnect", { method: "POST" }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not owner/admin", async () => {
    setupAuth(mockUser());
    // membership check returns null (not owner/admin)
    const chain = mockQueryChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await handler.POST(
      new Request("http://localhost/api/organizations/ws-1/disconnect", { method: "POST" }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(403);
    expect(body.error).toBe("Not authorized");
  });

  it("disconnects workspace when user is owner", async () => {
    setupAuth(mockUser());

    const callCount = { n: 0 };
    // First call: membership check → owner
    // Subsequent calls: update/delete operations
    mockFrom.mockImplementation(() => {
      callCount.n++;
      if (callCount.n === 1) {
        return mockQueryChain({ data: { role: "owner" }, error: null });
      }
      return mockQueryChain({ data: null, error: null });
    });

    const res = await handler.POST(
      new Request("http://localhost/api/organizations/ws-1/disconnect", { method: "POST" }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(body.success).toBe(true);

    // Verify it touched meta_tokens, business_managers, and workspaces tables
    const tables = mockFrom.mock.calls.map((c: any) => c[0]);
    expect(tables).toContain("memberships");
    expect(tables).toContain("meta_tokens");
    expect(tables).toContain("business_managers");
    expect(tables).toContain("organizations");
  });
});

// ══════════════════════════════════════════════════════════════
// API Route: PATCH /api/organizations/[id]/ad-accounts/[accountId]/toggle
// ══════════════════════════════════════════════════════════════

describe("PATCH /api/organizations/[id]/ad-accounts/[accountId]/toggle", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await import("@/app/api/organizations/[id]/ad-accounts/[accountId]/toggle/route");
  });

  it("returns 401 when not authenticated", async () => {
    setupAuth(null);
    const res = await handler.PATCH(
      jsonRequest({ is_enabled: true }, "PATCH"),
      { params: Promise.resolve({ id: "ws-1", accountId: "acc-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not owner/admin", async () => {
    setupAuth(mockUser());
    mockFrom.mockReturnValue(mockQueryChain({ data: null, error: null }));

    const res = await handler.PATCH(
      jsonRequest({ is_enabled: true }, "PATCH"),
      { params: Promise.resolve({ id: "ws-1", accountId: "acc-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("toggles account enabled state", async () => {
    setupAuth(mockUser());

    const callCount = { n: 0 };
    mockFrom.mockImplementation(() => {
      callCount.n++;
      if (callCount.n === 1) {
        return mockQueryChain({ data: { role: "admin" }, error: null });
      }
      if (callCount.n === 2) {
        return mockQueryChain({
          data: { meta_account_id: "act_999" },
          error: null,
        });
      }
      if (callCount.n === 3) {
        return mockQueryChain({ data: { id: "acc-1", is_enabled: false }, error: null });
      }
      return mockQueryChain({ data: [], error: null });
    });

    const res = await handler.PATCH(
      jsonRequest({ is_enabled: false }, "PATCH"),
      { params: Promise.resolve({ id: "ws-1", accountId: "acc-1" }) }
    );
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(body.id).toBe("acc-1");
  });
});

// ══════════════════════════════════════════════════════════════
// API Route: POST /api/organizations/[id]/connect
// ══════════════════════════════════════════════════════════════

describe("POST /api/organizations/[id]/connect", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await import("@/app/api/organizations/[id]/connect/route");
  });

  it("returns 401 when not authenticated", async () => {
    setupAuth(null);
    const res = await handler.POST(
      jsonRequest({ token: "EAA123456" }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when not owner/admin", async () => {
    setupAuth(mockUser());
    mockFrom.mockReturnValue(mockQueryChain({ data: null, error: null }));

    const res = await handler.POST(
      jsonRequest({ token: "EAA123456" }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing token", async () => {
    setupAuth(mockUser());
    const chain = mockQueryChain({ data: { role: "owner" }, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await handler.POST(
      jsonRequest({}),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for token shorter than 10 chars", async () => {
    setupAuth(mockUser());
    const chain = mockQueryChain({ data: { role: "owner" }, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await handler.POST(
      jsonRequest({ token: "short" }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid token");
  });

  it("rejects non-string token payloads", async () => {
    setupAuth(mockUser());
    const chain = mockQueryChain({ data: { role: "owner" }, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await handler.POST(
      jsonRequest({ token: 12345678901 }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════
// API Route: GET /api/organizations/[id]/oauth-connections
// ══════════════════════════════════════════════════════════════

describe("GET /api/organizations/[id]/oauth-connections", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await import("@/app/api/organizations/[id]/oauth-connections/route");
  });

  it("returns 401 when not authenticated", async () => {
    setupAuth(null);
    const res = await handler.GET(
      new Request("http://localhost/test"),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a member", async () => {
    setupAuth(mockUser());
    mockFrom.mockReturnValue(mockQueryChain({ data: null, error: null }));

    const res = await handler.GET(
      new Request("http://localhost/test"),
      { params: Promise.resolve({ id: "ws-1" }) }
    );
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════
// API Route: PATCH & DELETE /api/organizations/[id]/oauth-connections/[connectionId]
// ══════════════════════════════════════════════════════════════

describe("PATCH /api/organizations/[id]/oauth-connections/[connectionId]", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await import("@/app/api/organizations/[id]/oauth-connections/[connectionId]/route");
  });

  it("returns 401 when not authenticated", async () => {
    setupAuth(null);
    const res = await handler.PATCH(
      jsonRequest({ allowed_accounts: ["act_123"] }, "PATCH"),
      { params: Promise.resolve({ id: "ws-1", connectionId: "conn-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when not owner/admin", async () => {
    setupAuth(mockUser());
    mockFrom.mockReturnValue(mockQueryChain({ data: null, error: null }));

    const res = await handler.PATCH(
      jsonRequest({ allowed_accounts: ["act_123"] }, "PATCH"),
      { params: Promise.resolve({ id: "ws-1", connectionId: "conn-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when no fields to update", async () => {
    setupAuth(mockUser());
    const callCount = { n: 0 };
    mockFrom.mockImplementation(() => {
      callCount.n++;
      if (callCount.n === 1) return mockQueryChain({ data: { role: "owner" }, error: null });
      return mockQueryChain({ data: null, error: null });
    });

    const res = await handler.PATCH(
      jsonRequest({}, "PATCH"),
      { params: Promise.resolve({ id: "ws-1", connectionId: "conn-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 on DELETE when not authenticated", async () => {
    setupAuth(null);
    const res = await handler.DELETE(
      new Request("http://localhost/test", { method: "DELETE" }),
      { params: Promise.resolve({ id: "ws-1", connectionId: "conn-1" }) }
    );
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════
// API Route: POST /api/oauth/approve
// ══════════════════════════════════════════════════════════════

describe("POST /api/oauth/approve", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await import("@/app/api/oauth/approve/route");
  });

  it("returns 401 when not authenticated", async () => {
    setupAuth(null);
    const res = await handler.POST(
      new Request("http://localhost/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: "req-1", organization_id: "ws-1", user_id: "user-123" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when missing request_id", async () => {
    setupAuth(mockUser());
    const res = await handler.POST(
      new Request("http://localhost/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: "ws-1", user_id: "user-123" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when user_id does not match authenticated user", async () => {
    setupAuth(mockUser({ id: "user-123" }));
    const res = await handler.POST(
      new Request("http://localhost/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: "req-1", organization_id: "ws-1", user_id: "user-DIFFERENT" }),
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("User mismatch");
  });

  it("returns 403 when user has no workspace access", async () => {
    setupAuth(mockUser({ id: "user-123" }));
    mockFrom.mockReturnValue(mockQueryChain({ data: null, error: null }));

    const res = await handler.POST(
      new Request("http://localhost/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: "req-1", organization_id: "ws-1", user_id: "user-123" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns JWT redirect URL on success", async () => {
    setupAuth(mockUser({ id: "user-123" }));
    mockApproveFromSuccess();

    const res = await handler.POST(
      new Request("http://localhost/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: "req-1",
          organization_id: "ws-1",
          user_id: "user-123",
          allowed_projects: ["proj-1"],
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirect_url).toContain("/oauth/callback?token=");

    // Verify JWT structure (header.payload.signature)
    const tokenParam = new URL(body.redirect_url).searchParams.get("token")!;
    const parts = tokenParam.split(".");
    expect(parts).toHaveLength(3);

    // Verify payload
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload.request_id).toBe("req-1");
    expect(payload.organization_id).toBe("ws-1");
    expect(payload.user_id).toBe("user-123");
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(payload.exp - payload.iat).toBe(30); // 30 seconds TTL
  });

  it("returns 403 when MCP connection limit is reached", async () => {
    setupAuth(mockUser({ id: "user-123" }));
    mockFrom.mockImplementation((table: string) => {
      if (table === "memberships") {
        return mockQueryChain({ data: { role: "owner" }, error: null });
      }
      if (table === "projects") {
        return mockQueryChain({ data: [{ id: "proj-1" }], error: null });
      }
      if (table === "subscriptions") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({
          data: { tier: "pro", max_mcp_connections: 1 },
          error: null,
        });
        return chain;
      }
      if (table === "oauth_connections") {
        return mockHeadCountChain(1);
      }
      return mockQueryChain({ data: null, error: null });
    });

    const res = await handler.POST(
      new Request("http://localhost/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: "req-1",
          organization_id: "ws-1",
          user_id: "user-123",
          oauth_client_id: "client_new",
          allowed_projects: ["proj-1"],
        }),
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("MCP connection limit reached");
  });
});
