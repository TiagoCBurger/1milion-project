import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveUploadAuth } from "@/lib/upload-auth";
import { createMockSupabase, mockUser } from "./helpers";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const VALID_TOKEN = "x".repeat(64);

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/test", { method: "POST", headers });
}

describe("resolveUploadAuth", () => {
  let originalToken: string | undefined;
  beforeEach(() => {
    originalToken = process.env.INTERNAL_API_TOKEN;
  });
  afterEach(() => {
    if (originalToken === undefined) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = originalToken;
    vi.restoreAllMocks();
  });

  it("rejects mismatched service token", async () => {
    process.env.INTERNAL_API_TOKEN = VALID_TOKEN;
    const supabase = createMockSupabase();
    const req = makeRequest({ "x-internal-api-token": "y".repeat(64) });
    const out = await resolveUploadAuth(req, supabase as any, ORG_ID);
    expect("error" in out).toBe(true);
    if ("error" in out) {
      expect(out.status).toBe(401);
    }
  });

  it("accepts matching service token and returns mcp source with null userId", async () => {
    process.env.INTERNAL_API_TOKEN = VALID_TOKEN;
    const supabase = createMockSupabase();
    const req = makeRequest({ "x-internal-api-token": VALID_TOKEN });
    const out = await resolveUploadAuth(req, supabase as any, ORG_ID);
    expect("error" in out).toBe(false);
    if (!("error" in out)) {
      expect(out.source).toBe("mcp");
      expect(out.userId).toBeNull();
    }
  });

  it("rejects token shorter than 32 chars (refuses weak secrets)", async () => {
    process.env.INTERNAL_API_TOKEN = "tooshort";
    const supabase = createMockSupabase();
    const req = makeRequest({ "x-internal-api-token": "tooshort" });
    const out = await resolveUploadAuth(req, supabase as any, ORG_ID);
    // Falls through to cookie path (which has no user) → 401
    expect("error" in out).toBe(true);
    if ("error" in out) expect(out.status).toBe(401);
  });

  it("accepts cookie session when user is owner/admin", async () => {
    delete process.env.INTERNAL_API_TOKEN;
    const supabase = createMockSupabase();
    const user = mockUser();
    supabase.auth.getUser.mockResolvedValue({ data: { user }, error: null });
    supabase._chain.single.mockResolvedValue({
      data: { role: "owner" },
      error: null,
    });
    const req = makeRequest();
    const out = await resolveUploadAuth(req, supabase as any, ORG_ID);
    expect("error" in out).toBe(false);
    if (!("error" in out)) {
      expect(out.source).toBe("web");
      expect(out.userId).toBe(user.id);
    }
  });

  it("rejects cookie session without membership", async () => {
    delete process.env.INTERNAL_API_TOKEN;
    const supabase = createMockSupabase();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser() },
      error: null,
    });
    supabase._chain.single.mockResolvedValue({ data: null, error: null });
    const req = makeRequest();
    const out = await resolveUploadAuth(req, supabase as any, ORG_ID);
    expect("error" in out).toBe(true);
    if ("error" in out) expect(out.status).toBe(403);
  });

  it("rejects when no auth at all", async () => {
    delete process.env.INTERNAL_API_TOKEN;
    const supabase = createMockSupabase();
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const req = makeRequest();
    const out = await resolveUploadAuth(req, supabase as any, ORG_ID);
    expect("error" in out).toBe(true);
    if ("error" in out) expect(out.status).toBe(401);
  });
});
