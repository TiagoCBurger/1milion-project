"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdAccountToggle } from "@/app/dashboard/[slug]/ad-account-toggle";

type Row = {
  id: string;
  meta_account_id: string;
  name: string;
  is_enabled: boolean;
  bmName: string;
};

export function MetaWorkspaceAdAccounts({
  organizationId,
  slug,
  canManage,
}: {
  organizationId: string;
  slug: string;
  canManage: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [maxAdAccounts, setMaxAdAccounts] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const [{ data: bms }, { data: sub }] = await Promise.all([
        supabase
          .from("business_managers")
          .select("name, ad_accounts(id, meta_account_id, name, is_enabled)")
          .eq("organization_id", organizationId),
        supabase
          .from("subscriptions")
          .select("max_ad_accounts")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const next: Row[] = (bms ?? []).flatMap((bm) => {
        const name = (bm as { name: string }).name;
        const accounts = (bm as { ad_accounts?: Array<{ id: string; meta_account_id: string; name: string; is_enabled: boolean }> }).ad_accounts ?? [];
        return accounts.map((a) => ({
          id: a.id,
          meta_account_id: a.meta_account_id,
          name: a.name,
          is_enabled: a.is_enabled,
          bmName: name,
        }));
      });

      setRows(next);
      setMaxAdAccounts(sub?.max_ad_accounts ?? 0);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const enabledCount = rows.filter((r) => r.is_enabled).length;

  const limitLabel =
    maxAdAccounts === null || maxAdAccounts === undefined
      ? "—"
      : maxAdAccounts === -1
        ? "ilimitado (Enterprise)"
        : String(maxAdAccounts);

  if (loading) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Contas de anúncio nesta organização</CardTitle>
          <CardDescription>Carregando…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Contas de anúncio nesta organização</CardTitle>
          <CardDescription>
            Nenhuma conta sincronizada. Desconecte e reconecte o Facebook se você esperava ver contas
            aqui — ou confirme que sua conta tem acesso a algum Business Manager com contas de anúncio.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Contas de anúncio nesta organização</CardTitle>
        <CardDescription>
          O dashboard, as estatísticas e o MCP usam apenas as contas{" "}
          <strong className="font-semibold text-foreground">ativas</strong> abaixo. Limite do plano:{" "}
          {limitLabel} conta(s) ativa(s) simultâneas
          {maxAdAccounts !== -1 && maxAdAccounts !== null && maxAdAccounts > 0 ? (
            <span className="font-medium tabular-nums text-foreground">
              {" "}
              ({enabledCount}/{maxAdAccounts} em uso)
            </span>
          ) : null}
          .{" "}
          <Link
            href={`/dashboard/${slug}/billing`}
            className="font-semibold text-foreground underline underline-offset-4 decoration-primary decoration-2 hover:decoration-primary/80"
          >
            Ver plano
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/40 rounded-xl border border-border/40">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {r.meta_account_id} · {r.bmName}
                </p>
              </div>
              {canManage ? (
                <AdAccountToggle
                  organizationId={organizationId}
                  accountId={r.id}
                  enabled={r.is_enabled}
                  onApplied={(next) => {
                    setRows((prev) =>
                      prev.map((x) => (x.id === r.id ? { ...x, is_enabled: next } : x))
                    );
                  }}
                />
              ) : (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {r.is_enabled ? "Ativa" : "Inativa"}
                </span>
              )}
            </li>
          ))}
        </ul>
        {!canManage ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Somente proprietários ou administradores podem ativar ou desativar contas.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
