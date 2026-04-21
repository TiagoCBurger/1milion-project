// ============================================================
// Upload-pipeline janitor.
//
// Runs on a Cloudflare cron trigger. Two responsibilities:
//   1. Flip pending leases past expires_at → 'expired'.
//      (Calls expire_stale_upload_leases() RPC.)
//   2. Sweep orphan R2 keys: every item key under an expired,
//      never-finalized lease is guaranteed to be unindexed in
//      ad_images, so it's safe to delete from R2.
//
// After sweeping, the lease is marked 'cancelled' so the next
// janitor run skips it (idempotent).
//
// Partial leases (status='partial') intentionally NOT swept here:
// they have some finalized items in ad_images, and identifying the
// orphan subset requires a per-key cross-check that we defer to a
// later, more careful pass.
// ============================================================

import type { Env } from "./types";

interface LeaseItemMeta {
  key: string;
  file_name?: string;
  expected_size?: number;
  declared_mime?: string;
  expected_sha256?: string;
}

interface ExpiredLease {
  id: string;
  organization_id: string;
  account_id: string;
  items_meta: LeaseItemMeta[];
}

export interface JanitorResult {
  expiredCount: number;
  sweptLeases: number;
  deletedKeys: number;
  errors: string[];
}

const SUPABASE_REST_HEADERS = (env: Env) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
});

async function expireStaleLeases(env: Env): Promise<number> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/expire_stale_upload_leases`,
    {
      method: "POST",
      headers: SUPABASE_REST_HEADERS(env),
      body: "{}",
    },
  );
  if (!res.ok) {
    throw new Error(`expire_stale_upload_leases failed: ${res.status} ${await res.text()}`);
  }
  const count = (await res.json()) as number;
  return typeof count === "number" ? count : 0;
}

async function fetchOrphanLeases(env: Env, limit = 50): Promise<ExpiredLease[]> {
  const url =
    `${env.SUPABASE_URL}/rest/v1/upload_leases` +
    `?status=eq.expired` +
    `&finalized_at=is.null` +
    `&select=id,organization_id,account_id,items_meta` +
    `&limit=${limit}`;
  const res = await fetch(url, { headers: SUPABASE_REST_HEADERS(env) });
  if (!res.ok) {
    throw new Error(`fetchOrphanLeases failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ExpiredLease[];
}

async function markCancelled(env: Env, leaseId: string): Promise<void> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/upload_leases?id=eq.${leaseId}`,
    {
      method: "PATCH",
      headers: { ...SUPABASE_REST_HEADERS(env), Prefer: "return=minimal" },
      body: JSON.stringify({ status: "cancelled" }),
    },
  );
  if (!res.ok) {
    throw new Error(`markCancelled(${leaseId}) failed: ${res.status}`);
  }
}

async function logCancel(
  env: Env,
  organizationId: string,
  leaseId: string,
  accountId: string,
  r2Key: string,
  reason: string,
): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/upload_audit_log`, {
    method: "POST",
    headers: { ...SUPABASE_REST_HEADERS(env), Prefer: "return=minimal" },
    body: JSON.stringify({
      organization_id: organizationId,
      lease_id: leaseId,
      account_id: accountId,
      r2_key: r2Key,
      action: "cancel",
      reason,
    }),
  }).catch((err) => console.error("[janitor] audit insert failed:", err));
}

export async function runJanitor(env: Env): Promise<JanitorResult> {
  const result: JanitorResult = {
    expiredCount: 0,
    sweptLeases: 0,
    deletedKeys: 0,
    errors: [],
  };

  try {
    result.expiredCount = await expireStaleLeases(env);
  } catch (err) {
    result.errors.push((err as Error).message);
    return result;
  }

  let leases: ExpiredLease[];
  try {
    leases = await fetchOrphanLeases(env);
  } catch (err) {
    result.errors.push((err as Error).message);
    return result;
  }

  for (const lease of leases) {
    const items = Array.isArray(lease.items_meta) ? lease.items_meta : [];
    let leaseDeleted = 0;
    for (const item of items) {
      if (!item?.key) continue;
      try {
        // R2 delete is idempotent — missing keys return success.
        await env.CREATIVES_R2.delete(item.key);
        leaseDeleted += 1;
        await logCancel(
          env,
          lease.organization_id,
          lease.id,
          lease.account_id,
          item.key,
          "janitor: orphan R2 key from expired lease",
        );
      } catch (err) {
        const msg = `delete ${item.key}: ${(err as Error).message}`;
        result.errors.push(msg);
      }
    }
    try {
      await markCancelled(env, lease.id);
      result.sweptLeases += 1;
      result.deletedKeys += leaseDeleted;
    } catch (err) {
      result.errors.push((err as Error).message);
    }
  }

  return result;
}
