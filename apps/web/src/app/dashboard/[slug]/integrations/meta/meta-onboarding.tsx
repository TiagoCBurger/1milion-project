"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Account = {
  id: string;
  meta_account_id: string;
  name: string;
  is_enabled: boolean;
  project_id: string;
  bmName: string;
};

type Project = {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
};

type Step = "activate" | "assign" | "done";

export function MetaOnboarding({
  organizationId,
  slug,
  metaUserName,
  apiKey,
  onComplete,
}: {
  organizationId: string;
  slug: string;
  metaUserName: string;
  apiKey?: string;
  onComplete: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("activate");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [maxAdAccounts, setMaxAdAccounts] = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const [{ data: bms }, { data: sub }, { data: projs }] = await Promise.all([
        supabase
          .from("business_managers")
          .select("name, ad_accounts(id, meta_account_id, name, is_enabled, project_id)")
          .eq("organization_id", organizationId),
        supabase
          .from("subscriptions")
          .select("max_ad_accounts")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .maybeSingle(),
        supabase
          .from("projects")
          .select("id, name, slug, is_default")
          .eq("organization_id", organizationId)
          .order("is_default", { ascending: false })
          .order("name"),
      ]);

      if (cancelled) return;

      type RawAccount = Omit<Account, "bmName">;
      const rows: Account[] = (bms ?? []).flatMap((bm) => {
        const name = (bm as { name: string }).name;
        const accs = (bm as { ad_accounts?: RawAccount[] }).ad_accounts ?? [];
        return accs.map((a) => ({ ...a, bmName: name }));
      });

      setAccounts(rows);
      setProjects(projs ?? []);
      setMaxAdAccounts(sub?.max_ad_accounts ?? 0);
      setSelectedIds(new Set(rows.filter((a) => a.is_enabled).map((a) => a.id)));
      setAssignments(Object.fromEntries(rows.map((a) => [a.id, a.project_id])));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const selectedCount = selectedIds.size;
  const overLimit = maxAdAccounts !== -1 && selectedCount > maxAdAccounts;
  const limitLabel = maxAdAccounts === -1 ? "ilimitado" : String(maxAdAccounts);

  const selectedAccounts = useMemo(
    () => accounts.filter((a) => selectedIds.has(a.id)),
    [accounts, selectedIds]
  );

  const hasMultipleProjects = projects.length > 1;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitActivation() {
    if (overLimit) {
      setError(
        `Seu plano permite ${limitLabel} conta(s) ativa(s). Desmarque ${selectedCount - maxAdAccounts} para continuar ou faça upgrade do plano.`
      );
      return;
    }
    setSaving(true);
    setError(null);

    const changes = accounts
      .filter((a) => a.is_enabled !== selectedIds.has(a.id))
      .map((a) => ({ id: a.id, next: selectedIds.has(a.id) }));

    const enablingFirst = [...changes].sort((a, b) => Number(b.next) - Number(a.next));

    for (const c of enablingFirst) {
      const res = await fetch(
        `/api/organizations/${organizationId}/ad-accounts/${c.id}/toggle`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_enabled: c.next }),
        }
      );
      if (!res.ok) {
        const { error: msg } = (await res.json().catch(() => ({}))) as { error?: string };
        setError(msg ?? "Falha ao atualizar contas.");
        setSaving(false);
        return;
      }
    }

    setAccounts((prev) =>
      prev.map((a) => ({ ...a, is_enabled: selectedIds.has(a.id) }))
    );
    setSaving(false);

    if (selectedCount === 0 || !hasMultipleProjects) {
      setStep("done");
    } else {
      setStep("assign");
    }
  }

  async function submitAssignments() {
    setSaving(true);
    setError(null);

    const moves = selectedAccounts
      .filter((a) => assignments[a.id] && assignments[a.id] !== a.project_id)
      .reduce<Record<string, string[]>>((acc, a) => {
        const target = assignments[a.id];
        (acc[target] ??= []).push(a.id);
        return acc;
      }, {});

    for (const [projectId, ids] of Object.entries(moves)) {
      const res = await fetch(
        `/api/organizations/${organizationId}/projects/${projectId}/ad-accounts`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_ids: ids }),
        }
      );
      if (!res.ok && res.status !== 207) {
        const { error: msg } = (await res.json().catch(() => ({}))) as { error?: string };
        setError(msg ?? "Falha ao atribuir contas a projetos.");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setStep("done");
  }

  function finish() {
    onComplete();
    router.push(`/dashboard/${slug}`);
    router.refresh();
  }

  async function copyApiKey() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preparando sua conta…</CardTitle>
          <CardDescription>Sincronizando contas de anúncio com a Meta.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <StepDot active={step === "activate"} done={step !== "activate"} label="1. Ativar" />
        <ChevronRight className="h-3 w-3" />
        <StepDot
          active={step === "assign"}
          done={step === "done"}
          label="2. Atribuir"
          muted={!hasMultipleProjects}
        />
        <ChevronRight className="h-3 w-3" />
        <StepDot active={step === "done"} done={false} label="3. Pronto" />
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {step === "activate" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <CardTitle>Bem-vindo, {metaUserName}</CardTitle>
            </div>
            <CardDescription>
              Escolha quais contas de anúncio ficarão ativas nesta organização. O dashboard, relatórios e
              o MCP usam apenas contas ativas. Limite do plano: {limitLabel} contas.{" "}
              <Link
                href={`/dashboard/${slug}/billing`}
                className="font-semibold text-foreground underline underline-offset-4"
              >
                Ver plano
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma conta de anúncio foi sincronizada. Reconecte o Facebook se você esperava ver contas
                aqui.
              </p>
            ) : (
              <ul className="divide-y divide-border/40 rounded-xl border border-border/40">
                {accounts.map((a) => {
                  const checked = selectedIds.has(a.id);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {a.meta_account_id} · {a.bmName}
                        </p>
                      </div>
                      <Switch
                        checked={checked}
                        onCheckedChange={() => toggleSelect(a.id)}
                        aria-label={`Ativar ${a.name}`}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex items-center justify-between">
              <p className={`text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
                {selectedCount} de {limitLabel} selecionada(s)
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setStep("done")} disabled={saving}>
                  Pular
                </Button>
                <Button onClick={submitActivation} disabled={saving || overLimit}>
                  {saving ? "Salvando…" : hasMultipleProjects && selectedCount > 0 ? "Continuar" : "Concluir"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "assign" && (
        <Card>
          <CardHeader>
            <CardTitle>Atribua cada conta a um projeto</CardTitle>
            <CardDescription>
              Projetos separam contas de anúncio e sites — útil para clientes, marcas ou ambientes
              distintos. Você pode mover contas depois em Configurações do projeto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y divide-border/40 rounded-xl border border-border/40">
              {selectedAccounts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {a.meta_account_id} · {a.bmName}
                    </p>
                  </div>
                  <Select
                    value={assignments[a.id] ?? a.project_id}
                    onValueChange={(v) => setAssignments((prev) => ({ ...prev, [a.id]: v }))}
                  >
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.is_default ? " (padrão)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep("done")} disabled={saving}>
                Pular
              </Button>
              <Button onClick={submitAssignments} disabled={saving}>
                {saving ? "Salvando…" : "Concluir"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card className="bg-emerald-50/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <CardTitle className="text-emerald-800">Tudo pronto!</CardTitle>
            </div>
            <CardDescription className="text-emerald-700">
              Usuário: {metaUserName}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {apiKey && (
              <div className="rounded-lg bg-white p-4">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    Sua chave de API (guarde em local seguro, exibida só uma vez):
                  </p>
                  <Button variant="ghost" size="sm" onClick={copyApiKey} className="h-7 px-2">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
                <code className="block select-all break-all font-mono text-sm">{apiKey}</code>
              </div>
            )}
            <Button onClick={finish} className="w-full">
              Ir para a organização
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepDot({
  active,
  done,
  label,
  muted,
}: {
  active: boolean;
  done: boolean;
  label: string;
  muted?: boolean;
}) {
  const color = done
    ? "text-emerald-600 font-medium"
    : active
      ? "text-foreground font-medium"
      : muted
        ? "text-muted-foreground/50"
        : "text-muted-foreground";
  return <span className={color}>{label}</span>;
}
