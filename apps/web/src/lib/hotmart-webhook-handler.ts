import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseHotmartCustomer,
  parseHotmartSale,
  webhookPayloadToSyncItem,
} from "@vibefly/hotmart";

const HOTMART_PROVIDER = "hotmart";

const MVP_EVENTS = new Set([
  "PURCHASE_APPROVED",
  "PURCHASE_COMPLETE",
  "PURCHASE_CANCELED",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
]);

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

export async function processHotmartWebhookEvent(
  admin: SupabaseClient,
  workspaceId: string,
  eventId: string,
  eventType: string,
  payload: unknown
): Promise<void> {
  if (!MVP_EVENTS.has(eventType)) {
    return;
  }

  const item = webhookPayloadToSyncItem(payload);
  const sale = parseHotmartSale(workspaceId, item);
  const cust = parseHotmartCustomer(workspaceId, item);

  if (!sale.transactionId) {
    return;
  }

  const nowIso = new Date().toISOString();

  let customerId: string | null = null;
  if (cust.email) {
    await admin.from("commerce_customers").upsert(
      {
        workspace_id: workspaceId,
        email: cust.email,
        name: cust.name,
        doc: cust.doc,
        phone: cust.phone,
        country: cust.country,
        raw: cust.raw as object,
      },
      { onConflict: "workspace_id,email" }
    );

    const { data: c } = await admin
      .from("commerce_customers")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", cust.email)
      .maybeSingle();

    customerId = c?.id ?? null;

    if (customerId) {
      await admin.from("commerce_customer_sources").upsert(
        {
          workspace_id: workspaceId,
          customer_id: customerId,
          integration_provider: HOTMART_PROVIDER,
          external_id: cust.email,
          raw: cust.raw as object,
          synced_at: nowIso,
        },
        { onConflict: "workspace_id,integration_provider,external_id" }
      );
    }
  }

  let productId: string | null = null;
  if (sale.hotmartProductId != null) {
    const { data: p } = await admin
      .from("commerce_product_sources")
      .select("product_id")
      .eq("workspace_id", workspaceId)
      .eq("integration_provider", HOTMART_PROVIDER)
      .eq("external_id", String(sale.hotmartProductId))
      .maybeSingle();
    productId = p?.product_id ?? null;
  }

  const { data: existingSaleSource } = await admin
    .from("commerce_sale_sources")
    .select("sale_id")
    .eq("workspace_id", workspaceId)
    .eq("integration_provider", HOTMART_PROVIDER)
    .eq("external_transaction_id", sale.transactionId)
    .maybeSingle();
  const saleId = existingSaleSource?.sale_id ?? crypto.randomUUID();

  let status = sale.status ?? eventType.replace("PURCHASE_", "");
  if (eventType === "PURCHASE_REFUNDED") status = "REFUNDED";
  if (eventType === "PURCHASE_CHARGEBACK") status = "CHARGEBACK";
  if (eventType === "PURCHASE_CANCELED") status = "CANCELED";

  await admin.from("commerce_sales").upsert(
    {
      id: saleId,
      workspace_id: workspaceId,
      customer_id: customerId,
      product_id: productId,
      status,
      amount: sale.amount,
      currency: sale.currency,
      commission_total: sale.commission,
      purchase_date: sale.purchaseDate,
      payment_type: sale.paymentType,
      offer_code: sale.offerCode,
      src: sale.src,
      raw: sale.raw as object,
      synced_at: nowIso,
    },
    { onConflict: "id" }
  );

  await admin.from("commerce_sale_sources").upsert(
    {
      workspace_id: workspaceId,
      sale_id: saleId,
      integration_provider: HOTMART_PROVIDER,
      external_transaction_id: sale.transactionId,
      external_product_id:
        sale.hotmartProductId != null ? String(sale.hotmartProductId) : null,
      raw: sale.raw as object,
      synced_at: nowIso,
    },
    {
      onConflict: "workspace_id,integration_provider,external_transaction_id",
    }
  );

  if (sale.hotmartProductId != null && !productId) {
    await admin.rpc("reconcile_commerce_sale_products", {
      p_workspace_id: workspaceId,
      p_provider: HOTMART_PROVIDER,
    });
  }

  if (eventType === "PURCHASE_REFUNDED") {
    const { data: existingRefundSource } = await admin
      .from("commerce_refund_sources")
      .select("refund_id")
      .eq("workspace_id", workspaceId)
      .eq("integration_provider", HOTMART_PROVIDER)
      .eq("external_transaction_id", sale.transactionId)
      .maybeSingle();

    const refundId = existingRefundSource?.refund_id ?? crypto.randomUUID();

    await admin.from("commerce_refunds").upsert(
      {
        id: refundId,
        workspace_id: workspaceId,
        sale_id: saleId,
        refund_date: sale.purchaseDate,
        amount: sale.amount,
        reason: str((payload as Record<string, unknown>)?.refund_reason),
        raw: payload as object,
      },
      { onConflict: "id" }
    );

    await admin.from("commerce_refund_sources").upsert(
      {
        workspace_id: workspaceId,
        refund_id: refundId,
        integration_provider: HOTMART_PROVIDER,
        external_transaction_id: sale.transactionId,
        raw: payload as object,
        synced_at: nowIso,
      },
      {
        onConflict: "workspace_id,integration_provider,external_transaction_id",
      }
    );
  }
}
