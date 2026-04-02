"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";

interface Props {
  workspaceId: string;
  accountId: string;
  enabled: boolean;
}

export function AdAccountToggle({ workspaceId, accountId, enabled }: Props) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleToggle() {
    setLoading(true);
    const next = !isEnabled;
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/ad-accounts/${accountId}/toggle`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_enabled: next }),
        }
      );
      if (res.ok) {
        setIsEnabled(next);
        router.refresh();
      }
    } catch {
      // keep current state
    } finally {
      setLoading(false);
    }
  }

  return (
    <Switch
      checked={isEnabled}
      onCheckedChange={handleToggle}
      disabled={loading}
      aria-label={isEnabled ? "Disable account" : "Enable account"}
    />
  );
}
