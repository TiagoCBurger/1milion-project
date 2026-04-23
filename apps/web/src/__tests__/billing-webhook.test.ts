import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock AbacatePay client ──────────────────────────────────

const mockVerifyWebhookSignature = vi.fn();
const mockVerifyWebhookQuerySecret = vi.fn();
const mockVerifyWebhookTimestamp = vi.fn().mockReturnValue(true);
const mockParseWebhookPayload = vi.fn();

vi.mock("@/lib/abacatepay", () => ({
  verifyWebhookSignature: (...args: unknown[]) => mockVerifyWebhookSignature(...args),
  verifyWebhookQuerySecret: (...args: unknown[]) => mockVerifyWebhookQuerySecret(...args),
  verifyWebhookTimestamp: (...args: unknown[]) => mockVerifyWebhookTimestamp(...args),
  parseWebhookPayload: (...args: unknown[]) => mockParseWebhookPayload(...args),
}));

// ── Mock Supabase admin ─────────────────────────────────────

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    rpc: mockAdminRpc,
  })),
}));

// ── Helpers ─────────────────────────────────────────────────

function mockAdminQueryChain(finalResult: { data: unknown; error: unknown }) {
  const chain: any = {};
  const methods = ["select", "insert", "update", "delete", "eq", "neq", "in", "single", "order"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(finalResult);
  chain.then = (resolve: any) => Promise.resolve(finalResult).then(resolve);
  return chain;
}

function makeWebhookRequest(body: string, signature = "valid-sig"): Request {
  return new Request("http://localhost/api/billing/webhook?webhookSecret=test-webhook-secret", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-signature": signature,
    },
    body,
  });
}

/** Creates a v2-format webhook payload matching AbacatePay docs */
function makeV2Payload(
  eventId: string,
  event: string,
  overrides?: {
    subscriptionId?: string;
    metadata?: Record<string, string>;
    externalId?: string;
  }
) {
  return {
    id: eventId,
    event,
    apiVersion: 2,
    devMode: false,
    data: {
      subscription: {
        id: overrides?.subscriptionId ?? "subs_123",
        amount: 3700,
        currency: "BRL",
        method: "CARD",
        status: event === "subscription.cancelled" ? "CANCELLED" : "ACTIVE",
        frequency: "MONTHLY",
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-01T00:00:05Z",
        canceledAt: event === "subscription.cancelled" ? "2026-04-01T00:00:05Z" : null,
      },
      customer: { id: "cust_1", name: "Test", email: "test@example.com", taxId: "123.***" },
      payment: {},
      checkout: {
        id: "bill_abc",
        externalId: overrides?.externalId ?? "ws-1",
        url: "https://pay.abacatepay.com/pay/bill_abc",
        amount: 3700,
        paidAmount: 3700,
        status: "PAID",
        metadata: overrides?.metadata ?? { organization_id: "ws-1", tier: "pro", cycle: "monthly" },
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-01T00:00:05Z",
      },
    },
  };
}

// ══════════════════════════════════════════════════════════════

