"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlanCards } from "@/components/billing/plan-cards";
import { usePlan } from "@/hooks/use-plan";

export function UpgradePaywallDialog({
  open,
  onOpenChange,
  reason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: string;
}) {
  const { slug } = useParams<{ slug: string }>();
  const { tier, pendingTier, organizationId } = usePlan();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-vf-lime" />
            Desbloqueie isso com Pro ou Max
          </DialogTitle>
          <DialogDescription>
            {reason ??
              "Esta ação está disponível nos planos pagos. Escolha um plano e ative na hora."}
          </DialogDescription>
        </DialogHeader>

        {organizationId ? (
          <div className="pt-2">
            <PlanCards
              organizationId={organizationId}
              subscription={{ tier, pending_tier: pendingTier }}
            />
          </div>
        ) : null}

        {slug ? (
          <p className="text-center pt-1">
            <Link
              href={`/dashboard/${slug}/billing`}
              className="text-xs text-muted-foreground/70 hover:text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Ver todos os detalhes
            </Link>
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
