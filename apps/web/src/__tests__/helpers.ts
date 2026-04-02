import { vi } from "vitest";

// ── Supabase mock builder ────────────────────────────────────

type QueryResult<T = unknown> = { data: T | null; error: { message: string } | null };

export interface MockSupabaseChain {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
}

/**
 * Creates a chainable Supabase mock that returns `result` at the end of any chain.
 */
export function createMockSupabase(result: QueryResult = { data: null, error: null }) {
  const chain: any = {};
  const methods = ["select", "insert", "update", "delete", "eq", "in", "single", "order", "limit"];

  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  // Terminal calls resolve with the result
  chain.single = vi.fn().mockResolvedValue(result);
  // Non-terminal that still resolves
  chain.order = vi.fn().mockReturnValue({ ...chain, then: (fn: any) => Promise.resolve(result).then(fn) });

  // Make chain itself thenable for await-without-single
  chain.then = (fn: any) => Promise.resolve(result).then(fn);

  const rpc = vi.fn().mockResolvedValue(result);

  const from = vi.fn().mockReturnValue(chain);

  const auth = {
    getUser: vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    }),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
  };

  return { from, rpc, auth, _chain: chain };
}

/**
 * Creates a mock authenticated user.
 */
export function mockUser(overrides?: Partial<{
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
}>) {
  return {
    id: overrides?.id ?? "user-123",
    email: overrides?.email ?? "test@example.com",
    user_metadata: overrides?.user_metadata ?? { display_name: "Test User" },
  };
}

// ── Request helpers ──────────────────────────────────────────

export function jsonRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost:3000/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getRequest(url = "http://localhost:3000/test"): Request {
  return new Request(url, { method: "GET" });
}

// ── Response helpers ─────────────────────────────────────────

export async function parseJsonResponse(res: Response): Promise<{ status: number; body: any }> {
  return {
    status: res.status,
    body: await res.json(),
  };
}

// ── Mock fetch for Meta API ──────────────────────────────────

export function mockMetaFetch(responses: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    for (const [pattern, response] of Object.entries(responses)) {
      if (urlStr.includes(pattern)) {
        return {
          ok: !(response as any)?.error,
          json: async () => response,
          status: (response as any)?.error ? 400 : 200,
        };
      }
    }
    return {
      ok: true,
      json: async () => ({ data: [] }),
      status: 200,
    };
  });
}
