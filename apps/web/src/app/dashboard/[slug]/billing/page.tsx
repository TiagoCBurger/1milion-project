"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { Check, Zap, Crown, Clock, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SubscriptionInfo {
  id: string;
  tier: string;
  status: string;
  billing_cycle: string | null;
  current_period_end: string | null;
  requests_per_hour: number;
  requests_per_day: number;
  max_mcp_connections: number;
  max_ad_accounts: number;
  pending_tier: string | null;
  pending_billing_cycle: string | null;
}

const TIER_ORDER: Record<string, number> = {
  free: 0,
  pro: 1,
  max: 2,
  enterprise: 3,
};

const PLANS = [
  {
    tier: "pro" as const,
    name: "Pro",
    monthlyPrice: 27,
    icon: Zap,
    features: [
      "1 conta de anúncios",
      "1 conexão MCP",
    ],
  },
  {
    tier: "max" as const,
    name: "Max",
    monthlyPrice: 97,
    icon: Crown,
    popular: true,
    features: [
      "5 contas de anúncios",
      "5 conexões MCP",
    ],
  },
];

export default function BillingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const supabase = createClient();

  const loadSubscription = useCallback(async () => {
    if (!workspaceId) return;
    const res = await fetch(`/api/billing/status?workspace_id=${workspaceId}`);
    if (res.ok) {
      const data = await res.json();
      setSubscription(data.subscription);
    }
  }, [workspaceId]);

  useEffect(() => {
    async function init() {
      const { data } = await supabase
        .from("workspaces")
        .select("id")
        .eq("slug", slug)
        .single();
      if (data) setWorkspaceId(data.id);
    }
    init();
  }, [slug, supabase]);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  const currentTier = subscription?.tier ?? "free";
  const hasPending = !!subscription?.pending_tier;

  async function handleCheckout(tier: "pro" | "max") {
    if (!workspaceId) return;
    setLoadingAction(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          tier,
          cycle: "monthly",
        }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleChangePlan(tier: string) {
    if (!workspaceId) return;
    setLoadingAction(`change-${tier}`);
    try {
      const res = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          tier,
          cycle: tier === "free" ? undefined : "monthly",
        }),
      });
      if (res.ok) loadSubscription();
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleCancelPending() {
    if (!workspaceId) return;
    setLoadingAction("cancel-pending");
    try {
      await fetch(`/api/billing/change-plan?workspace_id=${workspaceId}`, {
        method: "DELETE",
      });
      loadSubscription();
    } finally {
      setLoadingAction(null);
    }
  }

  function getButtonProps(planTier: string) {
    const isPending = subscription?.pending_tier === planTier;
    const isCurrent = currentTier === planTier;
    const isUpgrade = (TIER_ORDER[planTier] ?? 0) > (TIER_ORDER[currentTier] ?? 0);
    const isDowngrade = (TIER_ORDER[planTier] ?? 0) < (TIER_ORDER[currentTier] ?? 0);
    const isOnFree = currentTier === "free";

    if (isPending) {
      return { label: "Agendado", disabled: true, action: () => {} };
    }

    if (isCurrent && !hasPending) {
      return { label: "Plano atual", disabled: true, action: () => {} };
    }

    if (isCurrent && hasPending) {
      return {
        label: "Manter plano atual",
        disabled: false,
        action: () => handleCancelPending(),
      };
    }

    if (isOnFree && (planTier === "pro" || planTier === "max")) {
      return {
        label: "Assinar",
        disabled: false,
        action: () => handleCheckout(planTier as "pro" | "max"),
      };
    }

    if (hasPending) {
      return {
        label: isUpgrade ? "Mudar para este" : "Mudar para este",
        disabled: false,
        action: () => handleChangePlan(planTier),
      };
    }

    if (isUpgrade) {
      return {
        label: "Fazer upgrade",
        disabled: false,
        action: () => handleChangePlan(planTier),
      };
    }
    if (isDowngrade) {
      return {
        label: "Fazer downgrade",
        disabled: false,
        action: () => handleChangePlan(planTier),
      };
    }

    return { label: "Selecionar", disabled: false, action: () => handleChangePlan(planTier) };
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Workspaces", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Billing" },
        ]}
      />
      <div className="p-6 max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie sua assinatura e plano do workspace.
          </p>
        </div>

        {/* Current plan info */}
        {subscription && subscription.tier !== "free" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plano Atual</CardTitle>
              <CardDescription>
                {subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)} plan
                {subscription.billing_cycle
                  ? ` (${subscription.billing_cycle})`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={subscription.status === "active" ? "default" : "destructive"}>
                    {subscription.status}
                  </Badge>
                  {subscription.current_period_end && (
                    <span className="text-sm text-muted-foreground">
                      Renova em{" "}
                      {new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
              </div>

              {/* Pending change banner */}
              {subscription.pending_tier && (
                <div className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-amber-800 dark:text-amber-200">
                      {subscription.pending_tier === "free"
                        ? "Plano será cancelado ao final do período"
                        : `Mudando para ${subscription.pending_tier.charAt(0).toUpperCase() + subscription.pending_tier.slice(1)} no próximo ciclo`}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelPending}
                    disabled={loadingAction === "cancel-pending"}
                    className="h-7 px-2 text-amber-700 hover:text-amber-900"
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Desfazer
                  </Button>
                </div>
              )}

              {subscription.pending_tier !== "free" && (
                <p className="text-center pt-1">
                  <Link
                    href={`/dashboard/${slug}/subscription/cancel`}
                    className="text-xs text-muted-foreground/70 hover:text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Cancelar assinatura
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = currentTier === plan.tier;
            const isPending = subscription?.pending_tier === plan.tier;
            const btn = getButtonProps(plan.tier);

            return (
              <Card
                key={plan.tier}
                className={`relative ${
                  plan.popular ? "border-vf-lime shadow-md" : ""
                } ${isCurrent ? "ring-2 ring-vf-lime" : ""} ${
                  isPending ? "ring-2 ring-amber-400" : ""
                }`}
              >
                {plan.popular && !isPending && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-vf-lime text-vf-ink font-semibold">Popular</Badge>
                  </div>
                )}
                {isPending && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-amber-500 text-white">
                      <Clock className="h-3 w-3 mr-1" />
                      Próximo ciclo
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <plan.icon className="h-5 w-5 text-vf-ink" />
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">R${plan.monthlyPrice}</span>
                      <span className="text-muted-foreground text-sm">/mês</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full"
                    variant={plan.popular && !isCurrent ? "default" : "outline"}
                    disabled={btn.disabled || loadingAction !== null}
                    onClick={btn.action}
                  >
                    {loadingAction?.includes(plan.tier) ? "Processando..." : btn.label}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
