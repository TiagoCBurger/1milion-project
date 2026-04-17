"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type IntegrationsTopNavActive = "hub" | "meta" | "google" | "mcp";

export function IntegrationsTopNav({
  slug,
  active,
}: {
  slug: string;
  active: IntegrationsTopNavActive;
}) {
  const base = "rounded-lg px-3 py-2 text-sm transition-colors";
  const inactive = "text-muted-foreground hover:bg-muted/80 hover:text-foreground";
  const current = "bg-card font-medium text-foreground shadow-sm ring-1 ring-border/60";

  return (
    <div className="shrink-0 border-b border-border/40 bg-muted/15">
      <nav className="mx-auto flex max-w-5xl flex-wrap gap-1 px-6 py-2" aria-label="Seções de integrações">
        <Link
          href={`/dashboard/${slug}/integrations`}
          className={cn(base, active === "hub" ? current : inactive)}
        >
          Visão geral
        </Link>
        <Link
          href={`/dashboard/${slug}/integrations/meta`}
          className={cn(base, active === "meta" ? current : inactive)}
        >
          Meta Ads
        </Link>
        <Link
          href={`/dashboard/${slug}/integrations/google`}
          className={cn(base, "inline-flex items-center gap-1.5", active === "google" ? current : inactive)}
        >
          Google
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Em breve
          </span>
        </Link>
        <Link
          href={`/dashboard/${slug}/integrations/mcp`}
          className={cn(base, active === "mcp" ? current : inactive)}
        >
          Conexões MCP
        </Link>
      </nav>
    </div>
  );
}
