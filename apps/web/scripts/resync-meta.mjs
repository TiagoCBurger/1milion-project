// Manually re-sync Meta business_managers + ad_accounts for one organization,
// using the encrypted token already stored in meta_tokens.
//
// Usage:
//   node --env-file=apps/web/.env.local scripts/resync-meta.mjs <organization_id>
//
// Requires in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   TOKEN_ENCRYPTION_KEY

import { createClient } from "@supabase/supabase-js";

const orgId = process.argv[2];
if (!orgId) {
  console.error("Usage: node --env-file=apps/web/.env.local scripts/resync-meta.mjs <organization_id>");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENCRYPTION_KEY) {
  console.error("Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TOKEN_ENCRYPTION_KEY");
  process.exit(1);
}

const META_API_VERSION = "v21.0";
const GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchBmAdAccounts(token, bmId) {
  const url = `${GRAPH_URL}/${bmId}/owned_ad_accounts?fields=id,name,account_status,currency&limit=100&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.warn(`  /owned_ad_accounts for ${bmId} failed:`, err);
    return [];
  }
  const data = await res.json();
  return (data.data || []).map((acc) => ({
    id: acc.id,
    name: acc.name || "",
    account_status: acc.account_status,
    currency: acc.currency || "",
  }));
}

async function inspectToken(token) {
  const meRes = await fetch(`${GRAPH_URL}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  if (!meRes.ok) {
    const err = await meRes.json().catch(() => ({}));
    throw new Error(`/me failed: ${JSON.stringify(err)}`);
  }
  const me = await meRes.json();
  console.log(`Token belongs to Meta user: ${me.name} (${me.id})`);

  const bmRes = await fetch(`${GRAPH_URL}/me/businesses?fields=id,name&limit=100&access_token=${encodeURIComponent(token)}`);
  if (!bmRes.ok) {
    const err = await bmRes.json().catch(() => ({}));
    throw new Error(`/me/businesses failed: ${JSON.stringify(err)}`);
  }
  const bmData = await bmRes.json();
  const bms = bmData.data || [];
  console.log(`/me/businesses returned ${bms.length} BM(s)`);

  const businessManagers = [];
  for (const bm of bms) {
    const adAccounts = await fetchBmAdAccounts(token, bm.id);
    console.log(`  BM ${bm.id} "${bm.name}" → ${adAccounts.length} ad account(s)`);
    businessManagers.push({ id: bm.id, name: bm.name, ad_accounts: adAccounts });
  }
  return {
    bmId: bms[0]?.id ?? null,
    bmName: bms[0]?.name ?? null,
    businessManagers,
  };
}

async function main() {
  console.log(`Decrypting token for org ${orgId}…`);
  const { data: token, error: decErr } = await admin.rpc("decrypt_meta_token", {
    p_organization_id: orgId,
    p_encryption_key: ENCRYPTION_KEY,
  });
  if (decErr || !token) {
    console.error("decrypt_meta_token failed:", decErr ?? "no token returned (is_valid=false or expired?)");
    process.exit(1);
  }
  console.log(`Token decrypted (length=${token.length}). Inspecting…`);

  const inspection = await inspectToken(token);

  if (inspection.bmId) {
    const { error: orgErr } = await admin
      .from("organizations")
      .update({
        meta_business_id: inspection.bmId,
        meta_business_name: inspection.bmName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgId);
    if (orgErr) console.warn("organizations update warning:", orgErr);
  }

  if (inspection.businessManagers.length === 0) {
    console.log("No BMs to sync. Nothing inserted into business_managers/ad_accounts.");
    return;
  }

  console.log("Calling sync_business_managers…");
  const { error: syncErr } = await admin.rpc("sync_business_managers", {
    p_organization_id: orgId,
    p_business_managers: inspection.businessManagers,
  });
  if (syncErr) {
    console.error("sync_business_managers failed:", syncErr);
    process.exit(1);
  }

  const { count: bmCount } = await admin
    .from("business_managers")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  const { count: accCount } = await admin
    .from("ad_accounts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  console.log(`Done. business_managers=${bmCount}, ad_accounts=${accCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
