"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
        isEnabled ? "bg-green-500" : "bg-gray-300"
      }`}
      title={isEnabled ? "Disable account" : "Enable account"}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
          isEnabled ? "translate-x-4.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
