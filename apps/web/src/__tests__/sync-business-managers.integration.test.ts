/**
 * Regression test for the sync_business_managers RPC.
 *
 * Bug history: migration 028 added ad_accounts.project_id NOT NULL,
 * but sync_business_managers (recreated in 033) never inserted it,
 * so every Meta connection silently failed with a 23502 violation
 * and left business_managers / ad_accounts empty for the org.
 * Migration 048 fixed the RPC.
 *
 * This test guards against:
 *   1. The RPC failing to populate project_id on insert.
 *   2. New NOT NULL columns being added to ad_accounts without
 *      updating the RPC's INSERT column list (will fail with a
 *      readable assertion: "RPC failed: ...").
 *   3. Re-syncs clobbering manually-assigned project_id mappings.
 *
 * How to run locally:
 *   cd apps/web
 *   RUN_INTEGRATION_TESTS=true pnpm exec vitest run \
 *     src/__tests__/sync-business-managers.integration.test.ts
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY pointing at a database where you're
 * OK creating and deleting test rows. The test cleans up on
 * success and on failure (afterAll).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

// Lightweight .env.local loader (no dotenv dep). Forces override
// because src/__tests__/setup.ts sets fake fallback values for the
// rest of the test suite — we need the real ones here.
function loadEnvLocalForceOverride() {
  try {
    const raw = readFileSync(
      path.resolve(__dirname, "../../.env.local"),
      "utf8"
    );
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (!m) continue;
      const [, k, v] = m;
      process.env[k] = v.replace(/^['"]|['"]$/g, "");
    }
    return true;
  } catch {
    return false;
  }
}

const ENV_LOADED = loadEnvLocalForceOverride();

const SHOULD_RUN =
  process.env.RUN_INTEGRATION_TESTS === "true" &&
  ENV_LOADED &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("test.supabase.co");

const describeIntegration = SHOULD_RUN ? describe : describe.skip;

describeIntegration("sync_business_managers RPC (integration)", () => {
  let admin: SupabaseClient;
  const orgId = randomUUID();
  const userId = randomUUID();
  const customProjectId = randomUUID();
  let defaultProjectId: string;

  beforeAll(async () => {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Seed: org + default project + one custom project for preservation test.
    const { error: orgErr } = await admin.from("organizations").insert({
      id: orgId,
      name: `test_rpc_${orgId.slice(0, 8)}`,
      slug: `test-rpc-${orgId.slice(0, 8)}`,
    });
    if (orgErr) throw new Error(`seed org failed: ${orgErr.message}`);

    // The org may already have an auto-created default project via
    // a trigger. Find it; if missing, create one.
    const { data: existing } = await admin
      .from("projects")
      .select("id")
      .eq("organization_id", orgId)
      .eq("is_default", true)
      .maybeSingle();
    if (existing) {
      defaultProjectId = existing.id;
    } else {
      const { data: defaultProject, error: defErr } = await admin
        .from("projects")
        .insert({
          organization_id: orgId,
          name: "Default",
          slug: "default",
          is_default: true,
        })
        .select("id")
        .single();
      if (defErr || !defaultProject) {
        throw new Error(`seed default project failed: ${defErr?.message}`);
      }
      defaultProjectId = defaultProject.id;
    }

    const { error: cpErr } = await admin.from("projects").insert({
      id: customProjectId,
      organization_id: orgId,
      name: "Custom",
      slug: "custom",
      is_default: false,
    });
    if (cpErr) throw new Error(`seed custom project failed: ${cpErr.message}`);
  });

  afterAll(async () => {
    if (!admin) return;
    // Order matters: ad_accounts → business_managers → projects → org.
    await admin.from("ad_accounts").delete().eq("organization_id", orgId);
    await admin.from("business_managers").delete().eq("organization_id", orgId);
    await admin.from("projects").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  });

  it("populates business_managers and ad_accounts with project_id", async () => {
    const payload = [
      {
        id: "bm_test_1",
        name: "Test BM 1",
        ad_accounts: [
          {
            id: "act_test_aaa",
            name: "Acc A",
            account_status: 1,
            currency: "BRL",
          },
          {
            id: "act_test_bbb",
            name: "Acc B",
            account_status: 1,
            currency: "USD",
          },
        ],
      },
      { id: "bm_test_2", name: "Test BM 2", ad_accounts: [] },
    ];

    const { error: rpcErr } = await admin.rpc("sync_business_managers", {
      p_organization_id: orgId,
      p_business_managers: payload,
    });

    expect(rpcErr, `RPC failed: ${rpcErr?.message}`).toBeNull();

    const { data: bms } = await admin
      .from("business_managers")
      .select("meta_bm_id, name")
      .eq("organization_id", orgId);
    expect(bms?.map((r) => r.meta_bm_id).sort()).toEqual([
      "bm_test_1",
      "bm_test_2",
    ]);

    const { data: accs } = await admin
      .from("ad_accounts")
      .select("meta_account_id, project_id, is_enabled")
      .eq("organization_id", orgId);
    expect(accs).toHaveLength(2);
    // The bug shape: project_id NULL would have been blocked by the
    // NOT NULL constraint; we additionally assert it equals the org's
    // default project so the column isn't being silently set to a
    // wrong value.
    for (const a of accs ?? []) {
      expect(
        a.project_id,
        `${a.meta_account_id} should default to org's default project`
      ).toBe(defaultProjectId);
      expect(a.is_enabled).toBe(false);
    }
  });

  it("preserves manual project_id reassignment across re-sync", async () => {
    // Move one account to the custom project, simulating user action.
    const { error: updErr } = await admin
      .from("ad_accounts")
      .update({ project_id: customProjectId, is_enabled: true })
      .eq("organization_id", orgId)
      .eq("meta_account_id", "act_test_aaa");
    expect(updErr).toBeNull();

    // Re-sync with same payload — must not yank act_test_aaa back
    // to the default project.
    const payload = [
      {
        id: "bm_test_1",
        name: "Test BM 1",
        ad_accounts: [
          {
            id: "act_test_aaa",
            name: "Acc A",
            account_status: 1,
            currency: "BRL",
          },
        ],
      },
    ];
    const { error: rpcErr } = await admin.rpc("sync_business_managers", {
      p_organization_id: orgId,
      p_business_managers: payload,
    });
    expect(rpcErr, `RPC failed: ${rpcErr?.message}`).toBeNull();

    const { data: acc } = await admin
      .from("ad_accounts")
      .select("project_id")
      .eq("organization_id", orgId)
      .eq("meta_account_id", "act_test_aaa")
      .maybeSingle();
    expect(acc?.project_id).toBe(customProjectId);
    // Note: is_enabled is NOT asserted here. reconcile_ad_account_plan_limits
    // (called at the end of sync) toggles it based on plan limits, and the
    // test org has no active subscription. The bug under test is project_id.
  });

  it("raises a clear error when org has no default project", async () => {
    // Demote the default project to expose the precondition.
    await admin
      .from("projects")
      .update({ is_default: false })
      .eq("id", defaultProjectId);

    const { error: rpcErr } = await admin.rpc("sync_business_managers", {
      p_organization_id: orgId,
      p_business_managers: [{ id: "bm_test_3", name: "BM 3", ad_accounts: [] }],
    });

    expect(rpcErr?.message ?? "").toMatch(/no default project/i);

    // Restore for any later test additions.
    await admin
      .from("projects")
      .update({ is_default: true })
      .eq("id", defaultProjectId);
  });
});
