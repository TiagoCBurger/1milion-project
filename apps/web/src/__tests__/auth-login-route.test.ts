import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Supabase ────────────────────────────────────────────

const mockSignIn = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithPassword: mockSignIn },
  })),
}));

// ── Helpers ──────────────────────────────────────────────────

function loginRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function credentialError() {
  return { data: null, error: { message: "Invalid login credentials" } };
}
function successLogin() {
  return { data: { session: { access_token: "tok" } }, error: null };
}

// ── Tests ────────────────────────────────────────────────────

describe("POST /api/auth/login — AUTH-VULN-08: per-account lockout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a successful login and returns { success: true }", async () => {
    mockSignIn.mockResolvedValue(successLogin());

    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(loginRequest({ email: "ok@lockout.com", password: "Str0ng!Pass#1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 401 for bad credentials (under the attempt limit)", async () => {
    mockSignIn.mockResolvedValue(credentialError());

    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(loginRequest({ email: "bad@lockout.com", password: "wrong" }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).not.toBe("email_not_confirmed");
  });

  it("locks the account after 5 consecutive credential failures", async () => {
    mockSignIn.mockResolvedValue(credentialError());

    const { POST } = await import("@/app/api/auth/login/route");
    const email = "victim@lockout.com";

    // 5 failures — all should return 401
    for (let i = 0; i < 5; i++) {
      const res = await POST(loginRequest({ email, password: "wrong" }));
      expect(res.status).toBe(401);
    }

    // 6th attempt — account is now locked
    const blocked = await POST(loginRequest({ email, password: "wrong" }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect((await blocked.json()).error).toContain("locked");
  });

  it("blocks even correct credentials while the account is locked", async () => {
    mockSignIn.mockResolvedValue(credentialError());

    const { POST } = await import("@/app/api/auth/login/route");
    const email = "locked@lockout.com";

    for (let i = 0; i < 5; i++) {
      await POST(loginRequest({ email, password: "wrong" }));
    }

    // Now switch to correct credentials — still locked
    mockSignIn.mockResolvedValue(successLogin());
    const res = await POST(loginRequest({ email, password: "Str0ng!Pass#1" }));
    expect(res.status).toBe(429);
  });

  it("resets the counter after a successful login", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const email = "reset@lockout.com";

    // 3 failures
    mockSignIn.mockResolvedValue(credentialError());
    for (let i = 0; i < 3; i++) {
      await POST(loginRequest({ email, password: "wrong" }));
    }

    // Successful login
    mockSignIn.mockResolvedValue(successLogin());
    const ok = await POST(loginRequest({ email, password: "Str0ng!Pass#1" }));
    expect(ok.status).toBe(200);

    // Counter reset — 5 new failures should be allowed before lockout
    mockSignIn.mockResolvedValue(credentialError());
    for (let i = 0; i < 5; i++) {
      const res = await POST(loginRequest({ email, password: "wrong" }));
      expect(res.status).toBe(401); // not 429
    }
  });

  it("does not count 'email not confirmed' as a failure toward lockout", async () => {
    mockSignIn.mockResolvedValue({
      data: null,
      error: { message: "Email not confirmed" },
    });

    const { POST } = await import("@/app/api/auth/login/route");
    const email = "unconfirmed@lockout.com";

    // 10 unconfirmed attempts — should NOT lock the account
    for (let i = 0; i < 10; i++) {
      const res = await POST(loginRequest({ email, password: "Str0ng!Pass#1" }));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("email_not_confirmed");
    }
  });

  it("isolates lockout counters per email address", async () => {
    mockSignIn.mockResolvedValue(credentialError());

    const { POST } = await import("@/app/api/auth/login/route");

    // Lock email A
    for (let i = 0; i < 5; i++) {
      await POST(loginRequest({ email: "alice@lockout.com", password: "wrong" }));
    }

    // email B should still be unlocked
    const res = await POST(loginRequest({ email: "bob@lockout.com", password: "wrong" }));
    expect(res.status).toBe(401); // not 429
  });

  it("treats email addresses case-insensitively for lockout", async () => {
    mockSignIn.mockResolvedValue(credentialError());

    const { POST } = await import("@/app/api/auth/login/route");

    // 3 failures with lowercase
    for (let i = 0; i < 3; i++) {
      await POST(loginRequest({ email: "case@lockout.com", password: "wrong" }));
    }
    // 2 more with uppercase — should continue the same counter
    for (let i = 0; i < 2; i++) {
      await POST(loginRequest({ email: "CASE@lockout.com", password: "wrong" }));
    }
    // 6th attempt → locked
    const blocked = await POST(loginRequest({ email: "Case@lockout.com", password: "wrong" }));
    expect(blocked.status).toBe(429);
  });

  it("returns 400 for missing credentials", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(loginRequest({ email: "only@lockout.com" }));
    expect(res.status).toBe(400);
  });
});
