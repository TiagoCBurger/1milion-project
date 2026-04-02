"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { Check, Zap, Crown, Building2, Mail } from "lucide-react";
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
}

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
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
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

  async function handleCheckout(tier: "pro" | "max") {
    if (!workspaceId) return;
    setLoadingTier(tier);
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
      setLoadingTier(null);
    }
  }

  async function handleCancel() {
    if (!workspaceId || !confirm("Are you sure you want to cancel your subscription?")) return;
    await fetch("/api/billing/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: workspaceId }),
    });
    loadSubscription();
  }

  const currentTier = subscription?.tier ?? "free";

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
            <CardContent className="flex items-center justify-between">
              <div className="space-y-1">
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
              {subscription.status === "active" && (
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Cancel plan
                </Button>
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
            const price = plan.monthlyPrice !== null
              ? isAnnual
                ? Math.round(plan.annualPrice! / 12)
                : plan.monthlyPrice
              : null;

            return (
              <Card
                key={plan.tier}
                className={`relative ${
                  plan.popular
                    ? "border-violet-brand shadow-md"
                    : ""
                } ${isCurrent ? "ring-2 ring-violet-brand" : ""}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-violet-brand text-white">
                      Popular
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
                        <span className="text-3xl font-bold">
                          R${price}
                        </span>
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
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm"
                      >
                        <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {plan.tier === "free" && (
                    <Button variant="outline" className="w-full" disabled={isCurrent}>
                      {isCurrent ? "Current plan" : "Downgrade"}
                    </Button>
                  )}
                  {(plan.tier === "pro" || plan.tier === "max") && (
                    <Button
                      className="w-full"
                      variant={plan.popular ? "default" : "outline"}
                      disabled={isCurrent || loadingTier !== null}
                      onClick={() => handleCheckout(plan.tier as "pro" | "max")}
                    >
                      {isCurrent
                        ? "Current plan"
                        : loadingTier === plan.tier
                          ? "Redirecting..."
                          : "Upgrade"}
                    </Button>
                  )}
                  {plan.tier === "enterprise" && (
                    <Button variant="outline" className="w-full" asChild>
                      <a href="mailto:contato@vibefly.io">
                        <Mail className="mr-2 h-4 w-4" />
                        Contact Sales
                      </a>
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
