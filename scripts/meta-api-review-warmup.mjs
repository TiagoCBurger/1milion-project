#!/usr/bin/env node
/**
 * Meta "Standard Access" / App Review usage helper
 * -----------------------------------------------
 * A Meta costuma exigir volume de chamadas bem-sucedidas à Graph API (ex.: ~1500 em 15 dias)
 * para avançar permissões avançadas. Este script repete um “pacote” de endpoints que o VibeFly
 * já documenta em Complience/permission-use-cases.md (ads_read, business_management, páginas, etc.).
 *
 * Uso:
 *   export META_USER_ACCESS_TOKEN="EAAG..."   # token de usuário com os scopes do app (Graph API Explorer ou fluxo OAuth)
 *   node scripts/meta-api-review-warmup.mjs --account-id=1542358501226016 --rounds=20 --delay-ms=120
 *
 * Opcional (1 POST leve por rodada para exercitar ads_management — campanha PAUSED):
 *   node scripts/meta-api-review-warmup.mjs --account-id=... --rounds=5 --touch-campaign-id=6948134925933
 *
 * Variáveis de ambiente:
 *   META_USER_ACCESS_TOKEN  (obrigatório) User access token com permissões do app
 *   META_API_VERSION        (opcional, default v24.0)
 */

import process from "node:process";

const API_VERSION = process.env.META_API_VERSION || "v24.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

function parseArgs(argv) {
  const out = {
    accountId: "",
    rounds: 1,
    delayMs: 100,
    touchCampaignId: "",
  };
  for (const a of argv) {
    if (a.startsWith("--account-id=")) out.accountId = a.slice("--account-id=".length).trim();
    else if (a.startsWith("--rounds=")) out.rounds = Math.max(1, parseInt(a.slice("--rounds=".length), 10) || 1);
    else if (a.startsWith("--delay-ms=")) out.delayMs = Math.max(0, parseInt(a.slice("--delay-ms=".length), 10) || 0);
    else if (a.startsWith("--touch-campaign-id="))
      out.touchCampaignId = a.slice("--touch-campaign-id=".length).trim();
  }
  return out;
}

function ensureAct(id) {
  const s = String(id).replace(/\s/g, "");
  return s.startsWith("act_") ? s : `act_${s}`;
}

async function sleep(ms) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

function errMsg(json) {
  const e = json?.error;
  if (!e) return "";
  return typeof e === "object" ? e.message || JSON.stringify(e) : String(e);
}

