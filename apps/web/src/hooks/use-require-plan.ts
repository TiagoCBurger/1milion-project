"use client";

import { useCallback, useState } from "react";
import { TIER_ORDER, usePlan, type Tier } from "@/hooks/use-plan";

type GatedTier = Exclude<Tier, "free">;

export function useRequirePlan(minTier: GatedTier = "pro") {
  const { tier, isLoading, organizationId } = usePlan();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const allowed = !isLoading && TIER_ORDER[tier] >= TIER_ORDER[minTier];

  const guard = useCallback(
    <Args extends unknown[]>(fn: (...a: Args) => void) =>
      (...a: Args) => {
        if (allowed) {
          fn(...a);
          return;
        }
        setPaywallOpen(true);
      },
    [allowed],
  );

  return {
    allowed,
    paywallOpen,
    setPaywallOpen,
    guard,
    organizationId,
    tier,
  };
}
