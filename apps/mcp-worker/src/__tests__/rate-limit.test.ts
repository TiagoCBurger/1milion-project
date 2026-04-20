import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, checkUploadLimit } from "../rate-limit";
import { createMockEnv, createMockWorkspace } from "./helpers";
import type { Env, OrganizationContext } from "../types";

describe("checkRateLimit (DO-backed)", () => {
  let env: Env;
  let workspace: OrganizationContext;

  beforeEach(() => {
    env = createMockEnv();
    workspace = createMockWorkspace({
      requestsPerMinute: 3,
      requestsPerHour: 5,
      requestsPerDay: 100,
    });
  });

  it("allows request when under limits", async () => {
    const result = await checkRateLimit(workspace, env);
    expect(result.limited).toBe(false);
  });

  it("blocks when minute limit is reached", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(workspace, env);
    const result = await checkRateLimit(workspace, env);
    expect(result.limited).toBe(true);
    expect(result.limit).toBe(3);
    expect(result.scope).toBe("minute");
  });

  it("blocks when hour limit is reached (per-minute disabled)", async () => {
    const ws = { ...workspace, requestsPerMinute: 0 };
    for (let i = 0; i < 5; i++) await checkRateLimit(ws, env);
    const result = await checkRateLimit(ws, env);
    expect(result.limited).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.scope).toBe("hour");
  });

  it("isolates counters per organization", async () => {
    const ws1 = createMockWorkspace({ organizationId: "a", requestsPerMinute: 1, requestsPerHour: 10, requestsPerDay: 10 });
    const ws2 = createMockWorkspace({ organizationId: "b", requestsPerMinute: 1, requestsPerHour: 10, requestsPerDay: 10 });
    await checkRateLimit(ws1, env);
    const blocked = await checkRateLimit(ws1, env);
    const ws2Result = await checkRateLimit(ws2, env);
    expect(blocked.limited).toBe(true);
    expect(ws2Result.limited).toBe(false);
  });
});

describe("checkUploadLimit (DO-backed)", () => {
  it("allows under limit, blocks at limit", async () => {
    const env = createMockEnv();
    const first = await checkUploadLimit("ws-1", "images", 2, env);
    const second = await checkUploadLimit("ws-1", "images", 2, env);
    const third = await checkUploadLimit("ws-1", "images", 2, env);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
  });

  it("Infinity limit short-circuits", async () => {
    const env = createMockEnv();
    const r = await checkUploadLimit("ws-1", "videos", Infinity, env);
    expect(r.allowed).toBe(true);
  });
});
