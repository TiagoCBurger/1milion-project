"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";

interface Props {
  organizationId: string;
  accountId: string;
  enabled: boolean;
  onApplied?: (isEnabled: boolean) => void;
}

export function AdAccountToggle({ organizationId, accountId, enabled, onApplied }: Props) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsEnabled(enabled);
  }, [enabled]);

  async function handleToggle() {
    setLoading(true);
    const next = !isEnabled;
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/ad-accounts/${accountId}/toggle`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_enabled: next }),
        }
      );
      if (res.ok) {
        setIsEnabled(next);
        onApplied?.(next);
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
      onCheckedChange={() => void handleToggle()}
      disabled={loading}
      aria-label={isEnabled ? "Desativar conta" : "Ativar conta"}
    />
  );
}
