"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { Clock, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlanCards } from "@/components/billing/plan-cards";
import { usePlan, type Tier } from "@/hooks/use-plan";

interface SubscriptionInfo {
  id: string;
  tier: Tier;
  status: string;
  billing_cycle: string | null;
  current_period_end: string | null;
  requests_per_hour: number;
  requests_per_day: number;
  max_mcp_connections: number;
  max_ad_accounts: number;
  pending_tier: Tier | null;
  pending_billing_cycle: string | null;
}

export default function BillingPage() {
  const { slug } = useParams<{ slug: string }>();
  const { refresh: refreshPlan } = usePlan();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [organizationId, setWorkspaceId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const supabase = createClient();

  const loadSubscription = useCallback(async () => {
    if (!organizationId) return;
    const res = await fetch(`/api/billing/status?organization_id=${organizationId}`);
    if (res.ok) {
      const data = await res.json();
      setSubscription(data.subscription);
    }
  }, [organizationId]);

  useEffect(() => {
    async function init() {
      const { data } = await supabase
        .from("organizations")
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

  const reloadAll = useCallback(async () => {
    await loadSubscription();
    await refreshPlan();
  }, [loadSubscription, refreshPlan]);

  async function handleCancelPending() {
    if (!organizationId) return;
    setCancelling(true);
    try {
      await fetch(`/api/billing/change-plan?organization_id=${organizationId}`, {
        method: "DELETE",
      });
      await reloadAll();
    } finally {
      setCancelling(false);
    }
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
                    disabled={cancelling}
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
        {organizationId && subscription && (
          <PlanCards
            organizationId={organizationId}
            subscription={{
              tier: subscription.tier,
              pending_tier: subscription.pending_tier,
            }}
            onAfterChange={reloadAll}
          />
        )}
      </div>
    </>
  );
}
