"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { Check, Zap, Crown, Building2, Mail, Clock, X } from "lucide-react";
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
    tier: "free" as const,
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    icon: Check,
    features: [
      "20 requests/hour",
      "20 requests/day",
      "1 API key",
      "1 MCP connection",
      "Read-only tools",
    ],
  },
  {
    tier: "pro" as const,
    name: "Pro",
    monthlyPrice: 37,
    annualPrice: 355,
    icon: Zap,
    features: [
      "200 requests/hour",
      "1,000 requests/day",
      "5 API keys",
      "3 MCP connections",
      "All tools (read + write)",
      "50 images/day, 10 videos/day",
    ],
  },
  {
    tier: "max" as const,
    name: "Max",
    monthlyPrice: 97,
    annualPrice: 931,
    icon: Crown,
    popular: true,
    features: [
      "500 requests/hour",
      "5,000 requests/day",
      "10 API keys",
      "Unlimited MCP connections",
      "All tools (read + write)",
      "200 images/day, 50 videos/day",
    ],
  },
  {
    tier: "enterprise" as const,
    name: "Enterprise",
    monthlyPrice: null,
    annualPrice: null,
    icon: Building2,
    features: [
      "Custom rate limits",
      "Custom API keys",
      "Unlimited MCP connections",
      "All tools (read + write)",
      "Custom upload limits",
      "Dedicated support & SLA",
    ],
  },
];

export default function BillingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [isAnnual, setIsAnnual] = useState(false);
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

  // First subscription (from free) → goes through checkout
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
          cycle: isAnnual ? "annually" : "monthly",
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

  // Change plan (from paid → different paid or free) → scheduled for next cycle
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
          cycle: tier === "free" ? undefined : isAnnual ? "annually" : "monthly",
        }),
      });
      if (res.ok) loadSubscription();
    } finally {
      setLoadingAction(null);
    }
  }

  // Cancel pending change
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

  // Cancel subscription → schedules downgrade to free
  async function handleCancel() {
    if (!workspaceId || !confirm("Are you sure? Your plan will downgrade to Free at the end of the current period.")) return;
    setLoadingAction("cancel");
    try {
      await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
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
      return { label: "Scheduled", disabled: true, action: () => {} };
    }
    if (isCurrent) {
      return { label: "Current plan", disabled: true, action: () => {} };
    }
    if (hasPending) {
      return { label: "Change pending", disabled: true, action: () => {} };
    }

    // From free → checkout (immediate, needs payment)
    if (isOnFree && (planTier === "pro" || planTier === "max")) {
      return {
        label: "Subscribe",
        disabled: false,
        action: () => handleCheckout(planTier as "pro" | "max"),
      };
    }

    // From paid → different plan (scheduled for next cycle)
    if (isUpgrade) {
      return {
        label: "Upgrade at next cycle",
        disabled: false,
        action: () => handleChangePlan(planTier),
      };
    }
    if (isDowngrade) {
      return {
        label: planTier === "free" ? "Cancel plan" : "Downgrade at next cycle",
        disabled: false,
        action: () => (planTier === "free" ? handleCancel() : handleChangePlan(planTier)),
      };
    }

    return { label: "Select", disabled: false, action: () => handleChangePlan(planTier) };
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
      <div className="p-6 max-w-5xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-muted-foreground mt-1">
            Manage your workspace subscription and plan.
          </p>
        </div>

        {/* Current plan info */}
        {subscription && subscription.tier !== "free" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current Plan</CardTitle>
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
                      Renews{" "}
                      {new Date(subscription.current_period_end).toLocaleDateString()}
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
                        ? "Plan will be cancelled at end of period"
                        : `Changing to ${subscription.pending_tier.charAt(0).toUpperCase() + subscription.pending_tier.slice(1)}${subscription.pending_billing_cycle ? ` (${subscription.pending_billing_cycle})` : ""} at next cycle`}
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
                    Undo
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Billing cycle toggle */}
        <div className="flex items-center justify-center gap-3">
          <span
            className={`text-sm ${!isAnnual ? "font-semibold" : "text-muted-foreground"}`}
          >
            Monthly
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isAnnual ? "bg-violet-brand" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isAnnual ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-sm ${isAnnual ? "font-semibold" : "text-muted-foreground"}`}
          >
            Annual
            <Badge variant="secondary" className="ml-2 text-xs">
              Save ~20%
            </Badge>
          </span>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = currentTier === plan.tier;
            const isPending = subscription?.pending_tier === plan.tier;
            const price = plan.monthlyPrice !== null
              ? isAnnual
                ? Math.round(plan.annualPrice! / 12)
                : plan.monthlyPrice
              : null;

            const btn = getButtonProps(plan.tier);

            return (
              <Card
                key={plan.tier}
                className={`relative ${
                  plan.popular ? "border-violet-brand shadow-md" : ""
                } ${isCurrent ? "ring-2 ring-violet-brand" : ""} ${
                  isPending ? "ring-2 ring-amber-400" : ""
                }`}
              >
                {plan.popular && !isPending && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-violet-brand text-white">Popular</Badge>
                  </div>
                )}
                {isPending && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-amber-500 text-white">
                      <Clock className="h-3 w-3 mr-1" />
                      Next cycle
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <plan.icon className="h-5 w-5 text-violet-brand" />
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                  </div>
                  <div className="mt-2">
                    {price !== null ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold">R${price}</span>
                        <span className="text-muted-foreground text-sm">/month</span>
                      </div>
                    ) : (
                      <span className="text-lg font-semibold text-muted-foreground">
                        Custom
                      </span>
                    )}
                    {isAnnual && plan.annualPrice !== null && plan.annualPrice > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        R${plan.annualPrice}/year
                      </p>
                    )}
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

                  {plan.tier === "enterprise" ? (
                    <Button variant="outline" className="w-full" asChild>
                      <a href="mailto:contato@vibefly.io">
                        <Mail className="mr-2 h-4 w-4" />
                        Contact Sales
                      </a>
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={plan.popular && !isCurrent ? "default" : "outline"}
                      disabled={btn.disabled || loadingAction !== null}
                      onClick={btn.action}
                    >
                      {loadingAction?.includes(plan.tier) ? "Processing..." : btn.label}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
