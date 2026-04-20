"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SubscriptionCancelPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [organizationId, setWorkspaceId] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [pendingTier, setPendingTier] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const billingHref = `/dashboard/${slug}/billing`;

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", slug)
        .single();
      if (cancelled) return;
      if (!data?.id) {
        router.replace("/dashboard");
        return;
      }
      setWorkspaceId(data.id);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [slug, supabase, router]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/billing/status?organization_id=${organizationId}`);
      if (cancelled) return;
      if (!res.ok) {
        router.replace(billingHref);
        return;
      }
      const data = await res.json();
      const sub = data.subscription;
      if (!sub || sub.tier === "free") {
        router.replace(billingHref);
        return;
      }
      setTier(sub.tier);
      setPendingTier(sub.pending_tier ?? null);
      setResolved(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [organizationId, router, billingHref]);

  async function handleConfirm() {
    if (!organizationId || !confirm("Tem certeza? Seu plano será cancelado ao final do período atual.")) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      if (res.ok) {
        router.push(billingHref);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!resolved || !tier) {
    return null;
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Workspaces", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Billing", href: billingHref },
          { label: "Cancelar assinatura" },
        ]}
      />
      <div className="p-6 max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cancelar assinatura</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Você continua com acesso até o fim do período já pago. Depois disso o workspace volta para o plano
            Free.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plano {tier.charAt(0).toUpperCase() + tier.slice(1)}</CardTitle>
            <CardDescription>
              {pendingTier === "free"
                ? "Já há um cancelamento agendado para este workspace."
                : "Confirme se deseja agendar o cancelamento."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {pendingTier === "free" ? (
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href={billingHref}>Voltar ao billing</Link>
              </Button>
            ) : (
              <>
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto"
                  disabled={submitting}
                  onClick={handleConfirm}
                >
                  {submitting ? "Processando..." : "Confirmar cancelamento"}
                </Button>
                <Button asChild variant="ghost" className="w-full sm:w-auto text-muted-foreground">
                  <Link href={billingHref}>Voltar sem cancelar</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
