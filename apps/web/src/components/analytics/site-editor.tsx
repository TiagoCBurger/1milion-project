"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  workspaceId: string;
  siteId: string;
  pixelId: string | null;
}

export function SiteEditor({ workspaceId, siteId, pixelId }: Props) {
  const router = useRouter();
  const [pixel, setPixel] = useState(pixelId ?? "");
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  async function save() {
    setErr(null);
    setOk(false);
    const body: Record<string, unknown> = {
      pixel_id: pixel.trim() || null,
    };
    if (token.trim()) body.capi_access_token = token.trim();

    const res = await fetch(
      `/api/workspaces/${workspaceId}/analytics/sites/${siteId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErr(b?.error ?? "Erro ao salvar");
      return;
    }
    setToken("");
    setOk(true);
    startTransition(() => router.refresh());
  }

  async function clearToken() {
    setErr(null);
    setOk(false);
    const res = await fetch(
      `/api/workspaces/${workspaceId}/analytics/sites/${siteId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capi_access_token: null }),
      },
    );
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErr(b?.error ?? "Erro ao remover token");
      return;
    }
    setOk(true);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3 rounded-md border border-border/40 p-4">
      <h4 className="text-sm font-semibold">Meta Pixel + CAPI</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`pixel-${siteId}`}>Pixel ID</Label>
          <Input
            id={`pixel-${siteId}`}
            placeholder="123456789012345"
            value={pixel}
            onChange={(e) => setPixel(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`token-${siteId}`}>CAPI access token</Label>
          <Input
            id={`token-${siteId}`}
            type="password"
            placeholder="Deixe em branco para manter o atual"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={pending}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={clearToken}
          disabled={pending}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
        >
          Remover token CAPI salvo
        </button>
        <div className="flex items-center gap-3">
          {ok && <span className="text-xs text-emerald-600">Salvo</span>}
          {err && <span className="text-xs text-red-600">{err}</span>}
          <Button size="sm" onClick={save} disabled={pending}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
