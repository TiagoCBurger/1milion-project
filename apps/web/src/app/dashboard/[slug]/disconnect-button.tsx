"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Unlink } from "lucide-react";

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
        <Button
          onClick={handleDisconnect}
          disabled={loading}
          variant="destructive"
          size="sm"
        >
          {loading ? "Disconnecting..." : "Confirm Disconnect"}
        </Button>
        <Button
          onClick={() => setConfirming(false)}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={() => setConfirming(true)}
      variant="outline"
      size="sm"
      className="text-destructive hover:bg-destructive/10"
    >
      <Unlink className="mr-2 h-4 w-4" />
      Disconnect
    </Button>
  );
}