async function graphGet(token, path, params = {}) {
  const url = new URL(`${BASE}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = await fetch(url.toString());
  return /** @type {Record<string, unknown>} */ (await res.json());
}

async function graphPost(token, path, params = {}) {
  const url = `${BASE}/${path.replace(/^\//, "")}`;
  const body = new URLSearchParams();
  body.set("access_token", token);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return /** @type {Record<string, unknown>} */ (await res.json());
}

/**
 * One “round” = many GETs (+ optional one POST) covering documented permission surfaces.
 * @returns {{ ok: number, err: number }}
 */
async function runRound(token, accountId, touchCampaignId, delayMs, roundIndex) {
  let ok = 0;
  let err = 0;
  const act = ensureAct(accountId);

  /** @param {string} label */
  async function call(label, promise) {
    await sleep(delayMs);
    try {
      const data = await promise;
      if (data.error) {
        err++;
        console.error(`[round ${roundIndex}] [err] ${label}: ${errMsg(data)}`);
      } else {
        ok++;
        console.log(`[round ${roundIndex}] [ok] ${label}`);
      }
      return data;
    } catch (e) {
      err++;
      console.error(`[round ${roundIndex}] [err] ${label}: ${String(e)}`);
      return { error: { message: String(e) } };
    }
  }

  // business_management
  const businesses = await call("GET me/businesses", graphGet(token, "me/businesses", { fields: "id,name", limit: 10 }));
  const bmList = /** @type {Array<{id?: string}>} */ (Array.isArray(businesses.data) ? businesses.data : []);
  for (const bm of bmList.slice(0, 3)) {
    if (bm?.id) {
      await call(`GET ${bm.id}/owned_ad_accounts`, graphGet(token, `${bm.id}/owned_ad_accounts`, { fields: "id,name", limit: 15 }));
    }
  }

  // pages_show_list + pages_read_engagement (me/accounts)
  await call("GET me/accounts", graphGet(token, "me/accounts", { fields: "id,name,category", limit: 25 }));

  // ads_read — account
  await call(`GET ${act}`, graphGet(token, act, { fields: "id,name,account_status,currency" }));
  const campsRes = await call(
    `GET ${act}/campaigns`,
    graphGet(token, `${act}/campaigns`, { fields: "id,name,status,objective", limit: 15 }),
  );
  const c0 = /** @type {{ data?: Array<{ id?: string }> }} */ (campsRes).data?.[0]?.id;
  await call(`GET ${act}/adsets`, graphGet(token, `${act}/adsets`, { fields: "id,name,status", limit: 15 }));
  await call(`GET ${act}/ads`, graphGet(token, `${act}/ads`, { fields: "id,name,status", limit: 15 }));

  if (c0) {
    await call(`GET campaign ${c0}`, graphGet(token, String(c0), { fields: "id,name,status,objective" }));
    const adsets = await call(
      `GET ${c0}/adsets`,
      graphGet(token, `${c0}/adsets`, { fields: "id,name,status", limit: 10 }),
    );
    const a0 = /** @type {{ data?: Array<{ id?: string }> }} */ (adsets).data?.[0]?.id;
    if (a0) {
      const ads = await call(`GET ${a0}/ads`, graphGet(token, `${a0}/ads`, { fields: "id,name,status", limit: 10 }));
      const adId = /** @type {{ data?: Array<{ id?: string }> }} */ (ads).data?.[0]?.id;
      if (adId) {
        await call(`GET ad ${adId}`, graphGet(token, String(adId), { fields: "id,name,status" }));
        await call(`GET ${adId}/adcreatives`, graphGet(token, `${adId}/adcreatives`, { fields: "id,name", limit: 5 }));
      }
    }
  }

  // insights (ads_read)
  await call(`GET ${act}/insights`, graphGet(token, `${act}/insights`, {
    fields: "impressions,clicks,spend",
    date_preset: "last_7d",
    limit: 10,
  }));
  if (c0) {
    await call(`GET insights campaign ${c0}`, graphGet(token, `${c0}/insights`, {
      fields: "impressions,clicks,spend",
      date_preset: "last_7d",
      limit: 10,
    }));
  }

  // targeting / search (ads_read)
  await call("GET search adinterest", graphGet(token, "search", { type: "adinterest", q: "fitness", limit: 10 }));
  await call("GET search adgeolocation", graphGet(token, "search", { type: "adgeolocation", q: "Brazil", limit: 10 }));
  await call("GET search behaviors", graphGet(token, "search", { type: "adTargetingCategory", class: "behaviors", limit: 15 }));
  await call("GET search demographics", graphGet(token, "search", { type: "adTargetingCategory", class: "demographics", limit: 15 }));

  // Ad Library (ads_read)
  await call(
    "GET ads_archive",
    graphGet(token, "ads_archive", {
      search_terms: "technology",
      ad_reached_countries: JSON.stringify(["BR"]),
      ad_type: "ALL",
      limit: 10,
      fields: "id,ad_creation_time,page_name",
    }),
  );

  // pages linked to ad account
  await call(`GET ${act}/owned_pages`, graphGet(token, `${act}/owned_pages`, { fields: "id,name", limit: 15 }));
  await call(`GET ${act}/promote_pages`, graphGet(token, `${act}/promote_pages`, { fields: "id,name", limit: 15 }));

  // reach estimate (ads_read)
  const targetingSpec = {
    geo_locations: { countries: ["BR"] },
    age_min: 18,
    age_max: 65,
  };
  await call(
    `GET ${act}/reachestimate`,
    graphGet(token, `${act}/reachestimate`, {
      targeting_spec: JSON.stringify(targetingSpec),
    }),
  );

  // Optional: ads_management — tiny mutation on a PAUSED campaign (toggle name suffix)
  if (touchCampaignId) {
    const cid = String(touchCampaignId);
    const cur = await graphGet(token, cid, { fields: "name" });
    const nm = typeof cur.name === "string" ? cur.name : "Campaign";
    const suffix = " · MCP";
    const nextName = nm.endsWith(suffix) ? nm.slice(0, -suffix.length) : `${nm}${suffix}`;
    await sleep(delayMs);
    await call(`POST update campaign ${cid}`, graphPost(token, cid, { name: nextName }));
  }

  return { ok, err };
}

async function main() {
  const token = process.env.META_USER_ACCESS_TOKEN || "";
  if (!token) {
    console.error("Defina META_USER_ACCESS_TOKEN (user access token com os scopes do app).");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  if (!args.accountId) {
    console.error("Uso: node scripts/meta-api-review-warmup.mjs --account-id=1542358501226016 [--rounds=10] [--delay-ms=100] [--touch-campaign-id=ID]");
    process.exit(1);
  }

  let totalOk = 0;
  let totalErr = 0;

  for (let r = 1; r <= args.rounds; r++) {
    const { ok, err } = await runRound(token, args.accountId, args.touchCampaignId, args.delayMs, r);
    totalOk += ok;
    totalErr += err;
  }

  console.log("");
  console.log(`Concluído: ${args.rounds} rodada(s). Chamadas OK: ${totalOk}, com erro: ${totalErr}.`);
  console.log(
    "Dica: ~30–40 chamadas por rodada — ajuste --rounds para aproximar o volume que o App Dashboard pede (ex.: 1500 em 15 dias).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