describe("POST /api/billing/webhook", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await import("@/app/api/billing/webhook/route");
    mockVerifyWebhookQuerySecret.mockReturnValue(true);
    mockVerifyWebhookTimestamp.mockReturnValue(true);
    mockAdminRpc.mockResolvedValue({ data: null, error: null });
  });

  it("returns 401 for invalid query secret", async () => {
    mockVerifyWebhookQuerySecret.mockReturnValue(false);

    const req = new Request("http://localhost/api/billing/webhook?webhookSecret=wrong", {
      method: "POST",
      body: "{}",
    });
    const res = await handler.POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid webhook secret");
  });

  it("returns 401 for expired x-webhook-timestamp header", async () => {
    mockVerifyWebhookTimestamp.mockReturnValue(false);

    const res = await handler.POST(
      makeWebhookRequest('{"id":"evt_1","event":"test","data":{}}'),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid or expired timestamp");
  });

  it("returns 401 for invalid HMAC signature", async () => {
    mockVerifyWebhookSignature.mockResolvedValue(false);

    const res = await handler.POST(
      makeWebhookRequest('{"id":"evt_1","event":"test","data":{}}', "bad-sig")
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid signature");
  });

  it("returns 401 for missing signature header", async () => {
    mockVerifyWebhookSignature.mockResolvedValue(false);

    const req = new Request("http://localhost/api/billing/webhook?webhookSecret=test-webhook-secret", {
      method: "POST",
      body: '{"id":"evt_1"}',
    });
    const res = await handler.POST(req);
    expect(res.status).toBe(401);
  });

  it("skips duplicate events (idempotency)", async () => {
    mockVerifyWebhookSignature.mockResolvedValue(true);
    mockParseWebhookPayload.mockReturnValue(
      makeV2Payload("evt_already_processed", "subscription.completed")
    );

    // billing_events SELECT returns existing record
    const selectChain = mockAdminQueryChain({ data: { id: "existing" }, error: null });
    const insertChain = mockAdminQueryChain({ data: null, error: null });

    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "billing_events" && callCount === 1) return selectChain;
      return insertChain;
    });

    const res = await handler.POST(
      makeWebhookRequest('{"id":"evt_already_processed"}')
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.duplicate).toBe(true);
  });

  it("handles subscription.completed with v2 payload structure", async () => {
    mockVerifyWebhookSignature.mockResolvedValue(true);
    mockParseWebhookPayload.mockReturnValue(
      makeV2Payload("evt_new", "subscription.completed", {
        subscriptionId: "subs_abc",
        metadata: { organization_id: "ws-1", tier: "pro", cycle: "monthly" },
      })
    );

    const idempotencyCheck = mockAdminQueryChain({ data: null, error: null });
    const insertChain = mockAdminQueryChain({ data: null, error: null });
    const pendingCheck = mockAdminQueryChain({ data: null, error: null });
    const updateChain = mockAdminQueryChain({ data: null, error: null });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return idempotencyCheck;
      if (callCount === 2) return insertChain;
      if (callCount === 3) return pendingCheck;
      return updateChain;
    });

    const res = await handler.POST(makeWebhookRequest('{"id":"evt_new"}'));
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verify subscription updated with correct tier limits
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: "pro",
        status: "active",
        abacatepay_subscription_id: "subs_abc",
        billing_cycle: "monthly",
        requests_per_hour: 200,
        requests_per_day: 1000,
        max_mcp_connections: 1,
        pending_tier: null,
        pending_billing_cycle: null,
      })
    );
  });

  it("extracts organization_id from checkout.externalId as fallback", async () => {
    mockVerifyWebhookSignature.mockResolvedValue(true);
    mockParseWebhookPayload.mockReturnValue(
      makeV2Payload("evt_ext", "subscription.completed", {
        metadata: {}, // no organization_id in metadata
        externalId: "ws-from-external",
      })
    );

    const idempotencyCheck = mockAdminQueryChain({ data: null, error: null });
    const insertChain = mockAdminQueryChain({ data: null, error: null });
    const pendingCheck = mockAdminQueryChain({ data: null, error: null });
    const updateChain = mockAdminQueryChain({ data: null, error: null });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return idempotencyCheck;
      if (callCount === 2) return insertChain;
      if (callCount === 3) return pendingCheck;
      return updateChain;
    });

    const res = await handler.POST(makeWebhookRequest('{"id":"evt_ext"}'));
    expect(res.status).toBe(200);

    // Verify organization_id came from externalId
    expect(updateChain.eq).toHaveBeenCalledWith("organization_id", "ws-from-external");
  });

  it("handles subscription.renewed without pending change", async () => {
    mockVerifyWebhookSignature.mockResolvedValue(true);
    mockParseWebhookPayload.mockReturnValue(
      makeV2Payload("evt_renew", "subscription.renewed")
    );

    const idempotencyCheck = mockAdminQueryChain({ data: null, error: null });
    const insertChain = mockAdminQueryChain({ data: null, error: null });
    // subscriptions SELECT for pending check — no pending change
    const pendingCheck = mockAdminQueryChain({
      data: { id: "sub-1", tier: "pro", pending_tier: null, pending_billing_cycle: null },
      error: null,
    });
    const updateChain = mockAdminQueryChain({ data: null, error: null });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return idempotencyCheck;
      if (callCount === 2) return insertChain;
      if (callCount === 3) return pendingCheck;
      return updateChain;
    });

    const res = await handler.POST(makeWebhookRequest('{"id":"evt_renew"}'));
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" })
    );
  });

  it("applies pending upgrade on subscription.renewed", async () => {
    mockVerifyWebhookSignature.mockResolvedValue(true);
    mockParseWebhookPayload.mockReturnValue(
      makeV2Payload("evt_renew_upgrade", "subscription.renewed")
    );

    const idempotencyCheck = mockAdminQueryChain({ data: null, error: null });
    const insertChain = mockAdminQueryChain({ data: null, error: null });
    // subscriptions SELECT — has pending upgrade to max
    const pendingCheck = mockAdminQueryChain({
      data: { id: "sub-1", tier: "pro", pending_tier: "max", pending_billing_cycle: "monthly" },
      error: null,
    });
    const updateChain = mockAdminQueryChain({ data: null, error: null });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return idempotencyCheck;
      if (callCount === 2) return insertChain;
      if (callCount === 3) return pendingCheck;
      return updateChain;
    });

    const res = await handler.POST(makeWebhookRequest('{"id":"evt_renew_upgrade"}'));
    expect(res.status).toBe(200);

    // Should apply max tier limits and clear pending
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: "max",
        requests_per_hour: 200,
        requests_per_day: 5000,
        pending_tier: null,
        pending_billing_cycle: null,
      })
    );
  });

  it("subscription.cancelled keeps paid access until current_period_end", async () => {
    mockVerifyWebhookSignature.mockResolvedValue(true);
    mockParseWebhookPayload.mockReturnValue(
      makeV2Payload("evt_cancel", "subscription.cancelled")
    );

    const idempotencyCheck = mockAdminQueryChain({ data: null, error: null });
    const insertChain = mockAdminQueryChain({ data: null, error: null });
    // Subscription still within its paid period — user must keep access.
    const pendingCheck = mockAdminQueryChain({
      data: {
        id: "sub-1",
        tier: "pro",
        pending_tier: null,
        pending_billing_cycle: null,
        status: "active",
        current_period_end: "2099-12-31T23:59:59Z",
      },
      error: null,
    });
    const updateChain = mockAdminQueryChain({ data: null, error: null });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return idempotencyCheck;
      if (callCount === 2) return insertChain;
      if (callCount === 3) return pendingCheck;
      return updateChain;
    });

    const res = await handler.POST(makeWebhookRequest('{"id":"evt_cancel"}'));
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Tier stays paid — only the intent is recorded. Reconcile cron
    // handles the flip to free when the paid period actually ends.
    const updateArg = updateChain.update.mock.calls[0]?.[0] ?? {};
    expect(updateArg.pending_tier).toBe("free");
    expect(updateArg.abacatepay_subscription_id).toBeNull();
    expect(updateArg.tier).toBeUndefined(); // tier MUST NOT be touched now
    expect(updateArg.status).toBeUndefined(); // status stays active
  });

  it("subscription.cancelled downgrades immediately if period already ended", async () => {
    mockVerifyWebhookSignature.mockResolvedValue(true);
    mockParseWebhookPayload.mockReturnValue(
      makeV2Payload("evt_cancel_expired", "subscription.cancelled")
    );

    const idempotencyCheck = mockAdminQueryChain({ data: null, error: null });
    const insertChain = mockAdminQueryChain({ data: null, error: null });
    // Period already elapsed → immediate downgrade path.
    const pendingCheck = mockAdminQueryChain({
      data: {
        id: "sub-1",
        tier: "pro",
        pending_tier: null,
        pending_billing_cycle: null,
        status: "active",
        current_period_end: "2020-01-01T00:00:00Z",
      },
      error: null,
    });
    const updateChain = mockAdminQueryChain({ data: null, error: null });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return idempotencyCheck;
      if (callCount === 2) return insertChain;
      if (callCount === 3) return pendingCheck;
      return updateChain;
    });

    const res = await handler.POST(makeWebhookRequest('{"id":"evt_cancel_expired"}'));
    expect(res.status).toBe(200);

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: "free",
        requests_per_hour: 0,
        max_mcp_connections: 0,
      })
    );
  });

  it("applies pending downgrade to free on subscription.cancelled", async () => {
    mockVerifyWebhookSignature.mockResolvedValue(true);
    mockParseWebhookPayload.mockReturnValue(
      makeV2Payload("evt_cancel_pending", "subscription.cancelled")
    );

    const idempotencyCheck = mockAdminQueryChain({ data: null, error: null });
    const insertChain = mockAdminQueryChain({ data: null, error: null });
    // User had a pending_tier='free' + period already in the past,
    // so the immediate downgrade branch runs.
    const pendingCheck = mockAdminQueryChain({
      data: {
        id: "sub-1",
        tier: "max",
        pending_tier: "free",
        pending_billing_cycle: null,
        status: "active",
        current_period_end: "2020-01-01T00:00:00Z",
      },
      error: null,
    });
    const updateChain = mockAdminQueryChain({ data: null, error: null });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return idempotencyCheck;
      if (callCount === 2) return insertChain;
      if (callCount === 3) return pendingCheck;
      return updateChain;
    });

    const res = await handler.POST(makeWebhookRequest('{"id":"evt_cancel_pending"}'));
    expect(res.status).toBe(200);

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: "free",
        pending_tier: null,
      })
    );
  });
});
