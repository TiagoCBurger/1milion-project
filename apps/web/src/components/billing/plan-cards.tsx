"use client";

import { useState } from "react";
import { Check, Zap, Crown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TIER_ORDER, type Tier } from "@/hooks/use-plan";

export type GatedTier = "pro" | "max";

export interface SubscriptionLike {
  tier: Tier;
  pending_tier: Tier | null;
}

export const PLANS = [
  {
    tier: "pro" as const,
    name: "Pro",
    monthlyPrice: 27,
    icon: Zap,
    features: ["1 conta de anúncios", "1 conexão MCP"],
    popular: false,
  },
  {
    tier: "max" as const,
    name: "Max",
    monthlyPrice: 97,
    icon: Crown,
    features: ["5 contas de anúncios", "5 conexões MCP"],
    popular: true,
  },
];

export function PlanCards({
  organizationId,
  subscription,
  onAfterChange,
}: {
  organizationId: string;
  subscription: SubscriptionLike;
  onAfterChange?: () => void | Promise<void>;
}) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const currentTier = subscription.tier;
  const hasPending = !!subscription.pending_tier;

  async function handleCheckout(tier: GatedTier) {
    setLoadingAction(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
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
    setLoadingAction(`change-${tier}`);
    try {
      const res = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          tier,
          cycle: tier === "free" ? undefined : "monthly",
        }),
      });
      if (res.ok) await onAfterChange?.();
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleCancelPending() {
    setLoadingAction("cancel-pending");
    try {
      await fetch(
        `/api/billing/change-plan?organization_id=${organizationId}`,
        { method: "DELETE" },
      );
      await onAfterChange?.();
    } finally {
      setLoadingAction(null);
    }
  }

  function getButtonProps(planTier: Tier) {
    const isPending = subscription.pending_tier === planTier;
    const isCurrent = currentTier === planTier;
    const isUpgrade = TIER_ORDER[planTier] > TIER_ORDER[currentTier];
    const isDowngrade = TIER_ORDER[planTier] < TIER_ORDER[currentTier];
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
        action: () => handleCheckout(planTier),
      };
    }
    if (hasPending) {
      return {
        label: "Mudar para este",
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
    return {
      label: "Selecionar",
      disabled: false,
      action: () => handleChangePlan(planTier),
    };
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {PLANS.map((plan) => {
        const isCurrent = currentTier === plan.tier;
        const isPending = subscription.pending_tier === plan.tier;
        const btn = getButtonProps(plan.tier);

        return (
          <Card
            key={plan.tier}
            className={`relative ${plan.popular ? "border-vf-lime shadow-md" : ""} ${
              isCurrent ? "ring-2 ring-vf-lime" : ""
            } ${isPending ? "ring-2 ring-amber-400" : ""}`}
          >
            {plan.popular && !isPending && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-vf-lime text-vf-ink font-semibold">
                  Popular
                </Badge>
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
  );
}
