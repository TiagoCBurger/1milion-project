"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Organization = {
  id: string;
  name: string;
  slug: string;
  meta_business_name: string | null;
};

interface Props {
  organization: Organization;
  canManage: boolean;
  isOwner: boolean;
}

export function OrganizationSettingsForm({
  organization,
  canManage,
  isOwner,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSuccess(null);
    const res = await fetch(`/api/organizations/${organization.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, slug }),
    });
    if (!res.ok) {
      const { error: msg } = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(msg ?? "Erro ao salvar.");
      return;
    }
    setSuccess("Alterações salvas.");
    if (slug !== organization.slug) {
      router.push(`/dashboard/${slug}/settings`);
    } else {
      router.refresh();
    }
  }

  async function deleteOrg() {
    if (
      !window.confirm(
        `Deletar a organização "${organization.name}"? Esta ação é permanente e remove todos os projetos, assinaturas, conexões e dados relacionados.`,
      )
    ) {
      return;
    }
    setError(null);
    const res = await fetch(`/api/organizations/${organization.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const { error: msg } = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(msg ?? "Erro ao deletar.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Informações</CardTitle>
          <CardDescription>Nome exibido e slug usado na URL.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManage}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              className="font-mono"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={!canManage}
            />
            <p className="text-xs text-muted-foreground">
              Identificador usado na URL — apenas minúsculas, números e hífens.
            </p>
          </div>
          {organization.meta_business_name ? (
            <div className="space-y-2">
              <Label>Business Manager conectado</Label>
              <p className="text-sm text-muted-foreground">
                {organization.meta_business_name}
              </p>
            </div>
          ) : null}
          {canManage ? (
            <div className="pt-2">
              <Button onClick={() => startSave(save)} disabled={saving}>
                {saving ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Peça a um proprietário ou administrador para alterar estes dados.
            </p>
          )}
        </CardContent>
      </Card>

      {isOwner ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Zona de risco</CardTitle>
            <CardDescription>
              Deletar a organização remove todos os dados relacionados — não
              pode ser desfeito.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={deleteOrg}>
              Deletar organização
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
