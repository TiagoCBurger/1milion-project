import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runJanitor } from "../janitor";
import type { Env } from "../types";

const baseEnv: Partial<Env> = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

interface MockFetchCall {
  url: string;
  method: string;
  body?: string;
}

function setupFetch(responses: Array<{ match: string; status?: number; body: any }>) {
  const calls: MockFetchCall[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body as string | undefined });
    for (const r of responses) {
      if (url.includes(r.match) && (!r.status || r.status < 400)) {
        return new Response(JSON.stringify(r.body), {
          status: r.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes(r.match) && r.status && r.status >= 400) {
        return new Response(JSON.stringify(r.body), { status: r.status });
      }
    }
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function makeR2() {
  const deleted: string[] = [];
  return {
    bucket: {
      delete: vi.fn(async (k: string) => {
        deleted.push(k);
      }),
      put: vi.fn(),
      get: vi.fn(),
      head: vi.fn(),
    } as any,
    deleted,
  };
}

describe("runJanitor", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("returns 0/0/0 when nothing to do", async () => {
    setupFetch([
      { match: "/rpc/expire_stale_upload_leases", body: 0 },
      { match: "/upload_leases?status=eq.expired", body: [] },
    ]);
    const r2 = makeR2();
    const env = { ...baseEnv, CREATIVES_R2: r2.bucket } as Env;
    const result = await runJanitor(env);
    expect(result.expiredCount).toBe(0);
    expect(result.sweptLeases).toBe(0);
    expect(result.deletedKeys).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("expires stale leases and reports the count", async () => {
    setupFetch([
      { match: "/rpc/expire_stale_upload_leases", body: 7 },
      { match: "/upload_leases?status=eq.expired", body: [] },
    ]);
    const r2 = makeR2();
    const env = { ...baseEnv, CREATIVES_R2: r2.bucket } as Env;
    const result = await runJanitor(env);
    expect(result.expiredCount).toBe(7);
  });

  it("deletes orphan R2 keys, audit-logs cancel, and marks lease cancelled", async () => {
    const lease = {
      id: "lease-1",
      organization_id: "org-1",
      account_id: "act_1",
      items_meta: [
        { key: "org-1/images/a.jpg" },
        { key: "org-1/images/b.png" },
      ],
    };
    const calls = setupFetch([
      { match: "/rpc/expire_stale_upload_leases", body: 0 },
      { match: "/upload_leases?status=eq.expired", body: [lease] },
      { match: "/upload_audit_log", body: {} },
      { match: "/upload_leases?id=eq.", body: {} },
    ]);
    const r2 = makeR2();
    const env = { ...baseEnv, CREATIVES_R2: r2.bucket } as Env;

    const result = await runJanitor(env);

    expect(result.sweptLeases).toBe(1);
    expect(result.deletedKeys).toBe(2);
    expect(r2.deleted).toEqual(["org-1/images/a.jpg", "org-1/images/b.png"]);

    // Verify the lease got PATCHed to cancelled.
    const patch = calls.find(
      (c) => c.url.includes("/upload_leases?id=eq.lease-1") && c.method === "PATCH",
    );
    expect(patch).toBeDefined();
    expect(patch!.body).toContain('"status":"cancelled"');

    // Verify each key got an audit cancel entry.
    const cancelLogs = calls.filter(
      (c) => c.url.endsWith("/upload_audit_log") && c.method === "POST",
    );
    expect(cancelLogs).toHaveLength(2);
    expect(cancelLogs[0]!.body).toContain('"action":"cancel"');
  });

  it("reports errors when expire RPC fails", async () => {
    setupFetch([
      { match: "/rpc/expire_stale_upload_leases", status: 500, body: { error: "boom" } },
    ]);
    const r2 = makeR2();
    const env = { ...baseEnv, CREATIVES_R2: r2.bucket } as Env;
    const result = await runJanitor(env);
    expect(result.errors[0]).toMatch(/expire_stale_upload_leases failed/);
    expect(result.sweptLeases).toBe(0);
  });
});
