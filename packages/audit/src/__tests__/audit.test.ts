import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scrubSecrets, diffObjects, recordAudit } from "../index";

describe("scrubSecrets", () => {
  it("redacts keys that look like secrets", () => {
    const result = scrubSecrets({
      name: "foo",
      access_token: "abc",
      nested: { refresh_token: "xyz", safe: 1 },
    });
    expect(result).toEqual({
      name: "foo",
      access_token: "[REDACTED]",
      nested: { refresh_token: "[REDACTED]", safe: 1 },
    });
  });

  it("handles arrays", () => {
    expect(scrubSecrets([{ api_key: "a" }, { b: 2 }])).toEqual([
      { api_key: "[REDACTED]" },
      { b: 2 },
    ]);
  });

  it("preserves primitives", () => {
    expect(scrubSecrets(null)).toBe(null);
    expect(scrubSecrets(undefined)).toBe(undefined);
    expect(scrubSecrets(42)).toBe(42);
    expect(scrubSecrets("plain")).toBe("plain");
  });

  it("caps recursion to avoid cycles blowing the stack", () => {
    const a: any = {};
    a.self = a;
    const result = scrubSecrets(a) as any;
    expect(result).toBeDefined();
  });
});

describe("diffObjects", () => {
  it("returns only changed keys", () => {
    const d = diffObjects({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
    expect(d).toEqual({
      b: { before: 2, after: 3 },
      c: { before: undefined, after: 4 },
    });
  });

  it("returns null when nothing changed", () => {
    expect(diffObjects({ a: 1 }, { a: 1 })).toBe(null);
  });

  it("returns null for non-objects", () => {
    expect(diffObjects(null, { a: 1 })).toBe(null);
    expect(diffObjects([1], [2])).toBe(null);
  });
});

describe("recordAudit", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "" }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts a scrubbed payload to /rest/v1/audit_log", async () => {
    await recordAudit({
      supabaseUrl: "https://x.supabase.co",
      serviceRoleKey: "srv",
      orgId: "org-1",
      actor: { type: "user", userId: "u1" },
      action: "campaign.update",
      resource: { type: "campaign", id: "123" },
      before: { access_token: "abc", name: "x" },
      after: { name: "y" },
    });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toBe("https://x.supabase.co/rest/v1/audit_log");
    const body = JSON.parse(call[1].body);
    expect(body.organization_id).toBe("org-1");
    expect(body.action).toBe("campaign.update");
    expect(body.before.access_token).toBe("[REDACTED]");
    expect(body.after.name).toBe("y");
  });

  it("never throws when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordAudit({
        supabaseUrl: "https://x",
        serviceRoleKey: "k",
        orgId: "o",
        actor: { type: "system" },
        action: "x.y",
        resource: { type: "x" },
      }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
