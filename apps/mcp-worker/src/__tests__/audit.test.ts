import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { wrapServerWithAudit, MUTATING_TOOLS } from "../audit";
import type { Env } from "../types";

const mockEnv = {
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "srv",
} as unknown as Env;

function makeFakeServer() {
  const registrations: Array<{
    name: string;
    handler: (args: any) => Promise<unknown>;
  }> = [];
  const server = {
    tool(
      name: string,
      _desc: string,
      _schema: unknown,
      handler: (args: any) => Promise<unknown>,
    ) {
      registrations.push({ name, handler });
    },
  } as any;
  return { server, registrations };
}

describe("wrapServerWithAudit", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("fires an audit log for mutating tools on success", async () => {
    const { server, registrations } = makeFakeServer();
    const wrapped = wrapServerWithAudit(server, {
      env: mockEnv,
      organizationId: "org-1",
      apiKeyId: "oauth:client-abc",
    });
    wrapped.tool(
      "update_campaign",
      "d",
      {},
      async () => ({
        content: [{ type: "text", text: JSON.stringify({ success: true }) }],
      }),
    );

    const handler = registrations[0].handler;
    await handler({ campaign_id: "23850", project_id: "p1", name: "new" });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("https://x.supabase.co/rest/v1/audit_log");
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("campaign.update");
    expect(body.resource_type).toBe("campaign");
    expect(body.resource_id).toBe("23850");
    expect(body.actor_type).toBe("mcp_oauth");
    expect(body.actor_identifier).toBe("oauth:client-abc");
    expect(body.status).toBe("success");
  });

  it("marks audit status=error when the tool returns isError", async () => {
    const { server, registrations } = makeFakeServer();
    const wrapped = wrapServerWithAudit(server, {
      env: mockEnv,
      organizationId: "org-1",
      apiKeyId: "db-key-1",
    });
    wrapped.tool(
      "create_ad",
      "d",
      {},
      async () => ({
        content: [{ type: "text", text: JSON.stringify({ error: "boom" }) }],
        isError: true,
      }),
    );

    await registrations[0].handler({ account_id: "act_1" });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.status).toBe("error");
    expect(body.actor_type).toBe("mcp_api_key");
  });

  it("does not wrap read-only tools", async () => {
    const { server, registrations } = makeFakeServer();
    const wrapped = wrapServerWithAudit(server, {
      env: mockEnv,
      organizationId: "org-1",
      apiKeyId: "oauth:c",
    });
    wrapped.tool(
      "get_campaigns",
      "d",
      {},
      async () => ({ content: [{ type: "text", text: "{}" }] }),
    );
    await registrations[0].handler({});
    // Read-only tool should not trigger audit fetch
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("covers every mutating tool in the whitelist", () => {
    const expected = [
      "create_campaign",
      "update_campaign",
      "create_adset",
      "update_adset",
      "create_ad",
      "update_ad",
      "create_ad_creative",
      "update_ad_creative",
      "create_budget_schedule",
      "upload_ad_image",
      "upload_ad_video",
      "request_creative_upload",
      "finalize_creative_upload",
    ];
    for (const name of expected) {
      expect(MUTATING_TOOLS[name]).toBeDefined();
    }
  });
});
