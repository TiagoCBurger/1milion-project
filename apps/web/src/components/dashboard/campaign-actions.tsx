"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CampaignActions({
  workspaceId,
  campaignId,
  currentStatus,
}: {
  workspaceId: string;
  campaignId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const canToggle = currentStatus === "ACTIVE" || currentStatus === "PAUSED";
  const nextStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";

  async function handleToggle() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/meta/campaigns/${campaignId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (!canToggle) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      disabled={loading}
      title={nextStatus === "PAUSED" ? "Pause" : "Resume"}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : nextStatus === "PAUSED" ? (
        <Pause className="h-4 w-4" />
      ) : (
        <Play className="h-4 w-4" />
      )}
    </Button>
  );
}
