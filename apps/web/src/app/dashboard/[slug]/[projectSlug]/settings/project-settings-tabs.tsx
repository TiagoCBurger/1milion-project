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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdAccountToggle } from "@/app/dashboard/[slug]/ad-account-toggle";

type Project = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_default: boolean;
};

type AdAccount = {
  id: string;
  meta_account_id: string;
  name: string;
  currency: string | null;
  is_enabled: boolean;
  project_id: string;
};

type Site = {
  id: string;
  domain: string;
  name: string | null;
  is_active: boolean;
  project_id: string;
};

type ProjectRef = {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
};

export function ProjectSettingsTabs(props: {
  organizationId: string;
  orgSlug: string;
  project: Project;
  adAccounts: AdAccount[];
  sites: Site[];
  projects: ProjectRef[];
}) {
  const { organizationId, orgSlug, project, adAccounts, sites, projects } = props;
  const router = useRouter();

  const inProject = (id: string, projectId: string) => projectId === project.id;
  const accountsHere = adAccounts.filter((a) => inProject(a.id, a.project_id));
  const accountsElsewhere = adAccounts.filter((a) => !inProject(a.id, a.project_id));
  const sitesHere = sites.filter((s) => inProject(s.id, s.project_id));
  const sitesElsewhere = sites.filter((s) => !inProject(s.id, s.project_id));

  return (
    <Tabs defaultValue="general" className="space-y-4">
      <TabsList>
        <TabsTrigger value="general">Geral</TabsTrigger>
        <TabsTrigger value="ad_accounts">
          Contas de anúncio ({accountsHere.length})
        </TabsTrigger>
        <TabsTrigger value="sites">Sites ({sitesHere.length})</TabsTrigger>
        <TabsTrigger value="danger" className="text-destructive">
          Perigo
        </TabsTrigger>
      </TabsList>

      <TabsContent value="general">
        <GeneralForm
          organizationId={organizationId}
          project={project}
          onSaved={() => router.refresh()}
        />
      </TabsContent>

      <TabsContent value="ad_accounts">
        <ResourceSection
          title="Contas atribuídas a este projeto"
          organizationId={organizationId}
          projectId={project.id}
          kind="ad_accounts"
          here={accountsHere.map((a) => ({
            id: a.id,
            primary: a.name,
            secondary: a.meta_account_id,
            projectId: a.project_id,
            isEnabled: a.is_enabled,
          }))}
          elsewhere={accountsElsewhere.map((a) => ({
            id: a.id,
            primary: a.name,
            secondary: a.meta_account_id,
            projectId: a.project_id,
            isEnabled: a.is_enabled,
          }))}
          projects={projects}
        />
      </TabsContent>

      <TabsContent value="sites">
        <ResourceSection
          title="Sites atribuídos a este projeto"
          organizationId={organizationId}
          projectId={project.id}
          kind="sites"
          here={sitesHere.map((s) => ({
            id: s.id,
            primary: s.name ?? s.domain,
            secondary: s.domain,
            projectId: s.project_id,
          }))}
          elsewhere={sitesElsewhere.map((s) => ({
            id: s.id,
            primary: s.name ?? s.domain,
            secondary: s.domain,
            projectId: s.project_id,
          }))}
          projects={projects}
        />
      </TabsContent>

      <TabsContent value="danger">
        <DangerZone
          organizationId={organizationId}
          orgSlug={orgSlug}
          project={project}
          projects={projects}
        />
      </TabsContent>
    </Tabs>
  );
}

function GeneralForm({
  organizationId,
  project,
  onSaved,
}: {
  organizationId: string;
  project: Project;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [slug, setSlug] = useState(project.slug);
  const [description, setDescription] = useState(project.description ?? "");
  const [saving, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const res = await fetch(
      `/api/organizations/${organizationId}/projects/${project.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, slug, description: description || null }),
      }
    );
    if (!res.ok) {
      const { error: msg } = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(msg ?? "Erro ao salvar.");
      return;
    }
    onSaved();
  }

  async function makeDefault() {
    const res = await fetch(
      `/api/organizations/${organizationId}/projects/${project.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_default: true }),
      }
    );
    if (!res.ok) {
      const { error: msg } = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(msg ?? "Erro ao marcar como padrão.");
      return;
    }
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informações do projeto</CardTitle>
        <CardDescription>Nome, slug e descrição.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Descrição</Label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center justify-between pt-2">
          <div>
            {project.is_default ? (
              <p className="text-xs text-muted-foreground">
                Este é o projeto padrão da organização.
              </p>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startTransition(makeDefault)}
              >
                Marcar como padrão
              </Button>
            )}
          </div>
          <Button onClick={() => startTransition(save)} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type ResourceItem = {
  id: string;
  primary: string;
  secondary: string;
  projectId: string;
  isEnabled?: boolean;
};

