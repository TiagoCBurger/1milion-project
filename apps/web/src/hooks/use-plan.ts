"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Tier = "free" | "pro" | "max" | "enterprise";

export const TIER_ORDER: Record<Tier, number> = {
  free: 0,
  pro: 1,
  max: 2,
  enterprise: 3,
};

interface PlanState {
  tier: Tier;
  isFree: boolean;
  isLoading: boolean;
  organizationId: string | null;
  pendingTier: Tier | null;
  refresh: () => Promise<void>;
}

const PlanContext = createContext<PlanState | null>(null);

function normalizeTier(value: unknown): Tier {
  if (value === "pro" || value === "max" || value === "enterprise") return value;
  return "free";
}

export function PlanProvider({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const [tier, setTier] = useState<Tier>("free");
  const [pendingTier, setPendingTier] = useState<Tier | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    try {
      const res = await fetch(
        `/api/billing/status?organization_id=${organizationId}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = await res.json();
      setTier(normalizeTier(data.subscription?.tier));
      setPendingTier(
        data.subscription?.pending_tier
          ? normalizeTier(data.subscription.pending_tier)
          : null,
      );
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<PlanState>(
    () => ({
      tier,
      isFree: tier === "free",
      isLoading,
      organizationId,
      pendingTier,
      refresh,
    }),
    [tier, isLoading, organizationId, pendingTier, refresh],
  );

  return createElement(PlanContext.Provider, { value }, children);
}

export function usePlan(): PlanState {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    throw new Error("usePlan must be used inside a <PlanProvider>.");
  }
  return ctx;
}
