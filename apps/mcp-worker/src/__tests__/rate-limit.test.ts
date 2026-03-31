import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit } from "../rate-limit";
import { createMockEnv, createMockWorkspace } from "./helpers";
import type { Env, WorkspaceContext } from "../types";

describe("checkRateLimit", () => {
  let env: Env;
  let workspace: WorkspaceContext;

  beforeEach(() => {
    env = createMockEnv();
    workspace = createMockWorkspace({
      requestsPerMinute: 5,
      requestsPerDay: 100,
    });
  });

  it("allows request when under limits", async () => {
    const result = await checkRateLimit(workspace, env);

    expect(result.limited).toBe(false);
    // Should have incremented counters
    expect(env.RATE_LIMIT_KV.put).toHaveBeenCalledTimes(2);
  });

  it("blocks when minute limit is reached", async () => {
    // Pre-set counter to be at the limit
    (env.RATE_LIMIT_KV.get as any).mockResolvedValueOnce("5"); // minute counter at limit
    (env.RATE_LIMIT_KV.get as any).mockResolvedValueOnce("10"); // day counter under limit

    const result = await checkRateLimit(workspace, env);

    expect(result.limited).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.retryAfter).toBe(60);
  });

  it("blocks when day limit is reached", async () => {
    (env.RATE_LIMIT_KV.get as any).mockResolvedValueOnce("3"); // minute counter under
    (env.RATE_LIMIT_KV.get as any).mockResolvedValueOnce("100"); // day counter at limit

    const result = await checkRateLimit(workspace, env);

    expect(result.limited).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.retryAfter).toBe(3600);
  });

  it("increments counters with correct TTL", async () => {
    await checkRateLimit(workspace, env);

    const putCalls = (env.RATE_LIMIT_KV.put as any).mock.calls;

    // Minute counter: TTL 120s
    expect(putCalls[0][1]).toBe("1");
    expect(putCalls[0][2]).toEqual({ expirationTtl: 120 });

    // Day counter: TTL 90000s
    expect(putCalls[1][1]).toBe("1");
    expect(putCalls[1][2]).toEqual({ expirationTtl: 90_000 });
  });

  it("uses workspace-specific KV keys", async () => {
    await checkRateLimit(workspace, env);

    const getCalls = (env.RATE_LIMIT_KV.get as any).mock.calls;
    expect(getCalls[0][0]).toContain("rl:ws-123:m:");
    expect(getCalls[1][0]).toContain("rl:ws-123:d:");
  });
});
