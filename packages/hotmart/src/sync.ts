import {
  hotmartFetchPage,
  hotmartPaginateAll,
} from "./api";

const HOTMART_PROVIDER = "hotmart";

export type HotmartEntity = "products" | "sales" | "customers" | "refunds";
export type HotmartSyncTrigger = "initial" | "manual" | "webhook" | "cron";

export interface SupabaseRestConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

export interface SyncResult {
  syncLogId: string;
  recordsSynced: number;
  error?: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

async function sb(
  rest: SupabaseRestConfig,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${rest.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: rest.serviceRoleKey,
      Authorization: `Bearer ${rest.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function startSyncLog(
  rest: SupabaseRestConfig,
  workspaceId: string,
  entity: string,
  trigger: HotmartSyncTrigger
): Promise<string | null> {
  const res = await sb(rest, "hotmart_sync_log", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      workspace_id: workspaceId,
      entity,
      status: "running",
      trigger,
    }),
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

async function finishSyncLog(
  rest: SupabaseRestConfig,
  id: string,
  status: "success" | "error",
  records: number,
  error?: string
) {
  await sb(rest, `hotmart_sync_log?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status,
      finished_at: new Date().toISOString(),
      records_synced: records,
      error: error ?? null,
    }),
  });
}

async function touchLastSync(rest: SupabaseRestConfig, workspaceId: string) {
  await sb(rest, `hotmart_credentials?workspace_id=eq.${workspaceId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_sync_at: new Date().toISOString() }),
  });
}

async function rpc(rest: SupabaseRestConfig, name: string, params: object) {
  return fetch(`${rest.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: rest.serviceRoleKey,
      Authorization: `Bearer ${rest.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function mapProduct(workspaceId: string, item: unknown) {
  const o = asRecord(item) ?? {};
  const id =
    num(o.id) ??
    num(o.productId) ??
    num(asRecord(o.product)?.id) ??
    num(asRecord(o.product)?.productId);
  const name =
    str(o.name) ?? str(asRecord(o.product)?.name) ?? str(o.title);
  const ucode = str(o.ucode) ?? str(o.uCode);
  const status = str(o.status) ?? str(o.enabled);
  const format = str(o.format) ?? str(o.productFormat);
  const price = asRecord(o.price) ?? asRecord(o.offer);
  const priceValue = num(price?.value) ?? num(o.price_value);
  const priceCurrency =
    str(price?.currency_code) ?? str(price?.currencyCode) ?? str(o.currency_code);
  const createdHm =
    str(o.creation_date) ??
    str(o.creationDate) ??
    str(o.created_at) ??
    str(o.createdAt);

  return {
    workspace_id: workspaceId,
    hotmart_id: id,
    name,
    ucode,
    status: typeof status === "string" ? status : null,
    format: typeof format === "string" ? format : null,
    price_value: priceValue,
    price_currency: priceCurrency,
    created_at_source: createdHm,
    raw: o,
    synced_at: new Date().toISOString(),
  };
}

function mapCustomer(workspaceId: string, item: unknown) {
  const o = asRecord(item) ?? {};
  const u = asRecord(o.user) ?? asRecord(o.buyer) ?? o;
  const email =
    (str(u.email) ?? str(u.mail) ?? "").trim().toLowerCase() || null;
  const nameFromParts =
    [str(u.first_name), str(u.last_name)].filter(Boolean).join(" ") || null;
  const name =
    str(u.name) ??
    str(u.full_name) ??
    str(u.fullName) ??
    nameFromParts;
  return {
    workspace_id: workspaceId,
    email,
    name,
    doc: str(u.document) ?? str(u.cpf) ?? str(u.doc),
    phone: str(u.phone) ?? str(u.phone_number),
    country: str(u.country) ?? str(u.country_code),
    raw: o,
  };
}

export function parseHotmartSale(workspaceId: string, item: unknown) {
  return mapSale(workspaceId, item);
}

export function parseHotmartCustomer(workspaceId: string, item: unknown) {
  return mapCustomer(workspaceId, item);
}

function mapSale(workspaceId: string, item: unknown) {
  const o = asRecord(item) ?? {};
  const purchase =
    asRecord(o.purchase) ?? asRecord(o.transaction) ?? asRecord(o.order) ?? o;
  const buyer = asRecord(o.buyer) ?? asRecord(purchase.buyer) ?? {};
  const product =
    asRecord(o.product) ?? asRecord(purchase.product) ?? asRecord(o.item);

  const transactionId =
    str(purchase.transaction) ??
    str(purchase.transaction_id) ??
    str(purchase.transactionId) ??
    str(o.transaction_id) ??
    str(o.transactionId);

  const email =
    (str(buyer.email) ?? str(buyer.mail) ?? "").trim().toLowerCase() || null;

  const status =
    str(purchase.status) ??
    str(purchase.transaction_status) ??
    str(purchase.transactionStatus) ??
    str(o.status);

  const hotmartProductId =
    num(product?.id) ?? num(product?.productId) ?? num(o.product_id);

  const amount =
    num(purchase.price) ??
    num(purchase.value) ??
    num(asRecord(purchase.amount)?.value) ??
    num(o.amount);

  const currency =
    str(purchase.currency) ??
    str(purchase.currency_code) ??
    str(asRecord(purchase.amount)?.currency_code);

  const commission =
    num(purchase.producer_commission) ??
    num(purchase.producerCommission) ??
    num(o.commission);

  const purchaseDateRaw =
    str(purchase.approved_date) ??
    str(purchase.approvedDate) ??
    str(purchase.order_date) ??
    str(purchase.orderDate) ??
    str(purchase.date) ??
    str(o.purchase_date);

  let purchaseDate: string | null = null;
  if (purchaseDateRaw) {
    const ms = Number(purchaseDateRaw);
    if (!Number.isNaN(ms) && ms > 1e12) {
      purchaseDate = new Date(ms).toISOString();
    } else {
      const d = new Date(purchaseDateRaw);
      if (!Number.isNaN(d.getTime())) purchaseDate = d.toISOString();
    }
  }

  const paymentType =
    str(purchase.payment_type) ??
    str(purchase.paymentType) ??
    str(purchase.payment_method) ??
    str(purchase.paymentMethod);

  const offerCode =
    str(purchase.offer_code) ?? str(purchase.offerCode) ?? str(o.offer_code);

  const src =
    str(purchase.src) ?? str(purchase.source) ?? str(purchase.sck) ?? null;

  return {
    transactionId,
    email,
    status,
    hotmartProductId,
    amount,
    currency,
    commission,
    purchaseDate,
    paymentType,
    offerCode,
    src,
    raw: o,
  };
}

async function upsertBatch(
  rest: SupabaseRestConfig,
  table: string,
  onConflict: string,
  rows: Record<string, unknown>[]
): Promise<boolean> {
  if (rows.length === 0) return true;
  const res = await sb(rest, `${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  return res.ok;
}

const chunk = <T>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

function buildOrEquals(column: string, values: string[]): string {
  return values
    .map((value) => `${column}.eq.${encodeURIComponent(value)}`)
    .join(",");
}

async function getCustomerIdsByEmail(
  rest: SupabaseRestConfig,
  workspaceId: string,
  emails: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(emails.filter(Boolean))];
  if (uniq.length === 0) return map;
  for (const group of chunk(uniq, 15)) {
    const ors = buildOrEquals("email", group);
    const res = await sb(
      rest,
      `commerce_customers?workspace_id=eq.${workspaceId}&or=(${ors})&select=id,email`
    );
    if (!res.ok) continue;
    const rows = (await res.json()) as Array<{ id: string; email: string }>;
    for (const r of rows) {
      map.set(r.email.toLowerCase(), r.id);
    }
  }
  return map;
}

async function getProductIdsByExternalId(
  rest: SupabaseRestConfig,
  workspaceId: string,
  externalIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(externalIds.filter(Boolean))];
  if (uniq.length === 0) return map;

  for (const group of chunk(uniq, 20)) {
    const ors = buildOrEquals("external_id", group);
    const res = await sb(
      rest,
      `commerce_product_sources?workspace_id=eq.${workspaceId}&integration_provider=eq.${HOTMART_PROVIDER}&or=(${ors})&select=product_id,external_id`
    );
    if (!res.ok) continue;
    const rows = (await res.json()) as Array<{
      product_id: string;
      external_id: string;
    }>;
    for (const r of rows) {
      map.set(r.external_id, r.product_id);
    }
  }

  return map;
}

async function getSaleIdsByExternalTransaction(
  rest: SupabaseRestConfig,
  workspaceId: string,
  transactionIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(transactionIds.filter(Boolean))];
  if (uniq.length === 0) return map;

  for (const group of chunk(uniq, 20)) {
    const ors = buildOrEquals("external_transaction_id", group);
    const res = await sb(
      rest,
      `commerce_sale_sources?workspace_id=eq.${workspaceId}&integration_provider=eq.${HOTMART_PROVIDER}&or=(${ors})&select=sale_id,external_transaction_id`
    );
    if (!res.ok) continue;
    const rows = (await res.json()) as Array<{
      sale_id: string;
      external_transaction_id: string;
    }>;
    for (const r of rows) {
      map.set(r.external_transaction_id, r.sale_id);
    }
  }

  return map;
}

