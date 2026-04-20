"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreateOrgRow = {
  organization_id: string;
  default_project_id: string;
  default_project_slug: string;
};

export default function NewOrganizationPage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function handleNameChange(value: string) {
    setName(value);
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc("create_organization", {
      p_user_id: user.id,
      p_name: name,
      p_slug: slug,
    });

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as CreateOrgRow | null;
    const projectSlug = result?.default_project_slug ?? "default";

    router.refresh();
    router.push(`/dashboard/${slug}/${projectSlug}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border/30">
        <div className="mx-auto max-w-5xl flex items-center px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Criar organização</CardTitle>
            <CardDescription>
              Cada organização centraliza assinatura, membros, conexões MCP e
              seus projetos (contas de anúncio + sites).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Nome da organização</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  placeholder="Minha Agência"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  pattern="[a-z0-9-]+"
                  className="font-mono"
                  placeholder="minha-agencia"
                />
                <p className="text-xs text-muted-foreground">
                  Identificador usado na URL (letras minúsculas, sem espaços).
                </p>
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Criando…" : "Criar organização"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Um projeto &quot;Default&quot; é criado automaticamente; novos projetos
                podem ser adicionados depois pelo seletor no menu lateral.
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
