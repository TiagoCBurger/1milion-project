"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Trash2 } from "lucide-react";
import type { SiteRow } from "@/lib/analytics/sites";
import { InstallSnippet } from "./install-snippet";
import { SiteEditor } from "./site-editor";

interface Props {
  workspaceId: string;
  sites: SiteRow[];
}

export function SitesManager({ workspaceId, sites }: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(sites.length === 0);
  const [step, setStep] = useState<"form" | "done">("form");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeBusyId, setActiveBusyId] = useState<string | null>(null);

  async function addSite(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const trimmedName = name.trim();
    const trimmedDomain = domain.trim().toLowerCase();
    if (!trimmedName || !trimmedDomain) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/analytics/sites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmedName, domain: trimmedDomain }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body?.error ?? "Erro ao adicionar site");
      return;
    }
    setStep("done");
    startTransition(() => router.refresh());
  }

  function resetForm() {
    setStep("form");
    setName("");
    setDomain("");
    setErr(null);
  }

  function closeAddPanel() {
    setAddOpen(false);
    resetForm();
  }

  function openAddPanel() {
    resetForm();
    setAddOpen(true);
  }

  async function removeSite(id: string) {
    if (!confirm("Remover este site? Os eventos passados ficam preservados.")) return;
    const res = await fetch(
      `/api/workspaces/${workspaceId}/analytics/sites/${id}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body?.error ?? "Erro ao remover site");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function setSiteActive(siteId: string, isActive: boolean) {
    setErr(null);
    setActiveBusyId(siteId);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/analytics/sites/${siteId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: isActive }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body?.error ?? "Erro ao atualizar status do site");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setActiveBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {!addOpen ? (
        <Button type="button" onClick={openAddPanel} className="w-full sm:w-auto">
          Adicionar site
        </Button>
      ) : (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
            <CardTitle className="text-xl font-semibold leading-none tracking-tight">
              {step === "form" ? "Adicionar site" : "Site adicionado!"}
            </CardTitle>
            {sites.length > 0 && step === "form" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground"
                onClick={closeAddPanel}
              >
                Cancelar
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {step === "form" ? (
              <form onSubmit={addSite} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="site-name">Nome do site</Label>
                  <Input
                    id="site-name"
                    placeholder="Meu Site"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={pending}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="domain">Domínio</Label>
                  <Input
                    id="domain"
                    placeholder="exemplo.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    disabled={pending}
                  />
                </div>
                {err && <p className="text-sm text-red-600">{err}</p>}
                <Button
                  type="submit"
                  disabled={pending || !name.trim() || !domain.trim()}
                >
                  {pending ? "Adicionando…" : "Adicionar"}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Instale o snippet abaixo no seu site e clique em &quot;Adicionar outro&quot; para cadastrar mais.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={resetForm}>
                    Adicionar outro site
                  </Button>
                  <Button type="button" variant="secondary" onClick={closeAddPanel}>
                    Fechar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {sites.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum site cadastrado ainda.</p>
      ) : (
        <div className="space-y-4">
          {sites.map((s) => (
            <Card key={s.id}>
              <Collapsible defaultOpen className="group/collapsible">
                <CardHeader className="space-y-0">
                  <div className="flex flex-row items-center gap-2 sm:gap-3">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
                        disabled={pending}
                      >
                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/collapsible:-rotate-90" />
                        <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
                          <div className="min-w-0 flex-1 text-left">
                            <CardTitle className="truncate text-base leading-tight">
                              {s.name?.trim() ? s.name.trim() : s.domain}
                            </CardTitle>
                            {s.name?.trim() &&
                            s.name.trim().toLowerCase() !== s.domain.toLowerCase() && (
                              <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground">
                                {s.domain}
                              </p>
                            )}
                          </div>
                          <Badge
                            variant={s.is_active ? "default" : "secondary"}
                            className="mt-0.5 shrink-0"
                          >
                            {s.is_active ? "ativo" : "inativo"}
                          </Badge>
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <div className="flex shrink-0 items-center">
                      <Switch
                        id={`active-${s.id}`}
                        checked={s.is_active}
                        onCheckedChange={(on) => void setSiteActive(s.id, on)}
                        disabled={pending || activeBusyId === s.id}
                        aria-label="Site ativo (ingere eventos)"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => removeSite(s.id)}
                      disabled={pending}
                      aria-label="Remover site"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <InstallSnippet publicKey={s.public_key} />
                    <SiteEditor
                      workspaceId={workspaceId}
                      siteId={s.id}
                      pixelId={s.pixel_id}
                    />
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
