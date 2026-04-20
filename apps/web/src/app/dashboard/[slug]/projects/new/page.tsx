"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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

export default function NewProjectPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const orgSlug = params.slug;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Resolve organization id from slug (the /api/organizations/[id]/* routes expect a UUID).
    const orgInfoRes = await fetch(`/api/organizations/by-slug/${encodeURIComponent(orgSlug)}`, {
      credentials: "include",
    });
    if (!orgInfoRes.ok) {
      setError("Não foi possível resolver a organização. Recarregue a página.");
      setLoading(false);
      return;
    }
    const info = (await orgInfoRes.json()) as { organization?: { id?: string } };
    const organizationId = info.organization?.id ?? null;
    if (!organizationId) {
      setError("Organização não encontrada.");
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/organizations/${organizationId}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, slug, description: description || null }),
    });

    if (!res.ok) {
      const { error: msg } = (await res.json().catch(() => ({}))) as { error?: string };
      setError(msg ?? "Erro ao criar projeto");
      setLoading(false);
      return;
    }

    const project = (await res.json()) as { slug: string };
    router.refresh();
    router.push(`/dashboard/${orgSlug}/${project.slug}/settings`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 px-6 py-8">
      <Link
        href={`/dashboard/${orgSlug}/projects`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Projetos
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Novo projeto</CardTitle>
          <CardDescription>
            Depois de criar, adicione contas de anúncio e sites na aba de
            configurações do projeto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Cliente Acme"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                required
                pattern="[a-z0-9-]+"
                className="font-mono"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="cliente-acme"
              />
              <p className="text-xs text-muted-foreground">
                Usado na URL do dashboard e do MCP.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contexto do projeto, links úteis, quem é o responsável…"
                rows={3}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Criando…" : "Criar projeto"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
