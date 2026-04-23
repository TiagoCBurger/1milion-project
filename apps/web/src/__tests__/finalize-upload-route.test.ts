import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sha256Hex } from "@vibefly/sanitizer";
import { createMockSupabase, mockUser, parseJsonResponse } from "./helpers";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const LEASE_ID = "11111111-1111-1111-1111-111111111111";
const ACCT = "act_111";

// Minimal valid PNG (8-byte signature + IHDR + IDAT + IEND).
// Crafted so it parses and isn't a polyglot.
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const mockSupabase = createMockSupabase();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabase),
}));

const adminFromMocks: Record<string, any> = {};
const adminClientMock = {
  from: vi.fn((table: string) => adminFromMocks[table]),
  rpc: vi.fn().mockResolvedValue({ data: 0, error: null }),
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminClientMock),
}));

vi.mock("@/lib/organization-write-guard", () => ({
  assertOrganizationCanWrite: vi.fn().mockResolvedValue(null),
}));

const r2Bytes: Map<string, Uint8Array> = new Map();
vi.mock("@/lib/r2-upload", () => ({
  getR2Object: vi.fn(async (k: string) => r2Bytes.get(k) ?? null),
  putR2Object: vi.fn(async (k: string, b: Uint8Array) => {
    r2Bytes.set(k, b);
  }),
  deleteR2Object: vi.fn(async (k: string) => {
    r2Bytes.delete(k);
  }),
  headR2Object: vi.fn(async () => null),
  uploadToR2: vi.fn(),
}));

vi.mock("@/lib/r2-presign", () => ({
  publicR2Url: vi.fn((k: string) => `https://pub.r2/${k}`),
}));

vi.mock("@/lib/image-sanitize", () => ({
  // Pass-through sanitizer — return same bytes/mime so we can compare.
  reEncodeImage: vi.fn(async (buf: Uint8Array, mime: string) => ({
    buf,
    mime,
    width: 1,
    height: 1,
  })),
}));

vi.mock("@/lib/meta-api", () => ({
  getDecryptedToken: vi.fn(async () => "test-token"),
  metaApiUploadImage: vi.fn(async () => ({
    images: { "one.png": { hash: "metahash-abc", url: "https://meta.cdn/img" } },
  })),
  metaUserFacingError: vi.fn(() => null),
  ensureActPrefix: vi.fn((a: string) => (a.startsWith("act_") ? a : `act_${a}`)),
  metaApiGet: vi.fn(),
}));

import { POST } from "@/app/api/organizations/[id]/meta/images/finalize-upload/route";

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

function buildLeaseRow(items: any[]) {
  return {
    id: LEASE_ID,
    organization_id: ORG_ID,
    account_id: ACCT,
    kind: "image",
    expected_count: items.length,
    finalized_count: 0,
    items_meta: items,
    status: "pending",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

function setupAdmin(leaseRow: any) {
  adminFromMocks.upload_leases = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: leaseRow, error: null }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
  };
  adminFromMocks.upload_audit_log = {
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  adminFromMocks.ad_images = {
    upsert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "ad-img-1" }, error: null }),
      }),
    }),
  };
}

describe("POST /finalize-upload", () => {
  beforeEach(() => {
    delete process.env.INTERNAL_API_TOKEN;
    r2Bytes.clear();
    setupOwnerSession();
  });
  afterEach(() => vi.restoreAllMocks());

  it("404 when lease not found", async () => {
    adminFromMocks.upload_leases = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
    };
    const res = await POST(jsonReq({ lease_id: LEASE_ID }), {
      params: Promise.resolve({ id: ORG_ID }),
    });
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(404);
  });

  it("rejects when sha256 doesn't match expected", async () => {
    const key = `${ORG_ID}/images/wrong.png`;
    const sha = await sha256Hex(PNG_BYTES);
    setupAdmin(
      buildLeaseRow([
        {
          key,
          file_name: "wrong.png",
          expected_size: PNG_BYTES.byteLength,
          declared_mime: "image/png",
          expected_sha256: sha.replace(/.$/, "0"), // off by 1 char
        },
      ]),
    );
    r2Bytes.set(key, PNG_BYTES);
    const res = await POST(jsonReq({ lease_id: LEASE_ID }), {
      params: Promise.resolve({ id: ORG_ID }),
    });
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(body.items[0].ok).toBe(false);
    expect(body.items[0].reason).toMatch(/Hash mismatch/i);
  });

  it("rejects when declared MIME doesn't match magic bytes", async () => {
    const key = `${ORG_ID}/images/lying.png`;
    const sha = await sha256Hex(PNG_BYTES);
    setupAdmin(
      buildLeaseRow([
        {
          key,
          file_name: "lying.png",
          expected_size: PNG_BYTES.byteLength,
          declared_mime: "image/jpeg", // declared jpeg but bytes are PNG
          expected_sha256: sha,
        },
      ]),
    );
    r2Bytes.set(key, PNG_BYTES);
    const res = await POST(jsonReq({ lease_id: LEASE_ID }), {
      params: Promise.resolve({ id: ORG_ID }),
    });
    const { body } = await parseJsonResponse(res);
    expect(body.items[0].ok).toBe(false);
    expect(body.items[0].reason).toMatch(/declared MIME/i);
  });

  it("rejects when bytes were never uploaded", async () => {
    const key = `${ORG_ID}/images/missing.png`;
    setupAdmin(
      buildLeaseRow([
        {
          key,
          file_name: "missing.png",
          expected_size: 100,
          declared_mime: "image/png",
          expected_sha256: "a".repeat(64),
        },
      ]),
    );
    // No bytes added to r2Bytes — simulate client never PUT.
    const res = await POST(jsonReq({ lease_id: LEASE_ID }), {
      params: Promise.resolve({ id: ORG_ID }),
    });
    const { body } = await parseJsonResponse(res);
    expect(body.items[0].ok).toBe(false);
    expect(body.items[0].reason).toMatch(/not uploaded/i);
  });

  it("happy path: returns image_hash and marks lease finalized", async () => {
    const key = `${ORG_ID}/images/good.png`;
    const sha = await sha256Hex(PNG_BYTES);
    setupAdmin(
      buildLeaseRow([
        {
          key,
          file_name: "good.png",
          expected_size: PNG_BYTES.byteLength,
          declared_mime: "image/png",
          expected_sha256: sha,
        },
      ]),
    );
    r2Bytes.set(key, PNG_BYTES);
    const res = await POST(jsonReq({ lease_id: LEASE_ID }), {
      params: Promise.resolve({ id: ORG_ID }),
    });
    const { status, body } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(body.items[0].ok).toBe(true);
    expect(body.items[0].image_hash).toBe("metahash-abc");
    expect(body.status).toBe("finalized");
    expect(body.finalized_count).toBe(1);
  });

  it("410 when lease is past expires_at", async () => {
    const key = `${ORG_ID}/images/late.png`;
    const sha = await sha256Hex(PNG_BYTES);
    const lease = buildLeaseRow([
      {
        key,
        file_name: "late.png",
        expected_size: PNG_BYTES.byteLength,
        declared_mime: "image/png",
        expected_sha256: sha,
      },
    ]);
    lease.expires_at = new Date(Date.now() - 60_000).toISOString();
    setupAdmin(lease);
    const res = await POST(jsonReq({ lease_id: LEASE_ID }), {
      params: Promise.resolve({ id: ORG_ID }),
    });
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(410);
  });
});
