"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { PlanCards } from "@/components/billing/plan-cards";
import { TIER_ORDER, usePlan, type Tier } from "@/hooks/use-plan";

export function PlanGate({
  minTier = "pro",
  reason,
  children,
}: {
  minTier?: Exclude<Tier, "free">;
  reason?: string;
  children: ReactNode;
}) {
  const { slug } = useParams<{ slug: string }>();
  const { tier, pendingTier, organizationId, isLoading } = usePlan();
  const blocked =
    !isLoading && TIER_ORDER[tier] < TIER_ORDER[minTier];

  if (!blocked) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        className="pointer-events-none select-none blur-sm"
        aria-hidden="true"
      >
        {children}
      </div>

      <div className="fixed inset-y-0 left-0 right-0 md:left-64 z-30 flex items-start justify-center overflow-y-auto bg-background/40 backdrop-blur-md px-4 py-16">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Desbloqueie com Pro ou Max"
          className="w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-[0_8px_40px_rgba(0,0,0,0.12)] space-y-4"
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-vf-lime" />
              <h2 className="text-lg font-semibold leading-none tracking-tight">
                Desbloqueie isso com Pro ou Max
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {reason ??
                "Esta área está disponível nos planos pagos. Escolha um plano e comece agora."}
            </p>
          </div>

          {organizationId ? (
            <PlanCards
              organizationId={organizationId}
              subscription={{ tier, pending_tier: pendingTier }}
            />
          ) : null}

          {slug ? (
            <p className="text-center pt-1">
              <Link
                href={`/dashboard/${slug}/billing`}
                className="text-xs text-muted-foreground/70 hover:text-muted-foreground underline-offset-4 hover:underline"
              >
                Ver todos os detalhes
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
