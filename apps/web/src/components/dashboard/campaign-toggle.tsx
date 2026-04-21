"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  ARCHIVED: "Arquivada",
  DELETED: "Excluída",
  PENDING_REVIEW: "Em análise",
  DISAPPROVED: "Reprovada",
  WITH_ISSUES: "Com problemas",
};

export function CampaignToggle({
  organizationId,
  campaignId,
  status,
  disabled,
}: {
  organizationId: string;
  campaignId: string;
  status: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<"ACTIVE" | "PAUSED" | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canToggle = status === "ACTIVE" || status === "PAUSED";
  const effective = optimistic ?? status;
  const checked = effective === "ACTIVE";

  if (!canToggle) {
    return (
      <span
        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        title={statusLabel[status] ?? status}
      >
        {statusLabel[status] ?? status}
      </span>
    );
  }

  async function handleToggle(next: boolean) {
    const nextStatus = next ? "ACTIVE" : "PAUSED";
    setOptimistic(nextStatus);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/meta/campaigns/${campaignId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      if (!res.ok) {
        setOptimistic(null);
      } else {
        startTransition(() => router.refresh());
      }
    } catch {
      setOptimistic(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2" title={checked ? "Ativa" : "Pausada"}>
      <Switch
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={disabled || loading || isPending}
        aria-label={checked ? "Pausar campanha" : "Ativar campanha"}
      />
      {loading || isPending ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