async function getRefundIdsByExternalTransaction(
  rest: SupabaseRestConfig,
  workspaceId: string,
  transactionIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(transactionIds.filter(Boolean))];
  if (uniq.length === 0) return map;

  for (const group of chunk(uniq, 20)) {
    const ors = buildOrEquals("external_transaction_id", group);
    const res = await sb(
      rest,
      `commerce_refund_sources?workspace_id=eq.${workspaceId}&integration_provider=eq.${HOTMART_PROVIDER}&or=(${ors})&select=refund_id,external_transaction_id`
    );
    if (!res.ok) continue;
    const rows = (await res.json()) as Array<{
      refund_id: string;
      external_transaction_id: string;
    }>;
    for (const r of rows) {
      map.set(r.external_transaction_id, r.refund_id);
    }
  }

  return map;
}

export async function syncHotmartEntity(
  rest: SupabaseRestConfig,
  workspaceId: string,
  accessToken: string,
  entity: HotmartEntity,
  trigger: HotmartSyncTrigger,
  opts?: { since?: Date }
): Promise<SyncResult> {
  const syncLogId = await startSyncLog(rest, workspaceId, entity, trigger);
  if (!syncLogId) {
    return { syncLogId: "", recordsSynced: 0, error: "Failed to open sync log" };
  }

  const fail = async (msg: string, n = 0) => {
    await finishSyncLog(rest, syncLogId, "error", n, msg);
    return { syncLogId, recordsSynced: n, error: msg };
  };

  try {
    let records = 0;

    if (entity === "products") {
      const { items, error } = await hotmartPaginateAll((pageToken) =>
        hotmartFetchPage(
          "/products/api/v1/products",
          pageToken ? { page_token: pageToken } : {},
          accessToken
        )
      );
      if (error) return await fail(error);

      const parsed = items
        .map((i) => mapProduct(workspaceId, i))
        .filter((r) => r.hotmart_id != null);
      const externalIds = parsed.map((r) => String(r.hotmart_id));
      const sourceMap = await getProductIdsByExternalId(rest, workspaceId, externalIds);

      const nowIso = new Date().toISOString();
      const productRows: Record<string, unknown>[] = [];
      const sourceRows: Record<string, unknown>[] = [];

      for (const row of parsed) {
        const externalId = String(row.hotmart_id);
        const productId = sourceMap.get(externalId) ?? crypto.randomUUID();

        productRows.push({
          id: productId,
          workspace_id: workspaceId,
          name: row.name,
          status: row.status,
          format: row.format,
          price_value: row.price_value,
          price_currency: row.price_currency,
          created_at_source: row.created_at_source,
          raw: row.raw,
          synced_at: row.synced_at,
        });

        sourceRows.push({
          workspace_id: workspaceId,
          product_id: productId,
          integration_provider: HOTMART_PROVIDER,
          external_id: externalId,
          external_code: row.ucode,
          raw: row.raw,
          synced_at: nowIso,
        });
      }

      for (const part of chunk(productRows, 80)) {
        if (!(await upsertBatch(rest, "commerce_products", "id", part))) {
          return await fail("Upsert products failed", records);
        }
      }

      for (const part of chunk(sourceRows, 80)) {
        if (
          !(await upsertBatch(
            rest,
            "commerce_product_sources",
            "workspace_id,integration_provider,external_id",
            part
          ))
        ) {
          return await fail("Upsert product sources failed", records);
        }
        records += part.length;
      }

      await rpc(rest, "reconcile_commerce_sale_products", {
        p_workspace_id: workspaceId,
        p_provider: HOTMART_PROVIDER,
      });
    } else if (entity === "customers") {
      const end = Date.now();
      const start = opts?.since?.getTime() ?? end - 365 * 24 * 60 * 60 * 1000;
      const { items, error } = await hotmartPaginateAll((pageToken) =>
        hotmartFetchPage(
          "/payments/api/v1/sales/users",
          {
            start_date: start,
            end_date: end,
            ...(pageToken ? { page_token: pageToken } : {}),
          },
          accessToken
        )
      );
      if (error) return await fail(error);

      const rows = items
        .map((i) => mapCustomer(workspaceId, i))
        .filter((r) => r.email) as Array<ReturnType<typeof mapCustomer> & { email: string }>;

      for (const part of chunk(rows as unknown as Record<string, unknown>[], 80)) {
        if (!(await upsertBatch(rest, "commerce_customers", "workspace_id,email", part))) {
          return await fail("Upsert customers failed", records);
        }
      }

      const emailMap = await getCustomerIdsByEmail(
        rest,
        workspaceId,
        rows.map((r) => r.email)
      );

      const sourceRows = rows
        .map((row) => {
          const customerId = emailMap.get(row.email);
          if (!customerId) return null;
          return {
            workspace_id: workspaceId,
            customer_id: customerId,
            integration_provider: HOTMART_PROVIDER,
            external_id: row.email,
            raw: row.raw,
            synced_at: new Date().toISOString(),
          };
        })
        .filter(Boolean) as Record<string, unknown>[];

      for (const part of chunk(sourceRows, 80)) {
        if (
          !(await upsertBatch(
            rest,
            "commerce_customer_sources",
            "workspace_id,integration_provider,external_id",
            part
          ))
        ) {
          return await fail("Upsert customer sources failed", records);
        }
      }

      records = rows.length;
    } else if (entity === "sales") {
      const end = Date.now();
      const start = opts?.since?.getTime() ?? end - 365 * 24 * 60 * 60 * 1000;
      const { items, error } = await hotmartPaginateAll((pageToken) =>
        hotmartFetchPage(
          "/payments/api/v1/sales/history",
          {
            start_date: start,
            end_date: end,
            ...(pageToken ? { page_token: pageToken } : {}),
          },
          accessToken
        )
      );
      if (error) return await fail(error);

      const parsed = items.map((i) => mapSale(workspaceId, i));
      const emails = parsed.map((p) => p.email).filter(Boolean) as string[];
      const customerRows = [
        ...new Map(
          emails.map((e) => [e, { workspace_id: workspaceId, email: e, raw: {} }])
        ).values(),
      ] as Record<string, unknown>[];

      for (const part of chunk(customerRows, 80)) {
        await upsertBatch(rest, "commerce_customers", "workspace_id,email", part);
      }

      const custMap = await getCustomerIdsByEmail(rest, workspaceId, emails);
      const productMap = await getProductIdsByExternalId(
        rest,
        workspaceId,
        parsed
          .map((p) => p.hotmartProductId)
          .filter((n): n is number => n != null)
          .map((n) => String(n))
      );

      const transactionIds = parsed
        .map((p) => p.transactionId)
        .filter((t): t is string => Boolean(t));
      const saleMap = await getSaleIdsByExternalTransaction(rest, workspaceId, transactionIds);

      const nowIso = new Date().toISOString();
      const saleRows: Record<string, unknown>[] = [];
      const sourceRows: Record<string, unknown>[] = [];

      for (const p of parsed) {
        if (!p.transactionId || !p.status) continue;

        const saleId = saleMap.get(p.transactionId) ?? crypto.randomUUID();
        const customerId = p.email ? custMap.get(p.email) ?? null : null;
        const productId = p.hotmartProductId
          ? productMap.get(String(p.hotmartProductId)) ?? null
          : null;

        saleRows.push({
          id: saleId,
          workspace_id: workspaceId,
          customer_id: customerId,
          product_id: productId,
          status: p.status,
          amount: p.amount,
          currency: p.currency,
          commission_total: p.commission,
          purchase_date: p.purchaseDate,
          payment_type: p.paymentType,
          offer_code: p.offerCode,
          src: p.src,
          raw: p.raw,
          synced_at: nowIso,
        });

        sourceRows.push({
          workspace_id: workspaceId,
          sale_id: saleId,
          integration_provider: HOTMART_PROVIDER,
          external_transaction_id: p.transactionId,
          external_product_id:
            p.hotmartProductId != null ? String(p.hotmartProductId) : null,
          raw: p.raw,
          synced_at: nowIso,
        });
      }

      for (const part of chunk(saleRows, 80)) {
        if (!(await upsertBatch(rest, "commerce_sales", "id", part))) {
          return await fail("Upsert sales failed", records);
        }
      }

      for (const part of chunk(sourceRows, 80)) {
        if (
          !(await upsertBatch(
            rest,
            "commerce_sale_sources",
            "workspace_id,integration_provider,external_transaction_id",
            part
          ))
        ) {
          return await fail("Upsert sale sources failed", records);
        }
        records += part.length;
      }

      await rpc(rest, "reconcile_commerce_sale_products", {
        p_workspace_id: workspaceId,
        p_provider: HOTMART_PROVIDER,
      });
    } else if (entity === "refunds") {
      const end = Date.now();
      const start = opts?.since?.getTime() ?? end - 365 * 24 * 60 * 60 * 1000;
      const { items, error } = await hotmartPaginateAll((pageToken) =>
        hotmartFetchPage(
          "/payments/api/v1/sales/history",
          {
            start_date: start,
            end_date: end,
            transaction_status: "REFUNDED",
            ...(pageToken ? { page_token: pageToken } : {}),
          },
          accessToken
        )
      );
      if (error) return await fail(error);

      const parsed = items
        .map((item) => ({
          sale: mapSale(workspaceId, item),
          raw: item,
          reason: str(asRecord(item)?.refund_reason),
        }))
        .filter((item) => item.sale.transactionId);

      const transactionIds = parsed
        .map((p) => p.sale.transactionId)
        .filter((t): t is string => Boolean(t));

      const saleIdsByTransaction = await getSaleIdsByExternalTransaction(
        rest,
        workspaceId,
        transactionIds
      );
      const refundMap = await getRefundIdsByExternalTransaction(
        rest,
        workspaceId,
        transactionIds
      );

      const nowIso = new Date().toISOString();
      const refundRows: Record<string, unknown>[] = [];
      const sourceRows: Record<string, unknown>[] = [];

      for (const item of parsed) {
        const transactionId = item.sale.transactionId;
        if (!transactionId) continue;

        const saleId = saleIdsByTransaction.get(transactionId);
        if (!saleId) continue;

        const refundId = refundMap.get(transactionId) ?? crypto.randomUUID();

        refundRows.push({
          id: refundId,
          workspace_id: workspaceId,
          sale_id: saleId,
          refund_date: item.sale.purchaseDate,
          amount: item.sale.amount,
          reason: item.reason,
          raw: item.raw as object,
        });

        sourceRows.push({
          workspace_id: workspaceId,
          refund_id: refundId,
          integration_provider: HOTMART_PROVIDER,
          external_transaction_id: transactionId,
          raw: item.raw as object,
          synced_at: nowIso,
        });
      }

      for (const part of chunk(refundRows, 80)) {
        if (!(await upsertBatch(rest, "commerce_refunds", "id", part))) {
          return await fail("Upsert refunds failed", records);
        }
      }

      for (const part of chunk(sourceRows, 80)) {
        if (
          !(await upsertBatch(
            rest,
            "commerce_refund_sources",
            "workspace_id,integration_provider,external_transaction_id",
            part
          ))
        ) {
          return await fail("Upsert refund sources failed", records);
        }
        records += part.length;
      }
    }

    await finishSyncLog(rest, syncLogId, "success", records);
    await touchLastSync(rest, workspaceId);
    return { syncLogId, recordsSynced: records };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishSyncLog(rest, syncLogId, "error", 0, msg);
    return { syncLogId, recordsSynced: 0, error: msg };
  }
}

export async function runHotmartInitialBackfill(
  rest: SupabaseRestConfig,
  workspaceId: string,
  accessToken: string,
  trigger: HotmartSyncTrigger
): Promise<{ ok: boolean; errors: string[] }> {
  const order: HotmartEntity[] = ["products", "customers", "sales", "refunds"];
  const errors: string[] = [];
  for (const ent of order) {
    const r = await syncHotmartEntity(rest, workspaceId, accessToken, ent, trigger);
    if (r.error) errors.push(`${ent}: ${r.error}`);
  }
  return { ok: errors.length === 0, errors };
}
