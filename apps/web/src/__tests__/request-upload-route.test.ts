import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabase, mockUser, parseJsonResponse } from "./helpers";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const ACCT = "act_111";
const VALID_SHA = "a".repeat(64);

const mockSupabase = createMockSupabase();
const mockAdminFromCalls: Array<{ table: string; chain: any }> = [];

function buildAdminChain(opts: {
  subscriptionTier?: string | null;
  finalizedTodayCount?: number;
  insertResult?: { data: any; error: any };
} = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    insert: vi.fn(function (this: any, _payload: any) {
      // Allow either chained .select().single() (for lease insert) OR fire-and-forget (for audit log)
      const after = {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(
          opts.insertResult ?? { data: { id: "lease-uuid" }, error: null },
        ),
      };
      return after;
    }),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({
        data: opts.subscriptionTier === undefined ? null : { tier: opts.subscriptionTier },
        error: null,
      }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    // Count query: { count: 0 }
    then: (fn: any) =>
      Promise.resolve({ count: opts.finalizedTodayCount ?? 0, data: [], error: null }).then(fn),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabase),
}));

const adminClientMock = {
  from: vi.fn(),
  rpc: vi.fn().mockResolvedValue({ data: 0, error: null }),
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminClientMock),
}));

vi.mock("@/lib/organization-write-guard", () => ({
  assertOrganizationCanWrite: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/r2-presign", () => ({
  presignPut: vi.fn(async ({ key }: any) => ({
    url: `https://r2.example/${key}?sig`,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  })),
  buildR2Key: vi.fn(({ organizationId, kind, fileName, ext }: any) =>
    `${organizationId}/${kind}/${fileName}.${ext}`,
  ),
  publicR2Url: vi.fn((k: string) => `https://pub.r2/${k}`),
}));

import { POST } from "@/app/api/organizations/[id]/meta/images/request-upload/route";

function setupOwnerSession() {
  const user = mockUser();
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user }, error: null });
  mockSupabase._chain.single.mockResolvedValue({ data: { role: "owner" }, error: null });
}

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupAdmin(opts: Parameters<typeof buildAdminChain>[0]) {
  const tableHandlers: Record<string, any> = {
    subscriptions: buildAdminChain(opts),
    upload_audit_log: buildAdminChain(opts),
    upload_leases: buildAdminChain(opts),
  };
  adminClientMock.from.mockImplementation((table: string) => {
    mockAdminFromCalls.push({ table, chain: tableHandlers[table] });
    return tableHandlers[table];
  });
  adminClientMock.rpc.mockResolvedValue({ data: 0, error: null });
}

describe("POST /request-upload", () => {
  beforeEach(() => {
    delete process.env.MCP_SERVICE_TOKEN;
    mockAdminFromCalls.length = 0;
    setupOwnerSession();
  });
  afterEach(() => vi.restoreAllMocks());

  it("rejects when not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(jsonReq({ account_id: ACCT, files: [] }), {
      params: Promise.resolve({ id: ORG_ID }),
    });
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(401);
  });

  it("rejects free tier", async () => {
    setupAdmin({ subscriptionTier: "free" });
    const res = await POST(
      jsonReq({
        account_id: ACCT,
        files: [{ name: "a.jpg", size: 100, content_type: "image/jpeg", sha256: VALID_SHA }],
      }),
      { params: Promise.resolve({ id: ORG_ID }) },
    );
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(403);
    expect(body.error).toMatch(/plan/i);
  });

  it("rejects file exceeding plan size", async () => {
    setupAdmin({ subscriptionTier: "pro" });
    const tooBig = 31 * 1024 * 1024;
    const res = await POST(
      jsonReq({
        account_id: ACCT,
        files: [{ name: "x.jpg", size: tooBig, content_type: "image/jpeg", sha256: VALID_SHA }],
      }),
      { params: Promise.resolve({ id: ORG_ID }) },
    );
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(400);
    expect(body.error).toMatch(/per-file limit/i);
  });

  it("rejects unsupported MIME (e.g. SVG)", async () => {
    setupAdmin({ subscriptionTier: "pro" });
    const res = await POST(
      jsonReq({
        account_id: ACCT,
        files: [{ name: "x.svg", size: 100, content_type: "image/svg+xml", sha256: VALID_SHA }],
      }),
      { params: Promise.resolve({ id: ORG_ID }) },
    );
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(400);
    expect(body.error).toMatch(/unsupported content_type/i);
  });

  it("rejects malformed sha256", async () => {
    setupAdmin({ subscriptionTier: "pro" });
    const res = await POST(
      jsonReq({
        account_id: ACCT,
        files: [{ name: "x.jpg", size: 100, content_type: "image/jpeg", sha256: "not-hex" }],
      }),
      { params: Promise.resolve({ id: ORG_ID }) },
    );
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(400);
    expect(body.error).toMatch(/invalid sha256/i);
  });

  it("rejects when concurrent_leases would be exceeded", async () => {
    setupAdmin({ subscriptionTier: "pro" });
    // Pro tier allows 5 concurrent — return 5 already active.
    adminClientMock.rpc.mockResolvedValue({ data: 5, error: null });
    const res = await POST(
      jsonReq({
        account_id: ACCT,
        files: [{ name: "a.jpg", size: 100, content_type: "image/jpeg", sha256: VALID_SHA }],
      }),
      { params: Promise.resolve({ id: ORG_ID }) },
    );
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(429);
    expect(body.error).toMatch(/concurrent/i);
  });

  it("happy path returns lease + presigned items", async () => {
    setupAdmin({ subscriptionTier: "pro" });
    const res = await POST(
      jsonReq({
        account_id: ACCT,
        files: [
          { name: "one.jpg", size: 100, content_type: "image/jpeg", sha256: VALID_SHA },
          { name: "two.png", size: 200, content_type: "image/png", sha256: "b".repeat(64) },
        ],
      }),
      { params: Promise.resolve({ id: ORG_ID }) },
    );
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(body.lease_id).toBe("lease-uuid");
    expect(body.items).toHaveLength(2);
    expect(body.items[0].upload_url).toMatch(/^https:\/\/r2\.example/);
  });
});
