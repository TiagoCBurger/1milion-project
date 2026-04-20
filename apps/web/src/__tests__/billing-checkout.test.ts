import { describe, it, expect, vi, beforeEach } from "vitest";
import { jsonRequest, parseJsonResponse, mockUser } from "./helpers";

// ── Mock Supabase ────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

// ── Mock AbacatePay ─────────────────────────────────────────

const mockCreateCustomer = vi.fn();
const mockCreateSubscriptionCheckout = vi.fn();
const mockGetProductId = vi.fn();

vi.mock("@/lib/abacatepay", () => ({
  createCustomer: (...args: unknown[]) => mockCreateCustomer(...args),
  createSubscriptionCheckout: (...args: unknown[]) => mockCreateSubscriptionCheckout(...args),
  getProductId: (...args: unknown[]) => mockGetProductId(...args),
}));

// ── Helpers ─────────────────────────────────────────────────

function mockQueryChain(finalResult: { data: unknown; error: unknown }) {
  const chain: any = {};
  const methods = ["select", "insert", "update", "delete", "eq", "neq", "in", "single", "order"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(finalResult);
  chain.then = (resolve: any) => Promise.resolve(finalResult).then(resolve);
  return chain;
}

function setupAuth(user: ReturnType<typeof mockUser> | null) {
  mockGetUser.mockResolvedValue({
    data: { user },
    error: null,
  });
}

// ══════════════════════════════════════════════════════════════

describe("POST /api/billing/checkout", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await import("@/app/api/billing/checkout/route");
  });

  it("returns 401 when not authenticated", async () => {
    setupAuth(null);
    const res = await handler.POST(
      jsonRequest({ organization_id: "ws-1", tier: "pro", cycle: "monthly" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing fields", async () => {
    setupAuth(mockUser());
    const res = await handler.POST(jsonRequest({ organization_id: "ws-1" }));
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain("Missing required");
  });

  it("returns 400 for invalid tier", async () => {
    setupAuth(mockUser());
    const res = await handler.POST(
      jsonRequest({ organization_id: "ws-1", tier: "ultra", cycle: "monthly" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid cycle", async () => {
    setupAuth(mockUser());
    const res = await handler.POST(
      jsonRequest({ organization_id: "ws-1", tier: "pro", cycle: "weekly" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not owner/admin", async () => {
    setupAuth(mockUser());
    mockFrom.mockReturnValue(mockQueryChain({ data: null, error: null }));

    const res = await handler.POST(
      jsonRequest({ organization_id: "ws-1", tier: "pro", cycle: "monthly" })
    );
    expect(res.status).toBe(403);
  });

  it("creates checkout and returns URL on success", async () => {
    const user = mockUser();
    setupAuth(user);

    // mockFrom for membership check
    const memberChain = mockQueryChain({ data: { role: "owner" }, error: null });
    // mockFrom for workspace slug
    const slugChain = mockQueryChain({ data: { slug: "my-workspace" }, error: null });
    let fromCount = 0;
    mockFrom.mockImplementation(() => {
      fromCount++;
      if (fromCount === 1) return memberChain;
      return slugChain;
    });

    // Admin: subscription fetch
    const subChain = mockQueryChain({
      data: { id: "sub-id", abacatepay_customer_id: null },
      error: null,
    });
    // Admin: subscription update (after customer creation)
    const updateChain = mockQueryChain({ data: null, error: null });
    let adminCount = 0;
    mockAdminFrom.mockImplementation(() => {
      adminCount++;
      if (adminCount === 1) return subChain;
      return updateChain;
    });

    mockCreateCustomer.mockResolvedValue({ id: "cust_new" });
    mockGetProductId.mockReturnValue("prod_pro_m");
    mockCreateSubscriptionCheckout.mockResolvedValue({
      id: "sub_checkout",
      url: "https://pay.abacatepay.com/checkout/sub_checkout",
    });

    const res = await handler.POST(
      jsonRequest({ organization_id: "ws-1", tier: "pro", cycle: "monthly" })
    );
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(body.checkout_url).toBe("https://pay.abacatepay.com/checkout/sub_checkout");

    // Verify customer was created
    expect(mockCreateCustomer).toHaveBeenCalledWith({ email: user.email });
  });
});

// ══════════════════════════════════════════════════════════════

describe("GET /api/billing/status", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await import("@/app/api/billing/status/route");
  });

  it("returns 401 when not authenticated", async () => {
    setupAuth(null);
    const res = await handler.GET(
      new Request("http://localhost/api/billing/status?organization_id=ws-1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when missing organization_id", async () => {
    setupAuth(mockUser());
    const res = await handler.GET(
      new Request("http://localhost/api/billing/status")
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when not a member", async () => {
    setupAuth(mockUser());
    mockFrom.mockReturnValue(mockQueryChain({ data: null, error: null }));

    const res = await handler.GET(
      new Request("http://localhost/api/billing/status?organization_id=ws-1")
    );
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════

describe("POST /api/billing/cancel", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await import("@/app/api/billing/cancel/route");
  });

  it("returns 401 when not authenticated", async () => {
    setupAuth(null);
    const res = await handler.POST(jsonRequest({ organization_id: "ws-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not owner/admin", async () => {
    setupAuth(mockUser());
    mockFrom.mockReturnValue(mockQueryChain({ data: null, error: null }));

    const res = await handler.POST(jsonRequest({ organization_id: "ws-1" }));
    expect(res.status).toBe(403);
  });

  it("cancels subscription successfully", async () => {
    setupAuth(mockUser());

    const memberChain = mockQueryChain({ data: { role: "owner" }, error: null });
    mockFrom.mockReturnValue(memberChain);

    const adminChain = mockQueryChain({ data: null, error: null });
    mockAdminFrom.mockReturnValue(adminChain);

    const res = await handler.POST(jsonRequest({ organization_id: "ws-1" }));
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});
