import { z } from "zod";
import {
  isHotmartIntegrationEnabled,
  type SubscriptionTier,
  INTEGRATION_PROVIDERS,
} from "@vibefly/shared";
import {
  runHotmartInitialBackfill,
  syncHotmartEntity,
  type HotmartEntity,
} from "@vibefly/hotmart";
import { getHotmartAccessToken } from "../auth";
import { textResult } from "../meta-api";
import type { ToolContext } from "./index";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CommerceProvider = (typeof INTEGRATION_PROVIDERS)[keyof typeof INTEGRATION_PROVIDERS];

function paidPlanError() {
  return textResult(
    {
      error: "Commerce integration requires a paid plan (Pro, Max, or Enterprise).",
    },
    true
  );
}

async function sbGet<T>(ctx: ToolContext, path: string): Promise<T | null> {
  const res = await fetch(`${ctx.env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${ctx.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// Check whether *any* commerce provider is connected for this workspace.
// Today only Hotmart is supported; add future providers here as they land.
async function hasConnectedProvider(ctx: ToolContext): Promise<boolean> {
  const rows = await sbGet<Array<{ id: string }>>(
    ctx,
    `hotmart_credentials?workspace_id=eq.${ctx.workspaceId}&is_active=eq.true&select=id`
  );
  return Boolean(rows && rows.length > 0);
}

function notConnected() {
  return textResult(
    {
      error:
        "No commerce integration is connected. Open the dashboard → Integrations and connect a provider.",
    },
    true
  );
}

function mapProductRow(row: Record<string, unknown>) {
  const product = (row.product ?? {}) as Record<string, unknown>;
  return {
    ...(product as object),
    provider: row.integration_provider,
    external_id: row.external_id,
    external_code: row.external_code,
    source_synced_at: row.synced_at,
  };
}

function mapSaleRow(row: Record<string, unknown>) {
  const sale = (row.sale ?? {}) as Record<string, unknown>;
  return {
    ...(sale as object),
    provider: row.integration_provider,
    transaction_id: row.external_transaction_id,
    external_product_id: row.external_product_id,
    source_synced_at: row.synced_at,
  };
}

function mapRefundRow(row: Record<string, unknown>) {
  const refund = (row.refund ?? {}) as Record<string, unknown>;
  return {
    ...(refund as object),
    provider: row.integration_provider,
    transaction_id: row.external_transaction_id,
    source_synced_at: row.synced_at,
  };
}

const PROVIDER_VALUES = Object.values(INTEGRATION_PROVIDERS) as [
  CommerceProvider,
  ...CommerceProvider[],
];

function providerFilter(provider?: CommerceProvider): string {
  return provider
    ? `&integration_provider=eq.${encodeURIComponent(provider)}`
    : "";
}

export function registerCommerceTools(ctx: ToolContext): void {
  const { server, tier } = ctx;
  const paid = isHotmartIntegrationEnabled(tier as SubscriptionTier);

  const wrap =
    (
      fn: (args: Record<string, unknown>) => Promise<ReturnType<typeof textResult>>
    ) =>
    async (args: Record<string, unknown>) => {
      if (!paid) return paidPlanError();
      if (!(await hasConnectedProvider(ctx))) return notConnected();
      return fn(args);
    };

  server.tool(
    "commerce_list_products",
    "List commerce products synced for this workspace (local database, provider-agnostic).",
    {
      limit: z.number().min(1).max(500).default(50),
      offset: z.number().min(0).default(0),
      provider: z
        .enum(PROVIDER_VALUES)
        .optional()
        .describe("Filter by integration provider (e.g. hotmart)."),
      status: z.string().optional().describe("Filter by status (e.g. ACTIVE)."),
      search: z.string().optional().describe("Case-insensitive name search."),
    },
    wrap(async (args) => {
      const limit = args.limit as number;
      const offset = args.offset as number;
      const provider = args.provider as CommerceProvider | undefined;
      const status = args.status as string | undefined;
      const search = args.search as string | undefined;
      let path = `commerce_product_sources?workspace_id=eq.${ctx.workspaceId}${providerFilter(provider)}&select=integration_provider,external_id,external_code,synced_at,product:commerce_products!inner(*)&order=synced_at.desc.nullslast&limit=${limit}&offset=${offset}`;
      if (status) {
        path += `&product.status=eq.${encodeURIComponent(status)}`;
      }
      if (search) {
        path += `&product.name=ilike.${encodeURIComponent("%" + search + "%")}`;
      }
      const rows = await sbGet<Record<string, unknown>[]>(ctx, path);
      return textResult({
        data: (rows ?? []).map(mapProductRow),
        pagination: { limit, offset },
      });
    })
  );

  server.tool(
    "commerce_get_product",
    "Get one commerce product by local UUID or provider external id.",
    {
      product_id: z
        .string()
        .describe("Local UUID from commerce_products.id or provider external id."),
      provider: z
        .enum(PROVIDER_VALUES)
        .optional()
        .describe("Required when product_id is an external id."),
    },
    wrap(async (args) => {
      const id = args.product_id as string;
      const provider = args.provider as CommerceProvider | undefined;
      let path = `commerce_product_sources?workspace_id=eq.${ctx.workspaceId}${providerFilter(provider)}&select=integration_provider,external_id,external_code,synced_at,product:commerce_products!inner(*)&limit=1`;
      if (UUID_RE.test(id)) {
        path += `&product_id=eq.${id}`;
      } else {
        path += `&external_id=eq.${encodeURIComponent(id)}`;
      }
      const rows = await sbGet<Record<string, unknown>[]>(ctx, path);
      const row = rows?.[0];
      if (!row) {
        return textResult({ error: "Product not found" }, true);
      }
      return textResult({ data: mapProductRow(row) });
    })
  );

  server.tool(
    "commerce_list_customers",
    "List commerce customers (buyers) synced for this workspace.",
    {
      limit: z.number().min(1).max(500).default(50),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      email: z.string().optional(),
    },
    wrap(async (args) => {
      const limit = args.limit as number;
      const offset = args.offset as number;
      let path = `commerce_customers?workspace_id=eq.${ctx.workspaceId}&select=*&order=created_at.desc&limit=${limit}&offset=${offset}`;
      const email = args.email as string | undefined;
      const search = args.search as string | undefined;
      if (email) {
        path += `&email=eq.${encodeURIComponent(email.toLowerCase())}`;
      } else if (search) {
        const q = encodeURIComponent("%" + search + "%");
        path += `&or=(name.ilike.${q},email.ilike.${q})`;
      }
      const rows = await sbGet<Record<string, unknown>[]>(ctx, path);
      return textResult({ data: rows ?? [], pagination: { limit, offset } });
    })
  );

  server.tool(
    "commerce_get_customer",
    "Get a commerce customer by local UUID or email.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Local UUID (commerce_customers.id)."),
      email: z.string().optional().describe("Buyer email."),
    },
    wrap(async (args) => {
      const customerId = args.customer_id as string | undefined;
      const email = args.email as string | undefined;
      if (!customerId && !email) {
        return textResult(
          { error: "Provide customer_id or email" },
          true
        );
      }
      let path = `commerce_customers?workspace_id=eq.${ctx.workspaceId}&select=*&limit=1`;
      if (customerId) {
        path += `&id=eq.${customerId}`;
      } else if (email) {
        path += `&email=eq.${encodeURIComponent(email.toLowerCase())}`;
      }
      const rows = await sbGet<unknown[]>(ctx, path);
      const row = rows?.[0];
      if (!row) {
        return textResult({ error: "Customer not found" }, true);
      }
      return textResult({ data: row });
    })
  );

  server.tool(
    "commerce_list_sales",
    "List commerce sales synced for this workspace with optional filters.",
    {
      limit: z.number().min(1).max(500).default(50),
      offset: z.number().min(0).default(0),
      provider: z
        .enum(PROVIDER_VALUES)
        .optional()
        .describe("Filter by integration provider."),
      start_date: z.string().optional().describe("ISO date lower bound (purchase_date)."),
      end_date: z.string().optional().describe("ISO date upper bound (purchase_date)."),
      product_id: z.string().optional().describe("Local commerce_products.id UUID."),
      customer_email: z.string().optional(),
      status: z.string().optional(),
    },
    wrap(async (args) => {
      const limit = args.limit as number;
      const offset = args.offset as number;
      const provider = args.provider as CommerceProvider | undefined;
      let path = `commerce_sale_sources?workspace_id=eq.${ctx.workspaceId}${providerFilter(provider)}&select=integration_provider,external_transaction_id,external_product_id,synced_at,sale:commerce_sales!inner(*)&order=sale(purchase_date).desc.nullslast&limit=${limit}&offset=${offset}`;
      const start = args.start_date as string | undefined;
      const end = args.end_date as string | undefined;
      const productId = args.product_id as string | undefined;
      const customerEmail = args.customer_email as string | undefined;
      const status = args.status as string | undefined;
      if (start) {
        path += `&sale.purchase_date=gte.${encodeURIComponent(start)}`;
      }
      if (end) {
        path += `&sale.purchase_date=lte.${encodeURIComponent(end)}`;
      }
      if (productId) {
        path += `&sale.product_id=eq.${productId}`;
      }
      if (status) {
        path += `&sale.status=eq.${encodeURIComponent(status)}`;
      }
      if (customerEmail) {
        const cust = await sbGet<Array<{ id: string }>>(
          ctx,
          `commerce_customers?workspace_id=eq.${ctx.workspaceId}&email=eq.${encodeURIComponent(customerEmail.toLowerCase())}&select=id&limit=1`
        );
        const cid = cust?.[0]?.id;
        if (cid) {
          path += `&sale.customer_id=eq.${cid}`;
        } else {
          return textResult({ data: [], pagination: { limit, offset } });
        }
      }
      const rows = await sbGet<Record<string, unknown>[]>(ctx, path);
      return textResult({
        data: (rows ?? []).map(mapSaleRow),
        pagination: { limit, offset },
      });
    })
  );

  server.tool(
    "commerce_get_sale",
    "Get a commerce sale by provider transaction id (e.g. HP… for Hotmart).",
    {
      transaction_id: z.string(),
      provider: z
        .enum(PROVIDER_VALUES)
        .optional()
        .describe("Filter by integration provider."),
    },
    wrap(async (args) => {
      const tid = args.transaction_id as string;
      const provider = args.provider as CommerceProvider | undefined;
      const rows = await sbGet<Record<string, unknown>[]>(
        ctx,
        `commerce_sale_sources?workspace_id=eq.${ctx.workspaceId}${providerFilter(provider)}&external_transaction_id=eq.${encodeURIComponent(tid)}&select=integration_provider,external_transaction_id,external_product_id,synced_at,sale:commerce_sales!inner(*)&limit=1`
      );
      const row = rows?.[0];
      if (!row) {
        return textResult({ error: "Sale not found" }, true);
      }
      return textResult({ data: mapSaleRow(row) });
    })
  );

  server.tool(
    "commerce_list_refunds",
    "List commerce refunds synced for this workspace.",
    {
      limit: z.number().min(1).max(500).default(50),
      offset: z.number().min(0).default(0),
      provider: z
        .enum(PROVIDER_VALUES)
        .optional()
        .describe("Filter by integration provider."),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      product_id: z.string().optional().describe("Local product UUID filters via sale."),
    },
    wrap(async (args) => {
      const limit = args.limit as number;
      const offset = args.offset as number;
      const provider = args.provider as CommerceProvider | undefined;
      const productId = args.product_id as string | undefined;
      let path = `commerce_refund_sources?workspace_id=eq.${ctx.workspaceId}${providerFilter(provider)}&select=integration_provider,external_transaction_id,synced_at,refund:commerce_refunds!inner(*,sale:commerce_sales(product_id))&order=refund(refund_date).desc.nullslast&limit=${limit}&offset=${offset}`;
      const start = args.start_date as string | undefined;
      const end = args.end_date as string | undefined;
      if (start) {
        path += `&refund.refund_date=gte.${encodeURIComponent(start)}`;
      }
      if (end) {
        path += `&refund.refund_date=lte.${encodeURIComponent(end)}`;
      }
      if (productId) {
        path += `&refund.sale.product_id=eq.${productId}`;
      }
      const rows = await sbGet<Record<string, unknown>[]>(ctx, path);
      return textResult({
        data: (rows ?? []).map(mapRefundRow),
        pagination: { limit, offset },
      });
    })
  );

  server.tool(
    "commerce_trigger_sync",
    "Trigger a commerce sync (provider API → local database). Use entity=all or a single entity.",
    {
      provider: z
        .enum(PROVIDER_VALUES)
        .default(INTEGRATION_PROVIDERS.HOTMART)
        .describe("Integration provider to sync."),
      entity: z
        .enum(["all", "products", "sales", "customers", "refunds"])
        .default("all"),
    },
    wrap(async (args) => {
      const provider =
        (args.provider as CommerceProvider | undefined) ??
        INTEGRATION_PROVIDERS.HOTMART;
      const entity = args.entity as HotmartEntity | "all";

      if (provider !== INTEGRATION_PROVIDERS.HOTMART) {
        return textResult(
          { error: `Provider '${provider}' sync is not implemented yet` },
          true
        );
      }

      const token = await getHotmartAccessToken(ctx.workspaceId, ctx.env);
      if (!token) {
        return textResult(
          { error: `Could not load ${provider} credentials` },
          true
        );
      }
      const rest = {
        supabaseUrl: ctx.env.SUPABASE_URL,
        serviceRoleKey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
      };
      if (entity === "all") {
        const result = await runHotmartInitialBackfill(
          rest,
          ctx.workspaceId,
          token,
          "manual"
        );
        return textResult({
          provider,
          success: result.ok,
          errors: result.errors,
        });
      }
      const one = await syncHotmartEntity(
        rest,
        ctx.workspaceId,
        token,
        entity,
        "manual"
      );
      return textResult({
        provider,
        success: !one.error,
        sync_id: one.syncLogId,
        records_synced: one.recordsSynced,
        error: one.error,
      });
    })
  );
}