function ResourceSection(props: {
  title: string;
  organizationId: string;
  projectId: string;
  kind: "ad_accounts" | "sites";
  here: ResourceItem[];
  elsewhere: ResourceItem[];
  projects: ProjectRef[];
}) {
  const { title, organizationId, projectId, kind, here, elsewhere, projects } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function move(resourceIds: string[], toProjectId: string) {
    const key = kind === "ad_accounts" ? "account_ids" : "site_ids";
    const res = await fetch(
      `/api/organizations/${organizationId}/projects/${toProjectId}/${kind === "ad_accounts" ? "ad-accounts" : "sites"}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [key]: resourceIds }),
      }
    );
    if (!res.ok) {
      const { error: msg } = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(msg ?? "Erro ao mover.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Somente recursos deste projeto aparecem no dashboard, analytics e MCP
            quando você está dentro dele.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {here.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item.</p>
          ) : (
            <ul className="divide-y">
              {here.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.primary}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {r.secondary}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {kind === "ad_accounts" && r.isEnabled !== undefined ? (
                      <AdAccountToggle
                        organizationId={organizationId}
                        accountId={r.id}
                        enabled={r.isEnabled}
                      />
                    ) : null}
                    <MoveControl
                      currentProjectId={projectId}
                      projects={projects}
                      disabled={pending}
                      onMove={(target) => startTransition(() => move([r.id], target))}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Disponíveis em outros projetos</CardTitle>
          <CardDescription>
            Clique para trazer para este projeto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {elsewhere.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum recurso disponível em outros projetos.
            </p>
          ) : (
            <ul className="divide-y">
              {elsewhere.map((r) => {
                const currentProject = projects.find((p) => p.id === r.projectId);
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {r.primary}
                        {kind === "ad_accounts" && r.isEnabled === false ? (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                            inativa
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.secondary}
                        {currentProject ? ` · em ${currentProject.name}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        startTransition(() => move([r.id], projectId))
                      }
                    >
                      Mover para cá
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MoveControl({
  currentProjectId,
  projects,
  disabled,
  onMove,
}: {
  currentProjectId: string;
  projects: ProjectRef[];
  disabled: boolean;
  onMove: (projectId: string) => void;
}) {
  const others = projects.filter((p) => p.id !== currentProjectId);
  return (
    <Select onValueChange={onMove} disabled={disabled || others.length === 0}>
      <SelectTrigger className="w-44">
        <SelectValue placeholder="Mover para…" />
      </SelectTrigger>
      <SelectContent>
        {others.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DangerZone({
  organizationId,
  orgSlug,
  project,
  projects,
}: {
  organizationId: string;
  orgSlug: string;
  project: Project;
  projects: ProjectRef[];
}) {
  const router = useRouter();
  const [reassignTo, setReassignTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (project.is_default) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Projeto padrão</CardTitle>
          <CardDescription>
            O projeto padrão não pode ser deletado. Marque outro projeto como
            padrão antes de deletar este.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const others = projects.filter((p) => p.id !== project.id);

  async function doDelete() {
    setError(null);
    const url = new URL(
      `/api/organizations/${organizationId}/projects/${project.id}`,
      window.location.origin
    );
    if (reassignTo) url.searchParams.set("reassign_to", reassignTo);
    const res = await fetch(url.toString(), {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const { error: msg } = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(msg ?? "Erro ao deletar projeto.");
      return;
    }
    router.push(`/dashboard/${orgSlug}/projects`);
    router.refresh();
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Deletar projeto</CardTitle>
        <CardDescription>
          Esta ação não pode ser desfeita. Se o projeto tem contas ou sites, você
          precisa escolher um projeto destino para realocá-los.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <Label>Mover recursos para</Label>
          <Select onValueChange={setReassignTo}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Nenhum (só permitido se projeto estiver vazio)" />
            </SelectTrigger>
            <SelectContent>
              {others.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.is_default ? " (padrão)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="destructive"
          onClick={() => {
            if (window.confirm(`Deletar ${project.name}? Esta ação é permanente.`)) {
              void doDelete();
            }
          }}
        >
          Deletar projeto
        </Button>
      </CardContent>
    </Card>
  );
}

