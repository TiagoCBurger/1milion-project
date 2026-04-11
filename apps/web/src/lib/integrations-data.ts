import type { SupabaseClient } from "@supabase/supabase-js";

import type { IntegrationSource } from "@/components/dashboard/source-badge";

const PAGE_SIZE = 25;

export type ListResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

async function hotmartActive(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("hotmart_credentials")
    .select("is_active")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return data?.is_active === true;
}

export async function hasCommerceIntegration(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<boolean> {
  return hotmartActive(supabase, workspaceId);
}

export type ProductRow = {
  id: string;
  name: string | null;
  code: string;
  status: string | null;
  price: string | null;
  createdAt: string;
  source: IntegrationSource;
};

export async function listProducts(
  supabase: SupabaseClient,
  workspaceId: string,
  page: number
): Promise<ListResult<ProductRow>> {
  const from = (Math.max(1, page) - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { count, data, error } = await supabase
    .from("hotmart_products")
    .select("id, name, ucode, hotmart_id, status, price_value, price_currency, created_at", {
      count: "exact",
    })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("[integrations-data] listProducts", error.message);
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
  }

  const rows: ProductRow[] = (data ?? []).map((r) => {
    const ucode = r.ucode;
    const hid = r.hotmart_id;
    const code =
      typeof ucode === "string" && ucode.length > 0
        ? ucode
        : hid != null
          ? String(hid)
          : "—";
    let price: string | null = null;
    if (r.price_value != null) {
      const cur = (r.price_currency as string | null) ?? "";
      price = cur ? `${Number(r.price_value).toLocaleString("pt-BR")} ${cur}` : String(r.price_value);
    }
    return {
      id: r.id,
      name: r.name,
      code,
      status: r.status,
      price,
      createdAt: r.created_at,
      source: "hotmart" as const,
    };
  });

  return { rows, total: count ?? rows.length, page, pageSize: PAGE_SIZE };
}

export type CustomerRow = {
  id: string;
  name: string | null;
  email: string;
  doc: string | null;
  lastOrderAt: string | null;
  totalSpent: string | null;
  source: IntegrationSource;
};

export async function listCustomers(
  supabase: SupabaseClient,
  workspaceId: string,
  page: number
): Promise<ListResult<CustomerRow>> {
  const from = (Math.max(1, page) - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { count, data, error } = await supabase
    .from("hotmart_customers")
    .select("id, name, email, doc, created_at", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("[integrations-data] listCustomers", error.message);
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
  }

  const customers = data ?? [];
  const ids = customers.map((c) => c.id);
  const stats = new Map<
    string,
    { last: string | null; sum: number; currency: string | null }
  >();

  if (ids.length > 0) {
    const { data: salesRows } = await supabase
      .from("hotmart_sales")
      .select("customer_id, purchase_date, amount, currency")
      .eq("workspace_id", workspaceId)
      .in("customer_id", ids);

    for (const s of salesRows ?? []) {
      const cid = s.customer_id as string | null;
      if (!cid) continue;
      const amt = s.amount != null ? Number(s.amount) : 0;
      const cur = (s.currency as string | null) ?? null;
      const pd = s.purchase_date as string | null;
      const prev = stats.get(cid);
      if (!prev) {
        stats.set(cid, { last: pd, sum: amt, currency: cur });
      } else {
        const nextSum = prev.sum + amt;
        let nextLast = prev.last;
        if (pd && (!nextLast || new Date(pd) > new Date(nextLast))) nextLast = pd;
        stats.set(cid, { last: nextLast, sum: nextSum, currency: cur ?? prev.currency });
      }
    }
  }

  const rows: CustomerRow[] = customers.map((c) => {
    const st = stats.get(c.id);
    let totalSpent: string | null = null;
    if (st && st.sum > 0) {
      totalSpent = st.currency
        ? `${st.sum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ${st.currency}`
        : st.sum.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    }
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      doc: c.doc,
      lastOrderAt: st?.last ?? null,
      totalSpent,
      source: "hotmart" as const,
    };
  });

  return { rows, total: count ?? rows.length, page, pageSize: PAGE_SIZE };
}

export type SaleRow = {
  id: string;
  transactionId: string;
  productName: string;
  customerLabel: string;
  amount: string | null;
  status: string;
  date: string | null;
  source: IntegrationSource;
};

export async function listSales(
  supabase: SupabaseClient,
  workspaceId: string,
  page: number
): Promise<ListResult<SaleRow>> {
  const from = (Math.max(1, page) - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { count, data, error } = await supabase
    .from("hotmart_sales")
    .select("id, transaction_id, status, amount, currency, purchase_date, product_id, customer_id", {
      count: "exact",
    })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("[integrations-data] listSales", error.message);
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
  }

  const sales = data ?? [];
  const productIds = [...new Set(sales.map((r) => r.product_id).filter(Boolean))] as string[];
  const customerIds = [...new Set(sales.map((r) => r.customer_id).filter(Boolean))] as string[];

  const productNames = new Map<string, string | null>();
  if (productIds.length > 0) {
    const { data: prows } = await supabase
      .from("hotmart_products")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("id", productIds);
    for (const p of prows ?? []) {
      productNames.set(p.id, p.name);
    }
  }

  const customerLabels = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: crows } = await supabase
      .from("hotmart_customers")
      .select("id, name, email")
      .eq("workspace_id", workspaceId)
      .in("id", customerIds);
    for (const c of crows ?? []) {
      const label = [c.name, c.email].filter(Boolean).join(" · ") || c.email;
      customerLabels.set(c.id, label);
    }
  }

  const rows: SaleRow[] = sales.map((r) => {
    const productName =
      r.product_id && productNames.has(r.product_id)
        ? (productNames.get(r.product_id) ?? "—")
        : "—";
    const customerLabel =
      r.customer_id && customerLabels.has(r.customer_id)
        ? customerLabels.get(r.customer_id)!
        : "—";
    let amount: string | null = null;
    if (r.amount != null) {
      const cur = (r.currency as string | null) ?? "";
      amount = cur
        ? `${Number(r.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ${cur}`
        : String(r.amount);
    }
    return {
      id: r.id,
      transactionId: r.transaction_id,
      productName: productName || "—",
      customerLabel,
      amount,
      status: r.status,
      date: r.purchase_date,
      source: "hotmart" as const,
    };
  });

  return { rows, total: count ?? rows.length, page, pageSize: PAGE_SIZE };
}
