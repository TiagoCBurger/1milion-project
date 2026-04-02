"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  workspaceId: string;
  slug: string;
}

export function DisconnectButton({ workspaceId, slug }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDisconnect() {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/disconnect`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // silently fail, page will show current state
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex gap-2">
        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50 transition"
        >
          {loading ? "Disconnecting..." : "Confirm"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition"
    >
      Disconnect
    </button>
  );
}
